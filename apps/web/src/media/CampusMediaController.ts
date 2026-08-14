import type { AcousticSnapshot, MediaAccessSnapshot, PlayerSnapshot } from "@ig-campus/contracts";
import {
  MediaDeviceFailure,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { buildAcousticMediaPlan } from "./acousticMediaPolicy";
import type { CampusMediaState } from "./mediaState";
import { AUDIO_UNSUBSCRIBE_DELAY_MS } from "./proximityAudioPolicy";
import { buildSpatialPanByIdentity, filterVisibleSpeakingIdentities } from "./spatialAudioPolicy";

type StateListener = (state: CampusMediaState) => void;

type SpatialAudioGraph = {
  gain: GainNode;
  identity: string;
  panner: StereoPannerNode | null;
  source: MediaElementAudioSourceNode;
};

export class CampusMediaController {
  private room: Room | null = null;
  private allowedIdentities = new Set<string>();
  private allowedFingerprint = "[]";
  private desiredGains = new Map<string, number>();
  private desiredPans = new Map<string, number>();
  private detectedSpeakingIdentities = new Set<string>();
  private unsubscribeTimers = new Map<string, number>();
  private trackElements = new Map<RemoteTrack, HTMLMediaElement>();
  private spatialAudioGraphs = new Map<RemoteTrack, SpatialAudioGraph>();
  private audioContext: AudioContext | null = null;
  private removeSpatialAudioUnlockListeners: (() => void) | null = null;
  private lastAcousticRevision = -1;
  private mediaConnected = false;
  private privacyFailed = false;
  private generation = 0;
  private disconnecting = false;
  private state: CampusMediaState = {
    status: "unavailable",
    playbackBlocked: false,
    speakingIdentities: [],
  };

  constructor(
    private readonly onStateChange: StateListener,
    private readonly getAudioRoot: () => HTMLElement | null,
  ) {}

  async connect(access: MediaAccessSnapshot): Promise<void> {
    await this.disconnect();

    if (!access.available) {
      this.setState({
        status: access.reason === "not_configured" ? "unavailable" : "error",
        playbackBlocked: false,
      });
      return;
    }

    const generation = ++this.generation;
    const room = new Room({
      adaptiveStream: false,
      dynacast: false,
      disconnectOnPageLeave: true,
      audioCaptureDefaults: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    this.room = room;
    this.disconnecting = false;
    this.bindRoomEvents(room);
    this.setState({ status: "connecting", playbackBlocked: false });

    try {
      await room.connect(access.serverUrl, access.accessToken, { autoSubscribe: false });

      if (generation !== this.generation || this.room !== room) {
        await room.disconnect();
        return;
      }

      this.setState({
        status: "microphone-off",
        playbackBlocked: !room.canPlaybackAudio,
      });
      this.mediaConnected = true;
      this.installSpatialAudioUnlock();

      if (!this.applyPublisherPermissions(room)) {
        return;
      }

      this.applyAcousticsToAllParticipants();
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }

      if (this.room === room) {
        this.room = null;
      }
      this.mediaConnected = false;
      room.removeAllListeners();
      await room.disconnect();
      console.warn("Não foi possível conectar o áudio local.", error);
      this.setState({ status: "error", playbackBlocked: false });
    }
  }

  syncAcoustics(snapshot: AcousticSnapshot | null): void {
    const plan = buildAcousticMediaPlan(
      snapshot,
      this.lastAcousticRevision,
      this.allowedIdentities,
    );

    if (!plan) {
      return;
    }

    if (plan.revision !== null) {
      this.lastAcousticRevision = plan.revision;
    }

    const permissionsChanged = plan.allowedFingerprint !== this.allowedFingerprint;
    this.allowedIdentities = new Set(plan.allowedIdentities);
    this.allowedFingerprint = plan.allowedFingerprint;
    this.desiredGains = plan.desiredGains;
    this.privacyFailed = plan.failClosed;

    for (const identity of plan.immediatelyBlockedIdentities) {
      this.setSpatialGain(identity, 0, true);
    }

    if (plan.failClosed) {
      this.muteAllSpatialGraphsImmediately();
    } else {
      this.applySpatialAudioParameters();
    }

    const room = this.room;

    if (!room || !this.mediaConnected) {
      return;
    }

    this.refreshSpeakingState(room);

    if (permissionsChanged && !this.applyPublisherPermissions(room)) {
      return;
    }

    for (const identity of plan.immediatelyBlockedIdentities) {
      const participant = room.remoteParticipants.get(identity);

      if (participant) {
        this.unsubscribeImmediately(participant);
      }
    }

    if (plan.failClosed) {
      this.enterPrivacyFailure(room);
      return;
    }

    if (this.state.status === "privacy-error") {
      this.setState({ status: "microphone-off", playbackBlocked: !room.canPlaybackAudio });
    }

    this.applyAcousticsToAllParticipants();
  }

  syncSpatialPositions(selfSessionId: string | null, players: readonly PlayerSnapshot[]): void {
    this.desiredPans = buildSpatialPanByIdentity(selfSessionId, players);
    this.applySpatialAudioParameters();
  }

  async toggleMicrophone(): Promise<void> {
    const room = this.room;

    if (!room) {
      return;
    }

    await this.enableSpatialAudio();

    if (this.state.status === "microphone-off") {
      this.setState({ ...this.state, status: "requesting-permission" });

      try {
        if (!this.applyPublisherPermissions(room)) {
          return;
        }

        await room.localParticipant.setMicrophoneEnabled(true);
        this.setState({
          status: room.localParticipant.isMicrophoneEnabled ? "active" : "error",
          playbackBlocked: !room.canPlaybackAudio,
        });
      } catch (error) {
        const failure = MediaDeviceFailure.getFailure(error);
        this.setState({
          status: failure === MediaDeviceFailure.PermissionDenied ? "permission-denied" : "error",
          playbackBlocked: !room.canPlaybackAudio,
        });
      }
      return;
    }

    if (this.state.status !== "active" && this.state.status !== "muted") {
      return;
    }

    const enable = this.state.status === "muted";

    try {
      await room.localParticipant.setMicrophoneEnabled(enable);
      if (!enable) {
        this.detectedSpeakingIdentities.delete(room.localParticipant.identity);
        this.refreshSpeakingState(room);
      }
      this.setState({
        status: enable ? "active" : "muted",
        playbackBlocked: !room.canPlaybackAudio,
      });
    } catch (error) {
      console.warn("Não foi possível alterar o microfone.", error);
      this.setState({ status: "error", playbackBlocked: !room.canPlaybackAudio });
    }
  }

  async muteMicrophone(): Promise<void> {
    const room = this.room;

    if (!room?.localParticipant.isMicrophoneEnabled) {
      return;
    }

    try {
      await room.localParticipant.setMicrophoneEnabled(false);
      this.detectedSpeakingIdentities.delete(room.localParticipant.identity);
      this.refreshSpeakingState(room);
      this.setState({ status: "muted", playbackBlocked: !room.canPlaybackAudio });
    } catch (error) {
      console.warn("NÃ£o foi possÃ­vel mutar o microfone ao ativar o foco.", error);
    }
  }

  async startAudio(): Promise<void> {
    const room = this.room;

    if (!room) {
      return;
    }

    try {
      await this.enableSpatialAudio();
      await room.startAudio();
      this.setState({ ...this.state, playbackBlocked: !room.canPlaybackAudio });
    } catch (error) {
      console.warn("O navegador ainda bloqueou a reprodução de áudio.", error);
      this.setState({ ...this.state, playbackBlocked: true });
    }
  }

  async disconnect(): Promise<void> {
    this.generation += 1;
    this.disconnecting = true;
    this.clearUnsubscribeTimers();
    this.allowedIdentities.clear();
    this.allowedFingerprint = "[]";
    this.desiredGains.clear();
    this.desiredPans.clear();
    this.detectedSpeakingIdentities.clear();
    this.lastAcousticRevision = -1;
    this.mediaConnected = false;
    this.privacyFailed = false;
    await this.resetSpatialAudio();
    this.removeAudioElements();
    const room = this.room;
    this.room = null;

    if (room) {
      room.removeAllListeners();
      await room.disconnect();
    }

    this.disconnecting = false;
    this.setState({
      status: "unavailable",
      playbackBlocked: false,
      speakingIdentities: [],
    });
  }

  private bindRoomEvents(room: Room): void {
    room
      .on(RoomEvent.ParticipantConnected, (participant) => {
        this.applyAcoustics(participant);
      })
      .on(RoomEvent.TrackPublished, (_publication, participant) => {
        this.applyAcoustics(participant);
      })
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        this.handleTrackSubscribed(track, publication, participant);
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        this.detachTrack(track);
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        this.detectedSpeakingIdentities = new Set(
          speakers.filter((participant) => participant.isSpeaking).map(({ identity }) => identity),
        );
        this.refreshSpeakingState(room);
      })
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        this.clearUnsubscribeTimer(participant.identity);
        this.desiredGains.delete(participant.identity);
        this.desiredPans.delete(participant.identity);
        this.detectedSpeakingIdentities.delete(participant.identity);
        this.refreshSpeakingState(room);
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        this.setState({ ...this.state, playbackBlocked: !room.canPlaybackAudio });
      })
      .on(RoomEvent.Reconnecting, () => {
        this.mediaConnected = false;
        this.setState({ ...this.state, status: "reconnecting" });
      })
      .on(RoomEvent.Reconnected, () => {
        this.mediaConnected = true;
        this.installSpatialAudioUnlock();

        if (this.applyPublisherPermissions(room)) {
          this.setState({
            status: this.privacyFailed
              ? "privacy-error"
              : room.localParticipant.isMicrophoneEnabled
                ? "active"
                : "microphone-off",
            playbackBlocked: !room.canPlaybackAudio,
          });
          this.applyAcousticsToAllParticipants();
        }
      })
      .on(RoomEvent.Disconnected, () => {
        this.mediaConnected = false;
        this.detectedSpeakingIdentities.clear();
        this.setState({ speakingIdentities: [] });
        if (!this.disconnecting && this.room === room) {
          this.setState({ status: "error", playbackBlocked: false });
        }
      });
  }

  private applyAcousticsToAllParticipants(): void {
    const room = this.room;

    if (!room) {
      return;
    }

    for (const participant of room.remoteParticipants.values()) {
      this.applyAcoustics(participant);
    }
  }

  private applyAcoustics(participant: RemoteParticipant): void {
    if (!this.allowedIdentities.has(participant.identity)) {
      this.unsubscribeImmediately(participant);
      return;
    }

    const gain = this.desiredGains.get(participant.identity) ?? 0;
    participant.setVolume(
      this.hasSpatialGraphForIdentity(participant.identity) ? 1 : gain,
      Track.Source.Microphone,
    );

    for (const publication of participant.audioTrackPublications.values()) {
      if (publication.source !== Track.Source.Microphone) {
        publication.setSubscribed(false);
        continue;
      }

      if (gain > 0) {
        this.clearUnsubscribeTimer(participant.identity);
        publication.setSubscribed(true);
      } else if (publication.isSubscribed || publication.isDesired) {
        this.scheduleUnsubscribe(participant);
      }
    }
  }

  private handleTrackSubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ): void {
    if (
      track.kind !== Track.Kind.Audio ||
      publication.source !== Track.Source.Microphone ||
      !this.allowedIdentities.has(participant.identity)
    ) {
      publication.setSubscribed(false);
      return;
    }

    const element = track.attach();
    element.autoplay = true;
    element.dataset.campusMediaParticipant = participant.identity;
    element.className = "campus-remote-audio";
    this.getAudioRoot()?.append(element);
    this.trackElements.set(track, element);
    this.routeTrackThroughSpatialAudio(track, element, participant.identity);
    participant.setVolume(
      this.spatialAudioGraphs.has(track) ? 1 : (this.desiredGains.get(participant.identity) ?? 0),
      Track.Source.Microphone,
    );
  }

  private scheduleUnsubscribe(participant: RemoteParticipant): void {
    if (this.unsubscribeTimers.has(participant.identity)) {
      return;
    }

    const timer = window.setTimeout(() => {
      this.unsubscribeTimers.delete(participant.identity);

      if (
        this.allowedIdentities.has(participant.identity) &&
        (this.desiredGains.get(participant.identity) ?? 0) > 0
      ) {
        return;
      }

      for (const publication of participant.audioTrackPublications.values()) {
        if (publication.source === Track.Source.Microphone) {
          publication.setSubscribed(false);
        }
      }
    }, AUDIO_UNSUBSCRIBE_DELAY_MS);
    this.unsubscribeTimers.set(participant.identity, timer);
  }

  private unsubscribeImmediately(participant: RemoteParticipant): void {
    this.clearUnsubscribeTimer(participant.identity);
    this.setSpatialGain(participant.identity, 0, true);
    participant.setVolume(0, Track.Source.Microphone);

    for (const publication of participant.audioTrackPublications.values()) {
      if (publication.source === Track.Source.Microphone) {
        publication.setSubscribed(false);
      }
    }
  }

  private applyPublisherPermissions(room: Room): boolean {
    try {
      room.localParticipant.setTrackSubscriptionPermissions(
        false,
        [...this.allowedIdentities].sort().map((participantIdentity) => ({
          participantIdentity,
          allowAll: true,
        })),
      );
      return true;
    } catch (error) {
      console.warn("Não foi possível proteger a conversa atual.", error);
      this.enterPrivacyFailure(room, true);
      return false;
    }
  }

  private enterPrivacyFailure(room: Room, disconnectMedia = false): void {
    this.privacyFailed = true;
    this.allowedIdentities.clear();
    this.allowedFingerprint = "[]";
    this.desiredGains.clear();
    this.detectedSpeakingIdentities.clear();
    this.muteAllSpatialGraphsImmediately();
    this.clearUnsubscribeTimers();

    try {
      room.localParticipant.setTrackSubscriptionPermissions(false, []);
    } catch {
      // O microfone também será desligado abaixo: a política permanece fechada.
    }

    for (const participant of room.remoteParticipants.values()) {
      this.unsubscribeImmediately(participant);
    }

    if (room.localParticipant.isMicrophoneEnabled) {
      void room.localParticipant.setMicrophoneEnabled(false).catch((error) => {
        console.warn("Não foi possível desligar o microfone após falha de privacidade.", error);
      });
    }

    this.setState({
      status: "privacy-error",
      playbackBlocked: !room.canPlaybackAudio,
      speakingIdentities: [],
    });

    if (disconnectMedia) {
      this.mediaConnected = false;
      this.room = null;
      room.removeAllListeners();
      void this.resetSpatialAudio();
      this.removeAudioElements();
      void room.disconnect();
    }
  }

  private clearUnsubscribeTimer(identity: string): void {
    const timer = this.unsubscribeTimers.get(identity);

    if (timer !== undefined) {
      window.clearTimeout(timer);
      this.unsubscribeTimers.delete(identity);
    }
  }

  private clearUnsubscribeTimers(): void {
    for (const timer of this.unsubscribeTimers.values()) {
      window.clearTimeout(timer);
    }

    this.unsubscribeTimers.clear();
  }

  private detachTrack(track: RemoteTrack): void {
    this.disconnectSpatialGraph(track);
    this.trackElements.delete(track);

    for (const element of track.detach()) {
      element.remove();
    }
  }

  private removeAudioElements(): void {
    for (const track of this.spatialAudioGraphs.keys()) {
      this.disconnectSpatialGraph(track);
    }

    this.trackElements.clear();
    this.getAudioRoot()?.replaceChildren();
  }

  private refreshSpeakingState(room: Room): void {
    const audibleRemoteIdentities = new Set(
      [...this.allowedIdentities].filter((identity) => (this.desiredGains.get(identity) ?? 0) > 0),
    );
    const speakingIdentities = filterVisibleSpeakingIdentities(
      this.detectedSpeakingIdentities,
      room.localParticipant.identity,
      audibleRemoteIdentities,
    );
    this.setState({ speakingIdentities });
  }

  private installSpatialAudioUnlock(): void {
    if (this.audioContext?.state === "running" || this.removeSpatialAudioUnlockListeners) {
      return;
    }

    const unlock = () => {
      void this.enableSpatialAudio();
    };

    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock, { passive: true });
    this.removeSpatialAudioUnlockListeners = () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
      this.removeSpatialAudioUnlockListeners = null;
    };
  }

  private async enableSpatialAudio(): Promise<void> {
    if (typeof AudioContext === "undefined") {
      this.removeSpatialAudioUnlockListeners?.();
      return;
    }

    try {
      const context = this.audioContext ?? new AudioContext();
      this.audioContext = context;

      if (context.state === "suspended") {
        await context.resume();
      }

      if (context.state !== "running") {
        return;
      }

      this.removeSpatialAudioUnlockListeners?.();

      for (const [track, element] of this.trackElements) {
        const identity = element.dataset.campusMediaParticipant;

        if (identity) {
          this.routeTrackThroughSpatialAudio(track, element, identity);

          if (this.spatialAudioGraphs.has(track)) {
            this.room?.remoteParticipants.get(identity)?.setVolume(1, Track.Source.Microphone);
          }
        }
      }

      this.applySpatialAudioParameters();
    } catch (error) {
      console.warn("O audio estereo nao pode ser ativado neste navegador.", error);
    }
  }

  private routeTrackThroughSpatialAudio(
    track: RemoteTrack,
    element: HTMLMediaElement,
    identity: string,
  ): void {
    const context = this.audioContext;

    if (context?.state !== "running" || this.spatialAudioGraphs.has(track)) {
      return;
    }

    try {
      const source = context.createMediaElementSource(element);
      const gain = context.createGain();
      gain.gain.value = this.desiredGains.get(identity) ?? 0;
      let panner: StereoPannerNode | null = null;

      try {
        panner = context.createStereoPanner();
        panner.pan.value = this.desiredPans.get(identity) ?? 0;
      } catch {
        console.warn("O audio remoto continuara centralizado neste navegador.");
      }

      source.connect(gain);

      if (panner) {
        gain.connect(panner).connect(context.destination);
      } else {
        gain.connect(context.destination);
      }

      this.spatialAudioGraphs.set(track, { gain, identity, panner, source });
    } catch (error) {
      console.warn("O grafo de audio espacial nao pode ser criado neste navegador.", error);
    }
  }

  private applySpatialAudioParameters(): void {
    const context = this.audioContext;

    if (context?.state !== "running") {
      return;
    }

    for (const graph of this.spatialAudioGraphs.values()) {
      graph.gain.gain.setTargetAtTime(
        this.desiredGains.get(graph.identity) ?? 0,
        context.currentTime,
        0.06,
      );
      graph.panner?.pan.setTargetAtTime(
        this.desiredPans.get(graph.identity) ?? 0,
        context.currentTime,
        0.08,
      );
    }
  }

  private setSpatialGain(identity: string, gain: number, immediate = false): void {
    const context = this.audioContext;

    if (context?.state !== "running") {
      return;
    }

    for (const graph of this.spatialAudioGraphs.values()) {
      if (graph.identity !== identity) {
        continue;
      }

      if (immediate) {
        graph.gain.gain.cancelScheduledValues(context.currentTime);
        graph.gain.gain.setValueAtTime(gain, context.currentTime);
      } else {
        graph.gain.gain.setTargetAtTime(gain, context.currentTime, 0.06);
      }
    }
  }

  private muteAllSpatialGraphsImmediately(): void {
    for (const identity of new Set(
      [...this.spatialAudioGraphs.values()].map(({ identity }) => identity),
    )) {
      this.setSpatialGain(identity, 0, true);
    }
  }

  private hasSpatialGraphForIdentity(identity: string): boolean {
    return [...this.spatialAudioGraphs.values()].some((graph) => graph.identity === identity);
  }

  private disconnectSpatialGraph(track: RemoteTrack): void {
    const graph = this.spatialAudioGraphs.get(track);

    if (!graph) {
      return;
    }

    graph.source.disconnect();
    graph.gain.disconnect();
    graph.panner?.disconnect();
    this.spatialAudioGraphs.delete(track);
  }

  private async resetSpatialAudio(): Promise<void> {
    this.removeSpatialAudioUnlockListeners?.();

    for (const track of this.spatialAudioGraphs.keys()) {
      this.disconnectSpatialGraph(track);
    }

    const context = this.audioContext;
    this.audioContext = null;

    if (context && context.state !== "closed") {
      await context.close().catch(() => undefined);
    }
  }

  private setState(patch: Partial<CampusMediaState>): void {
    const nextState = { ...this.state, ...patch };
    const speakingUnchanged =
      nextState.speakingIdentities.length === this.state.speakingIdentities.length &&
      nextState.speakingIdentities.every(
        (identity, index) => identity === this.state.speakingIdentities[index],
      );

    if (
      nextState.status === this.state.status &&
      nextState.playbackBlocked === this.state.playbackBlocked &&
      speakingUnchanged
    ) {
      return;
    }

    this.state = nextState;
    this.onStateChange(nextState);
  }
}
