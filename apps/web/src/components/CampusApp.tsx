import type {
  AcousticEnvironmentSnapshot,
  PlayerColor,
  PlayerSnapshot,
  ProximityPeerSnapshot,
  ProximitySnapshot,
} from "@ig-campus/contracts";
import { isPlayerColor, pickPlayerColor, sanitizeDisplayName } from "@ig-campus/contracts";
import { PROXIMITY_RADIUS } from "@ig-campus/game-core";
import {
  AudioLines,
  DoorOpen,
  Focus,
  LocateFixed,
  LockKeyhole,
  Map as MapIcon,
  Mic,
  MicOff,
  RadioTower,
  RefreshCw,
  UsersRound,
  Volume2,
} from "lucide-react";
import type Phaser from "phaser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CampusScene } from "../game/CampusScene";
import { createCampusGame } from "../game/createCampusGame";
import { bindMovementKeys } from "../game/input";
import { getCampusServerUrl, joinCampus, sendMovement } from "../lib/campusClient";
import { canToggleMicrophone, mediaStatusLabel } from "../media/mediaState";
import { useCampusMedia } from "./useCampusMedia";

type ConnectionState = "connecting" | "connected" | "offline" | "error";

const STORAGE_KEY = "ig-campus-profile";
const PANEL_UPDATE_INTERVAL_MS = 250;

type LocalProfile = {
  name: string;
  color: PlayerColor;
};

