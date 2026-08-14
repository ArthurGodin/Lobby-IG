import type {
  AcousticEnvironmentSnapshot,
  InteractionRequest,
  PlayerColor,
  PlayerSnapshot,
  ProximityPeerSnapshot,
  ProximitySnapshot,
  ScreenShareSnapshot,
} from "@ig-campus/contracts";
import { isPlayerColor, pickPlayerColor, sanitizeDisplayName } from "@ig-campus/contracts";
import { PROXIMITY_RADIUS } from "@ig-campus/game-core";
import {
  AudioLines,
  ChevronRight,
  DoorOpen,
  Focus,
  LocateFixed,
  LockKeyhole,
  Map as MapIcon,
  Mic,
  MicOff,
  MonitorUp,
  RadioTower,
  RefreshCw,
  UsersRound,
  Volume2,
} from "lucide-react";
import type Phaser from "phaser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CampusScene } from "../game/CampusScene";
import { createCampusGame } from "../game/createCampusGame";
import { bindMovementKeys, type MovementKeyBinding } from "../game/input";
import {
  buildInteractionOptions,
  buildInteractionPanelContent,
  createInteractionRequest,
  createInteractionRequestForAction,
  getInteractionResultMessage,
  type InteractionOption,
} from "../interactions/interactionState";
import { getCampusServerUrl, joinCampus, sendMovement } from "../lib/campusClient";
import { canStartScreenShare, canToggleMicrophone, mediaStatusLabel } from "../media/mediaState";
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
  const interactionSelectorOpenRef = useRef(false);
  const movementBindingRef = useRef<MovementKeyBinding | null>(null);
  const interactionSelectorRef = useRef<HTMLDivElement | null>(null);
  const pendingInteractionRef = useRef<InteractionRequest | null>(null);
  const pendingScreenShareStartRef = useRef<string | null>(null);
  const screenShareVideoRef = useRef<HTMLVideoElement | null>(null);
  const speakingIdentitiesRef = useRef<readonly string[]>([]);
  const acousticEnvironmentRef = useRef<AcousticEnvironmentSnapshot | null>(null);
  const latestSceneStateRef = useRef<{
    players: PlayerSnapshot[];
    proximity: ProximitySnapshot;
    screenShare: ScreenShareSnapshot | null;
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
  const [interactionAnnouncement, setInteractionAnnouncement] = useState("");
  const [interactionSelectorOpen, setInteractionSelectorOpen] = useState(false);
  const [selectedInteractionKey, setSelectedInteractionKey] = useState<string | null>(null);
  const [pendingInteraction, setPendingInteraction] = useState<InteractionRequest | null>(null);
  const [screenShare, setScreenShare] = useState<ScreenShareSnapshot | null>(null);
  const [screenShareViewerDismissed, setScreenShareViewerDismissed] = useState(false);
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
  const interactionOptions = useMemo(
    () => buildInteractionOptions(self, players, screenShare ?? undefined),
    [players, screenShare, self],
  );
  const availableInteractionOptions = interactionOptions.filter((option) => option.available);
  const primaryInteraction = availableInteractionOptions[0] ?? interactionOptions[0] ?? null;
  const selectedInteractionIndex = Math.max(
    0,
    interactionOptions.findIndex((option) => option.key === selectedInteractionKey),
  );
  const selectedInteraction = interactionOptions[selectedInteractionIndex] ?? primaryInteraction;
  const highlightedInteraction = interactionSelectorOpen ? selectedInteraction : primaryInteraction;
  const interactionPanel = useMemo(
    () => buildInteractionPanelContent(self, players, interactionOptions, screenShare ?? undefined),
    [interactionOptions, players, screenShare, self],
  );
  const visibleScreenShare = useMemo(
    () =>
      screenShare?.presentations.find(
        (presentation) => presentation.presenterSessionId !== selfSessionId,
      ) ?? null,
    [screenShare?.presentations, selfSessionId],
  );
  const ownScreenShare = useMemo(
    () =>
      screenShare?.presentations.find(
        (presentation) => presentation.presenterSessionId === selfSessionId,
      ) ?? null,
    [screenShare?.presentations, selfSessionId],
  );
  const visibleScreenShareKey = visibleScreenShare
    ? `${visibleScreenShare.stationId}:${visibleScreenShare.presenterSessionId}`
    : null;
  const visibleScreenSharePresenterIdentity = visibleScreenShare?.presenterSessionId ?? null;
  const screenShareTrackVersion = campusMedia.state.screenShareTrackVersion;
  const proximityBySessionId = useMemo(
    () => new Map(proximity.peers.map((peer) => [peer.sessionId, peer])),
    [proximity.peers],
  );

  const connect = useCallback(async () => {
    connectAbortRef.current?.abort();
    roomRef.current?.leave();
    roomRef.current = null;
    latestSceneStateRef.current = null;
    interactionSelectorOpenRef.current = false;
    pendingInteractionRef.current = null;
    pendingScreenShareStartRef.current = null;
    setInteractionAnnouncement("");
    setInteractionSelectorOpen(false);
    setSelectedInteractionKey(null);
    setPendingInteraction(null);
    setScreenShare(null);
    setScreenShareViewerDismissed(false);
    updateAcousticEnvironment(null);
    await campusMedia.disconnect();

    const currentScene = getCampusScene(gameRef.current);
    currentScene?.setSelfSessionId(null);
    currentScene?.setSpeakingIdentities([]);
    currentScene?.setHighlightedInteractableId(null);
    currentScene?.setScreenShare(null);
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
          screenShare: state.screenShare,
        };
        getCampusScene(gameRef.current)?.syncPlayers(nextPlayers, state.proximity);
        getCampusScene(gameRef.current)?.setScreenShare(state.screenShare);
        campusMedia.syncSpatialPositions(room.sessionId, nextPlayers);
        campusMedia.syncAcoustics(state.acoustic);
        campusMedia.syncScreenShare(state.screenShare);
        updateAcousticEnvironment(state.acoustic?.environment ?? null);
        setScreenShare((current) =>
          current?.revision === state.screenShare?.revision ? current : state.screenShare,
        );

        const now = performance.now();

        if (now - lastPanelUpdateAtRef.current >= PANEL_UPDATE_INTERVAL_MS) {
          lastPanelUpdateAtRef.current = now;
          setPlayers(nextPlayers);
          setProximity(state.proximity);
        }
      });

      room.onInteractionResult((result) => {
        if (
          pendingInteractionRef.current &&
          pendingInteractionRef.current.requestId !== result.requestId
        ) {
          return;
        }

        pendingInteractionRef.current = null;
        setPendingInteraction(null);
        setInteractionAnnouncement(getInteractionResultMessage(result));
        if (result.outcome === "succeeded" && result.actionId === "enter_focus") {
          void campusMedia.muteMicrophone();
        }
        if (result.outcome === "succeeded" && result.actionId === "start_screen_share") {
          pendingScreenShareStartRef.current = result.interactableId;
        }
        if (result.outcome === "succeeded" && result.actionId === "stop_screen_share") {
          void campusMedia.stopScreenShare();
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
        interactionSelectorOpenRef.current = false;
        pendingInteractionRef.current = null;
        pendingScreenShareStartRef.current = null;
        setInteractionAnnouncement("");
        setInteractionSelectorOpen(false);
        setSelectedInteractionKey(null);
        setPendingInteraction(null);
        setScreenShare(null);
        setScreenShareViewerDismissed(false);
        updateAcousticEnvironment(null);
        const scene = getCampusScene(gameRef.current);
        scene?.setSelfSessionId(null);
        scene?.setSpeakingIdentities([]);
        scene?.setHighlightedInteractableId(null);
        scene?.setScreenShare(null);
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
    campusMedia.muteMicrophone,
    campusMedia.stopScreenShare,
    campusMedia.syncAcoustics,
    campusMedia.syncScreenShare,
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
        scene.setScreenShare(latestState.screenShare);
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
    const stationId = pendingScreenShareStartRef.current;

    if (!stationId || ownScreenShare?.stationId !== stationId) {
      return;
    }

    pendingScreenShareStartRef.current = null;
    void campusMedia.startScreenShare(stationId);
  }, [campusMedia.startScreenShare, ownScreenShare?.stationId]);

  useEffect(() => {
    const stationId = campusMedia.state.screenShareStoppedStationId;

    if (!stationId) {
      return;
    }

    const connection = roomRef.current;
    campusMedia.acknowledgeScreenShareStopped();

    if (!connection || connectionState !== "connected") {
      return;
    }

    connection.interact(createInteractionRequestForAction(stationId, "stop_screen_share"));
  }, [
    campusMedia.acknowledgeScreenShareStopped,
    campusMedia.state.screenShareStoppedStationId,
    connectionState,
  ]);

  useEffect(() => {
    if (visibleScreenShareKey && visibleScreenSharePresenterIdentity) {
      setScreenShareViewerDismissed(false);
      campusMedia.setScreenShareViewing(visibleScreenSharePresenterIdentity, true);
    }
  }, [
    campusMedia.setScreenShareViewing,
    visibleScreenShareKey,
    visibleScreenSharePresenterIdentity,
  ]);

  useEffect(() => {
    const video = screenShareVideoRef.current;

    if (!video || !visibleScreenShare || screenShareViewerDismissed) {
      return;
    }

    return campusMedia.attachScreenShareVideo(
      visibleScreenShare.presenterSessionId,
      video,
      screenShareTrackVersion,
    );
  }, [
    campusMedia.attachScreenShareVideo,
    screenShareTrackVersion,
    screenShareViewerDismissed,
    visibleScreenShare,
  ]);

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
    const binding = bindMovementKeys(
      (input) => {
        sendMovement(roomRef.current, input);
      },
      () => interactionSelectorOpenRef.current,
    );
    movementBindingRef.current = binding;

    return () => {
      binding.dispose();
      movementBindingRef.current = null;
    };
  }, []);

  useEffect(() => {
    getCampusScene(gameRef.current)?.setHighlightedInteractableId(
      highlightedInteraction?.interactableId ?? null,
    );
  }, [highlightedInteraction?.interactableId]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        interactionSelectorOpen ||
        !overviewEnabled ||
        !self ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      overviewEnabledRef.current = false;
      setOverviewEnabled(false);
      getCampusScene(gameRef.current)?.setOverview(false);
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [interactionSelectorOpen, overviewEnabled, self]);

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
    interactionSelectorOpenRef.current = false;
    pendingInteractionRef.current = null;
    pendingScreenShareStartRef.current = null;
    setInteractionAnnouncement("");
    setInteractionSelectorOpen(false);
    setSelectedInteractionKey(null);
    setPendingInteraction(null);
    setScreenShare(null);
    setScreenShareViewerDismissed(false);
    updateAcousticEnvironment(null);
    void connect();
  };

  const handleOverviewToggle = () => {
    const nextOverviewEnabled = !overviewEnabled;
    overviewEnabledRef.current = nextOverviewEnabled;
    setOverviewEnabled(nextOverviewEnabled);
    getCampusScene(gameRef.current)?.setOverview(nextOverviewEnabled);
  };

  const closeInteractionSelector = useCallback(() => {
    interactionSelectorOpenRef.current = false;
    setInteractionSelectorOpen(false);
    setSelectedInteractionKey(null);
  }, []);

  const submitInteraction = useCallback(
    (option: InteractionOption) => {
      if (
        option.actionId === "start_screen_share" &&
        !canStartScreenShare(campusMedia.state.status)
      ) {
        setInteractionAnnouncement("A apresentação precisa do LiveKit local conectado.");
        return;
      }

      if (
        !option.available ||
        connectionState !== "connected" ||
        pendingInteractionRef.current ||
        !roomRef.current
      ) {
        return;
      }

      const request = createInteractionRequest(option);
      pendingInteractionRef.current = request;
      setPendingInteraction(request);
      setInteractionAnnouncement("");
      roomRef.current.interact(request);
      closeInteractionSelector();
    },
    [campusMedia.state.status, closeInteractionSelector, connectionState],
  );

  const handleInteractionTrigger = useCallback(() => {
    if (
      connectionState !== "connected" ||
      pendingInteractionRef.current ||
      availableInteractionOptions.length === 0
    ) {
      return;
    }

    if (availableInteractionOptions.length === 1) {
      const option = availableInteractionOptions[0];
      if (option) {
        submitInteraction(option);
      }
      return;
    }

    const firstOption = availableInteractionOptions[0];
    interactionSelectorOpenRef.current = true;
    setInteractionSelectorOpen(true);
    setSelectedInteractionKey(firstOption?.key ?? null);
    movementBindingRef.current?.stop();
  }, [availableInteractionOptions, connectionState, submitInteraction]);

  useEffect(() => {
    const handleInteractionKey = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (!interactionSelectorOpen) {
        if (key === "e") {
          event.preventDefault();
          handleInteractionTrigger();
        }
        return;
      }

      if (key === "escape") {
        event.preventDefault();
        closeInteractionSelector();
        return;
      }

      if (key === "arrowdown" || key === "s" || key === "arrowup" || key === "w") {
        event.preventDefault();
        setSelectedInteractionKey((currentKey) =>
          moveInteractionSelection(
            interactionOptions,
            currentKey,
            key === "arrowdown" || key === "s" ? 1 : -1,
          ),
        );
        return;
      }

      if ((key === "e" || key === "enter") && selectedInteraction?.available) {
        event.preventDefault();
        submitInteraction(selectedInteraction);
      }
    };

    window.addEventListener("keydown", handleInteractionKey);
    return () => window.removeEventListener("keydown", handleInteractionKey);
  }, [
    closeInteractionSelector,
    handleInteractionTrigger,
    interactionOptions,
    interactionSelectorOpen,
    selectedInteraction,
    submitInteraction,
  ]);

  useEffect(() => {
    if (!interactionSelectorOpen) {
      return;
    }

    if (availableInteractionOptions.length === 0) {
      closeInteractionSelector();
      return;
    }

    if (!selectedInteraction?.available) {
      setSelectedInteractionKey(availableInteractionOptions[0]?.key ?? null);
    }
  }, [
    availableInteractionOptions,
    closeInteractionSelector,
    interactionSelectorOpen,
    selectedInteraction?.available,
  ]);

  useEffect(() => {
    if (!interactionSelectorOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const buttons =
        interactionSelectorRef.current?.querySelectorAll<HTMLButtonElement>(
          "[data-interaction-key]",
        );
      [...(buttons ?? [])]
        .find((button) => button.dataset.interactionKey === selectedInteractionKey)
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [interactionSelectorOpen, selectedInteractionKey]);

  useEffect(() => {
    if (!interactionAnnouncement) {
      return;
    }

    const timer = window.setTimeout(() => setInteractionAnnouncement(""), 3_500);
    return () => window.clearTimeout(timer);
  }, [interactionAnnouncement]);

  useEffect(() => {
    if (!pendingInteraction) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (pendingInteractionRef.current?.requestId !== pendingInteraction.requestId) {
        return;
      }

      pendingInteractionRef.current = null;
      setPendingInteraction(null);
      setInteractionAnnouncement("O servidor não respondeu. Tente novamente.");
    }, 4_000);
    return () => window.clearTimeout(timer);
  }, [pendingInteraction]);

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
        <section aria-label={getMapDescription(self, proximity)} className="map-frame">
          <div ref={gameHostRef} className="game-host" />
          {overviewEnabled ? (
            <div className="map-mode-indicator">
              <MapIcon aria-hidden="true" size={14} />
              Campus completo · movimento ativo
            </div>
          ) : null}
          {primaryInteraction?.available ? (
            <div className="interaction-prompt">
              <kbd>E</kbd>
              <span>
                {availableInteractionOptions.length > 1
                  ? `Escolher interação · ${availableInteractionOptions.length} opções`
                  : `${primaryInteraction.actionLabel} · ${primaryInteraction.label}`}
              </span>
            </div>
          ) : null}

          {interactionSelectorOpen ? (
            <div
              aria-label="Escolher interação próxima"
              aria-modal="false"
              className="interaction-selector"
              ref={interactionSelectorRef}
              role="dialog"
            >
              <div className="interaction-selector__header">
                <div>
                  <span>Ações por perto</span>
                  <strong>O que você quer fazer?</strong>
                </div>
                <button
                  aria-label="Fechar seletor de interação"
                  className="interaction-selector__close"
                  onClick={closeInteractionSelector}
                  type="button"
                >
                  Esc
                </button>
              </div>

              <div className="interaction-selector__options">
                {interactionOptions.map((option) => {
                  const selected = option.key === selectedInteraction?.key;
                  return (
                    <button
                      className={`interaction-option${selected ? " interaction-option--selected" : ""}`}
                      data-interaction-key={option.key}
                      data-selected={selected}
                      disabled={!option.available || Boolean(pendingInteraction)}
                      key={option.key}
                      onClick={() => submitInteraction(option)}
                      onFocus={() => setSelectedInteractionKey(option.key)}
                      onMouseEnter={() => setSelectedInteractionKey(option.key)}
                      type="button"
                    >
                      <span className="interaction-option__marker">
                        <ChevronRight aria-hidden="true" size={16} />
                      </span>
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.unavailableMessage ?? option.actionLabel}</small>
                      </span>
                      <em>{Math.max(1, Math.round(option.distance / 32))} m</em>
                    </button>
                  );
                })}
              </div>

              <p>W/S navegar · E confirmar · Esc fechar</p>
            </div>
          ) : null}

          {visibleScreenShare && !screenShareViewerDismissed ? (
            <section
              aria-label={`Tela compartilhada por ${visibleScreenShare.presenterName}`}
              className="screen-share-viewer"
            >
              <header className="screen-share-viewer__header">
                <div>
                  <span>
                    <MonitorUp aria-hidden="true" size={15} />
                    AO VIVO
                  </span>
                  <strong>{visibleScreenShare.presenterName} está apresentando</strong>
                </div>
                <button
                  onClick={() => {
                    setScreenShareViewerDismissed(true);
                    campusMedia.setScreenShareViewing(visibleScreenShare.presenterSessionId, false);
                  }}
                  type="button"
                >
                  Fechar
                </button>
              </header>
              <div className="screen-share-viewer__video">
                <video
                  aria-label={`Tela de ${visibleScreenShare.presenterName}`}
                  muted
                  playsInline
                  ref={screenShareVideoRef}
                />
                <span>Conectando à tela…</span>
              </div>
            </section>
          ) : null}

          {visibleScreenShare && screenShareViewerDismissed ? (
            <button
              className="screen-share-reopen"
              onClick={() => {
                setScreenShareViewerDismissed(false);
                campusMedia.setScreenShareViewing(visibleScreenShare.presenterSessionId, true);
              }}
              type="button"
            >
              Abrir apresentação de {visibleScreenShare.presenterName}
            </button>
          ) : null}
        </section>

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

          <section
            className={`focus-desk-card${interactionPanel.active ? " focus-desk-card--active" : ""}`}
          >
            <Focus aria-hidden="true" size={18} />
            <div>
              <h2 className="section-kicker">Interação contextual</h2>
              <strong>{interactionPanel.label}</strong>
              <span>{interactionPanel.help}</span>
            </div>
            <button
              aria-pressed={interactionPanel.active}
              className={`focus-button${interactionPanel.active ? " focus-button--active" : ""}`}
              disabled={
                !selfSessionId ||
                connectionState !== "connected" ||
                availableInteractionOptions.length === 0 ||
                Boolean(pendingInteraction)
              }
              onClick={handleInteractionTrigger}
              type="button"
            >
              <span>
                {pendingInteraction
                  ? "Aguarde"
                  : availableInteractionOptions.length > 1
                    ? "Escolher"
                    : (primaryInteraction?.actionLabel ?? "Interagir")}
              </span>
              <kbd>E</kbd>
            </button>
          </section>

          {interactionAnnouncement ? (
            <p className="focus-feedback" aria-live="polite">
              {interactionAnnouncement}
            </p>
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

function moveInteractionSelection(
  options: readonly InteractionOption[],
  currentKey: string | null,
  direction: -1 | 1,
): string | null {
  const availableOptions = options.filter((option) => option.available);

  if (availableOptions.length === 0) {
    return null;
  }

  const currentIndex = availableOptions.findIndex((option) => option.key === currentKey);
  const nextIndex =
    currentIndex < 0
      ? 0
      : (currentIndex + direction + availableOptions.length) % availableOptions.length;
  return availableOptions[nextIndex]?.key ?? null;
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
