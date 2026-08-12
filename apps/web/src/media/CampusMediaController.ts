import type { AcousticSnapshot, MediaAccessSnapshot } from "@ig-campus/contracts";
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

type StateListener = (state: CampusMediaState) => void;

export class CampusMediaController {
  private room: Room | null = null;
  private allowedIdentities = new Set<string>();
  private allowedFingerprint = "[]";
  private desiredGains = new Map<string, number>();
  private unsubscribeTimers = new Map<string, number>();
  private lastAcousticRevision = -1;
  private mediaConnected = false;
  private privacyFailed = false;
  private generation = 0;
  private disconnecting = false;
  private state: CampusMediaState = {
    status: "unavailable",
    playbackBlocked: false,
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

    const room = this.room;

    if (!room || !this.mediaConnected) {
      return;
    }

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

  async toggleMicrophone(): Promise<void> {
    const room = this.room;

    if (!room) {
      return;
    }

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
      this.setState({
        status: enable ? "active" : "muted",
        playbackBlocked: !room.canPlaybackAudio,
      });
    } catch (error) {
      console.warn("Não foi possível alterar o microfone.", error);
      this.setState({ status: "error", playbackBlocked: !room.canPlaybackAudio });
    }
  }

  async startAudio(): Promise<void> {
    const room = this.room;

    if (!room) {
      return;
    }

    try {
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
    this.lastAcousticRevision = -1;
    this.mediaConnected = false;
    this.privacyFailed = false;
    this.removeAudioElements();
    const room = this.room;
    this.room = null;

    if (room) {
      room.removeAllListeners();
      await room.disconnect();
    }

    this.disconnecting = false;
    this.setState({ status: "unavailable", playbackBlocked: false });
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
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        this.clearUnsubscribeTimer(participant.identity);
        this.desiredGains.delete(participant.identity);
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
    participant.setVolume(gain, Track.Source.Microphone);

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
    participant.setVolume(
      this.desiredGains.get(participant.identity) ?? 0,
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

    this.setState({ status: "privacy-error", playbackBlocked: !room.canPlaybackAudio });

    if (disconnectMedia) {
      this.mediaConnected = false;
      this.room = null;
      room.removeAllListeners();
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
    for (const element of track.detach()) {
      element.remove();
    }
  }

  private removeAudioElements(): void {
    this.getAudioRoot()?.replaceChildren();
  }

  private setState(state: CampusMediaState): void {
    this.state = state;
    this.onStateChange(state);
  }
}