export function CampusApp() {
  const gameHostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const roomRef = useRef<Awaited<ReturnType<typeof joinCampus>> | null>(null);
  const connectAbortRef = useRef<AbortController | null>(null);
  const lastPanelUpdateAtRef = useRef(0);
  const overviewEnabledRef = useRef(false);
  const speakingIdentitiesRef = useRef<readonly string[]>([]);
  const acousticEnvironmentRef = useRef<AcousticEnvironmentSnapshot | null>(null);
  const latestSceneStateRef = useRef<{
    players: PlayerSnapshot[];
    proximity: ProximitySnapshot;
  } | null>(null);

  const [profile, setProfile] = useState<LocalProfile>(() => loadProfile());
  const [nameDraft, setNameDraft] = useState(profile.name);
  const profileRef = useRef(profile);
  const [players, setPlayers] = useState<PlayerSnapshot[]>([]);
  const [proximity, setProximity] = useState<ProximitySnapshot>({
    radius: PROXIMITY_RADIUS,
    peers: [],
  });
  const [selfSessionId, setSelfSessionId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [overviewEnabled, setOverviewEnabled] = useState(false);
  const [acousticEnvironment, setAcousticEnvironment] =
    useState<AcousticEnvironmentSnapshot | null>(null);
  const [acousticAnnouncement, setAcousticAnnouncement] = useState("");
  const campusMedia = useCampusMedia();

  const updateAcousticEnvironment = useCallback(
    (nextEnvironment: AcousticEnvironmentSnapshot | null) => {
      const previousEnvironment = acousticEnvironmentRef.current;
      const previousKey = previousEnvironment
        ? `${previousEnvironment.zoneId ?? "commons"}:${previousEnvironment.mode}:${previousEnvironment.label}`
        : null;
      const nextKey = nextEnvironment
        ? `${nextEnvironment.zoneId ?? "commons"}:${nextEnvironment.mode}:${nextEnvironment.label}`
        : null;

      if (previousKey === nextKey) {
        return;
      }

      acousticEnvironmentRef.current = nextEnvironment;
      setAcousticEnvironment(nextEnvironment);

      if (!previousEnvironment || !nextEnvironment) {
        setAcousticAnnouncement("");
      } else if (previousEnvironment.mode === "open" && nextEnvironment.mode === "private") {
        setAcousticAnnouncement("Você entrou em uma conversa privada.");
      } else if (previousEnvironment.mode === "private" && nextEnvironment.mode === "open") {
        setAcousticAnnouncement("Você voltou para uma área aberta.");
      } else if (
        previousEnvironment.mode === "private" &&
        nextEnvironment.mode === "private" &&
        previousEnvironment.zoneId !== nextEnvironment.zoneId
      ) {
        setAcousticAnnouncement(`Você entrou na conversa privada: ${nextEnvironment.label}.`);
      }
    },
    [],
  );

  const self = useMemo(
    () => players.find((player) => player.sessionId === selfSessionId) ?? null,
    [players, selfSessionId],
  );
  const focusMode = self?.focusMode ?? false;
  const proximityBySessionId = useMemo(
    () => new Map(proximity.peers.map((peer) => [peer.sessionId, peer])),
    [proximity.peers],
  );

  const connect = useCallback(async () => {
    connectAbortRef.current?.abort();
    roomRef.current?.leave();
    roomRef.current = null;
    latestSceneStateRef.current = null;
    updateAcousticEnvironment(null);
    await campusMedia.disconnect();

    const currentScene = getCampusScene(gameRef.current);
    currentScene?.setSelfSessionId(null);
    currentScene?.setSpeakingIdentities([]);
    currentScene?.syncPlayers([], { radius: PROXIMITY_RADIUS, peers: [] });

    const abortController = new AbortController();
    connectAbortRef.current = abortController;
    setConnectionState("connecting");
    lastPanelUpdateAtRef.current = 0;

    try {
      const room = await joinCampus(profileRef.current, abortController.signal);

      if (abortController.signal.aborted) {
        room.leave();
        return;
      }

      roomRef.current = room;
      setSelfSessionId(room.sessionId);
      setConnectionState("connected");
      const scene = getCampusScene(gameRef.current);
      scene?.setSelfSessionId(room.sessionId);
      scene?.setOverview(overviewEnabledRef.current);
      void campusMedia.connect(room.media);

      room.onStateChange((state) => {
        const nextPlayers = [...state.players].sort((a, b) => a.name.localeCompare(b.name));
        latestSceneStateRef.current = {
          players: nextPlayers,
          proximity: state.proximity,
        };
        getCampusScene(gameRef.current)?.syncPlayers(nextPlayers, state.proximity);
        campusMedia.syncSpatialPositions(room.sessionId, nextPlayers);
        campusMedia.syncAcoustics(state.acoustic);
        updateAcousticEnvironment(state.acoustic?.environment ?? null);

        const now = performance.now();

        if (now - lastPanelUpdateAtRef.current >= PANEL_UPDATE_INTERVAL_MS) {
          lastPanelUpdateAtRef.current = now;
          setPlayers(nextPlayers);
          setProximity(state.proximity);
        }
      });

      room.onLeave(() => {
        if (roomRef.current !== room) {
          return;
        }

        roomRef.current = null;
        latestSceneStateRef.current = null;
        setSelfSessionId(null);
        setPlayers([]);
        setProximity({ radius: PROXIMITY_RADIUS, peers: [] });
        updateAcousticEnvironment(null);
        const scene = getCampusScene(gameRef.current);
        scene?.setSelfSessionId(null);
        scene?.setSpeakingIdentities([]);
        scene?.syncPlayers([], { radius: PROXIMITY_RADIUS, peers: [] });
        void campusMedia.disconnect();
        setConnectionState("offline");
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      console.error(error);
      roomRef.current = null;
      updateAcousticEnvironment(null);
      void campusMedia.disconnect();
      setConnectionState("error");
    }
  }, [
    campusMedia.connect,
    campusMedia.disconnect,
    campusMedia.syncAcoustics,
    campusMedia.syncSpatialPositions,
    updateAcousticEnvironment,
  ]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    if (!gameHostRef.current || gameRef.current) {
      return;
    }

    gameRef.current = createCampusGame(gameHostRef.current, (scene) => {
      scene.setSelfSessionId(roomRef.current?.sessionId ?? null);
      scene.setOverview(overviewEnabledRef.current);
      scene.setSpeakingIdentities(speakingIdentitiesRef.current);

      const latestState = latestSceneStateRef.current;

      if (latestState) {
        scene.syncPlayers(latestState.players, latestState.proximity);
      }
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const speakingIdentities = campusMedia.state.speakingIdentities;
    speakingIdentitiesRef.current = speakingIdentities;
    getCampusScene(gameRef.current)?.setSpeakingIdentities(speakingIdentities);
  }, [campusMedia.state.speakingIdentities]);

  useEffect(() => {
    void connect();

    return () => {
      connectAbortRef.current?.abort();
      connectAbortRef.current = null;
      roomRef.current?.leave();
      roomRef.current = null;
      void campusMedia.disconnect();
    };
  }, [campusMedia.disconnect, connect]);

  useEffect(() => {
    return bindMovementKeys((input) => {
      sendMovement(roomRef.current, input);
    });
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !overviewEnabled || !self || isEditableTarget(event.target)) {
        return;
      }

      overviewEnabledRef.current = false;
      setOverviewEnabled(false);
      getCampusScene(gameRef.current)?.setOverview(false);
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [overviewEnabled, self]);

  const handleNameCommit = () => {
    const name = sanitizeDisplayName(nameDraft);
    const nextProfile = {
      ...profile,
      name,
    };

    persistProfile(nextProfile);
    profileRef.current = nextProfile;
    setProfile(nextProfile);
    setNameDraft(name);
    roomRef.current?.updateProfile(nextProfile);
  };

  const handleReconnect = () => {
    overviewEnabledRef.current = false;
    setOverviewEnabled(false);
    getCampusScene(gameRef.current)?.setOverview(false);
    setPlayers([]);
    setProximity({ radius: PROXIMITY_RADIUS, peers: [] });
    updateAcousticEnvironment(null);
    void connect();
  };

  const handleOverviewToggle = () => {
    const nextOverviewEnabled = !overviewEnabled;
    overviewEnabledRef.current = nextOverviewEnabled;
    setOverviewEnabled(nextOverviewEnabled);
    getCampusScene(gameRef.current)?.setOverview(nextOverviewEnabled);
  };

  const handleFocusToggle = async () => {
    const nextFocusMode = !focusMode;
    roomRef.current?.setFocusMode(nextFocusMode);

    if (nextFocusMode) {
      await campusMedia.muteMicrophone();
    }
  };

  return (
    <main className="campus-shell">
      <header className="campus-topbar">
        <div>
          <p className="eyebrow">Inforgeneses</p>
          <h1>Campus</h1>
        </div>

        <div className="topbar-actions">
          <button
            aria-pressed={overviewEnabled}
            className={`camera-button${overviewEnabled ? " camera-button--active" : ""}`}
            onClick={handleOverviewToggle}
            title={
              overviewEnabled ? "Voltar ao acompanhamento do avatar" : "Enquadrar todo o campus"
            }
            type="button"
          >
            {overviewEnabled ? (
              <LocateFixed aria-hidden="true" size={17} />
            ) : (
              <MapIcon aria-hidden="true" size={17} />
            )}
            <span>{overviewEnabled ? "Voltar ao avatar" : "Visão geral"}</span>
          </button>

          <div
            aria-live="polite"
            className={`connection-pill connection-pill--${connectionState}`}
            role="status"
          >
            <RadioTower aria-hidden="true" size={16} />
            <span>{connectionLabel(connectionState)}</span>
          </div>
        </div>
      </header>

      <section className="campus-workspace">
        <div aria-label={getMapDescription(self, proximity)} className="map-frame" role="img">
          <div ref={gameHostRef} className="game-host" />
          {overviewEnabled ? (
            <div className="map-mode-indicator">
              <MapIcon aria-hidden="true" size={14} />
              Campus completo · movimento ativo
            </div>
          ) : null}
        </div>

        <p className="sr-only" aria-live="polite">
          {overviewEnabled
            ? "Visão geral ativada. O movimento do avatar continua disponível."
            : "A câmera voltou a acompanhar seu avatar."}
        </p>

        <aside className="campus-panel" aria-label="Painel do campus">
          <section className="identity-box">
            <div>
              <label className="section-kicker" htmlFor="display-name">
                Sua presença
              </label>
              <input
                autoComplete="off"
                className="name-input"
                id="display-name"
                maxLength={24}
                name="displayName"
                spellCheck={false}
                value={nameDraft}
                onBlur={handleNameCommit}
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }

                  if (event.key === "Escape") {
                    setNameDraft(profile.name);
                    event.currentTarget.blur();
                  }
                }}
              />
            </div>

            <button
              aria-describedby="media-status-description"
              aria-label={microphoneActionLabel(campusMedia.state.status)}
              aria-pressed={campusMedia.state.status === "active"}
              className={`microphone-button microphone-button--${campusMedia.state.status}`}
              disabled={!canToggleMicrophone(campusMedia.state.status)}
              onClick={() => void campusMedia.toggleMicrophone()}
              title={microphoneActionLabel(campusMedia.state.status)}
              type="button"
            >
              {campusMedia.state.status === "active" ? (
                <Mic aria-hidden="true" size={18} />
              ) : (
                <MicOff aria-hidden="true" size={18} />
              )}
              <span>{microphoneControlLabel(campusMedia.state.status)}</span>
            </button>

            <button
              aria-pressed={focusMode}
              className={`focus-button${focusMode ? " focus-button--active" : ""}`}
              disabled={!selfSessionId || connectionState !== "connected"}
              onClick={handleFocusToggle}
              title={focusMode ? "Desativar Cortina de Foco" : "Ativar Cortina de Foco"}
              type="button"
            >
              <Focus aria-hidden="true" size={18} />
              <span>{focusMode ? "Foco ativo" : "Ativar foco"}</span>
            </button>
          </section>

          <section className={`media-card media-card--${campusMedia.state.status}`}>
            <div>
              <h2 className="section-kicker">Áudio espacial</h2>
              <strong aria-live="polite">{mediaStatusLabel(campusMedia.state)}</strong>
              <span id="media-status-description">{mediaHelpText(campusMedia.state.status)}</span>
            </div>
            {campusMedia.state.playbackBlocked ? (
              <button
                className="audio-playback-button"
                onClick={() => void campusMedia.startAudio()}
                type="button"
              >
                <Volume2 aria-hidden="true" size={15} />
                Ativar som
              </button>
            ) : null}
          </section>

          <section
            className={`acoustic-zone-card acoustic-zone-card--${
              acousticEnvironment?.mode ?? "unknown"
            }`}
            aria-label="Ambiente acústico atual"
          >
            <div className="acoustic-zone-card__icon">
              {acousticEnvironment?.mode === "private" ? (
                <LockKeyhole aria-hidden="true" size={17} />
              ) : (
                <DoorOpen aria-hidden="true" size={18} />
              )}
            </div>
            <div>
              <h2 className="section-kicker">Ambiente atual</h2>
              <strong>{acousticEnvironment?.label ?? "Verificando privacidade"}</strong>
              <span>
                {acousticEnvironment
                  ? acousticEnvironment.mode === "private"
                    ? "Conversa privada"
                    : "Área aberta"
                  : "Áudio fechado por segurança"}
              </span>
            </div>
          </section>

          {focusMode ? (
            <section className="focus-card" aria-live="polite">
              <Focus aria-hidden="true" size={17} />
              <div>
                <h2 className="section-kicker">Cortina de Foco</h2>
                <strong>Deep Work ativo</strong>
                <span>Você está protegido de áudio e aproximação.</span>
              </div>
            </section>
          ) : null}

          <p className="sr-only" aria-live="polite">
            {acousticAnnouncement}
          </p>

          <section className="status-card">
            <h2 className="section-kicker">Posição no mapa</h2>
            <strong>{self ? `${Math.round(self.x)}, ${Math.round(self.y)}` : "aguardando"}</strong>
            <span>{getCampusServerUrl()}</span>
          </section>

          <section className="proximity-card" aria-live="polite">
            <div className="proximity-card__icon">
              <AudioLines aria-hidden="true" size={18} />
            </div>
            <div>
              <h2 className="section-kicker">Proximidade visual</h2>
              <strong>{proximityLabel(proximity.peers)}</strong>
              <span>{proximityAudioLabel(campusMedia.state.status)}</span>
            </div>
          </section>

          <section className="people-list">
            <div className="people-list__header">
              <h2 className="section-kicker">Pessoas</h2>
              <span>
                <UsersRound aria-hidden="true" size={14} />
                {players.length}
              </span>
            </div>

            {players.length === 0 ? (
              <p className="empty-state">Conectando ao campus local.</p>
            ) : (
              players.map((player) => {
                const peer = proximityBySessionId.get(player.sessionId);
                const isSpeaking = campusMedia.state.speakingIdentities.includes(player.sessionId);
                const personStatus = getPersonStatus(player, selfSessionId, peer, isSpeaking);
                return (
                  <article
                    aria-label={`${player.name}, ${personStatus}`}
                    className={getPersonClassName(
                      player.sessionId,
                      selfSessionId,
                      peer,
                      isSpeaking,
                      player.focusMode,
                    )}
                    key={player.sessionId}
                  >
                    <span
                      aria-hidden="true"
                      className={`avatar-presence${isSpeaking ? " avatar-presence--speaking" : ""}`}
                    >
                      <span className="avatar-dot" style={{ backgroundColor: player.color }} />
                      {isSpeaking ? <AudioLines size={13} /> : null}
                    </span>
                    <div>
                      <strong>{player.name}</strong>
                      <span>{personStatus}</span>
                    </div>
                  </article>
                );
              })
            )}
          </section>

          <button
            className="reconnect-button"
            disabled={connectionState === "connecting"}
            type="button"
            onClick={handleReconnect}
          >
            <RefreshCw aria-hidden="true" size={16} />
            Reconectar
          </button>
        </aside>
      </section>
      <div aria-hidden="true" className="campus-audio-root" ref={campusMedia.audioRootRef} />
    </main>
  );
}

function microphoneActionLabel(status: Parameters<typeof canToggleMicrophone>[0]): string {
  if (status === "active") {
    return "Mutar microfone";
  }

  if (status === "muted") {
    return "Desmutar microfone";
  }

  if (status === "microphone-off") {
    return "Ativar microfone";
  }

  return mediaStatusLabel({ status, playbackBlocked: false });
}

function microphoneControlLabel(status: Parameters<typeof canToggleMicrophone>[0]): string {
  switch (status) {
    case "active":
      return "Ativo";
    case "muted":
      return "Mutado";
    case "microphone-off":
      return "Ativar";
    case "requesting-permission":
      return "Permissão";
    case "connecting":
    case "reconnecting":
      return "Conectando";
    case "privacy-error":
      return "Protegido";
    case "permission-denied":
      return "Bloqueado";
    default:
      return "Indisponível";
  }
}

function mediaHelpText(status: Parameters<typeof canToggleMicrophone>[0]): string {
  switch (status) {
    case "microphone-off":
      return "Clique no microfone quando quiser falar.";
    case "requesting-permission":
      return "Responda à solicitação do navegador.";
    case "active":
      return "Sua voz está sendo transmitida.";
    case "muted":
      return "Você continua na sala, sem transmitir voz.";
    case "permission-denied":
      return "Libere o microfone no navegador e reconecte.";
    case "connecting":
    case "reconnecting":
      return "O mapa continua disponível durante a conexão.";
    case "error":
      return "O mapa continua funcionando. Confira o LiveKit local.";
    case "privacy-error":
      return "Seu microfone foi desligado para proteger a conversa.";
    default:
      return "Inicie a mídia local para conversar.";
  }
}

function proximityAudioLabel(status: Parameters<typeof canToggleMicrophone>[0]): string {
  if (status === "unavailable" || status === "error" || status === "privacy-error") {
    return "A proximidade continua funcionando sem áudio.";
  }

  return "O áudio combina ambiente e distância.";
}

function getCampusScene(game: Phaser.Game | null): CampusScene | null {
  if (!game) {
    return null;
  }

  const scene = game.scene.getScene("CampusScene");
  return scene instanceof CampusScene ? scene : null;
}

function loadProfile(): LocalProfile {
  const fallbackName = `Dev ${Math.floor(1000 + Math.random() * 9000)}`;
  const fallback = {
    name: fallbackName,
    color: pickPlayerColor(fallbackName),
  };

  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    persistProfile(fallback);
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    const name = sanitizeDisplayName(parsed.name);
    return {
      name,
      color: isPlayerColor(parsed.color) ? parsed.color : pickPlayerColor(name),
    };
  } catch {
    persistProfile(fallback);
    return fallback;
  }
}

function persistProfile(profile: LocalProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

function connectionLabel(state: ConnectionState): string {
  if (state === "connected") {
    return "conectado";
  }

  if (state === "connecting") {
    return "conectando";
  }

  if (state === "offline") {
    return "offline";
  }

  return "erro";
}

function proximityLabel(peers: ProximityPeerSnapshot[]): string {
  if (peers.length === 0) {
    return "Ninguém no alcance";
  }

  if (peers.length === 1) {
    return "1 pessoa no alcance";
  }

  return `${peers.length} pessoas no alcance`;
}

function getPersonClassName(
  sessionId: string,
  selfSessionId: string | null,
  peer?: ProximityPeerSnapshot,
  isSpeaking = false,
  focusMode = false,
): string {
  const speakingClass = isSpeaking ? " person--speaking" : "";
  const focusClass = focusMode ? " person--focus" : "";

  if (sessionId === selfSessionId) {
    return `person person--self${focusClass}${speakingClass}`;
  }

  return peer
    ? `person person--${peer.band}${focusClass}${speakingClass}`
    : `person${focusClass}${speakingClass}`;
}

function getPersonStatus(
  player: PlayerSnapshot,
  selfSessionId: string | null,
  peer?: ProximityPeerSnapshot,
  isSpeaking = false,
): string {
  if (player.focusMode) {
    return "em foco · áudio fechado";
  }

  if (player.sessionId === selfSessionId) {
    const localStatus = player.moving ? "você · andando" : "você";
    return isSpeaking ? `${localStatus} · falando agora` : localStatus;
  }

  if (!peer) {
    return isSpeaking ? "falando agora · fora do alcance" : "fora do alcance";
  }

  const meters = Math.max(1, Math.round(peer.distance / 32));
  const proximityStatus = `${peer.band === "close" ? "perto" : "no alcance"} · ${meters} m`;
  return isSpeaking ? `falando agora · ${proximityStatus}` : proximityStatus;
}

function getMapDescription(self: PlayerSnapshot | null, proximity: ProximitySnapshot): string {
  if (!self) {
    return "Mapa do Campus Inforgeneses carregando.";
  }

  return `Mapa do Campus. Você está na posição ${Math.round(self.x)}, ${Math.round(self.y)}. ${proximityLabel(proximity.peers)}.`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
