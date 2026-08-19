import type {
  AcousticSnapshot,
  AuthResult,
  ClientMessage,
  InteractionRequest,
  InteractionResult,
  JoinOptions,
  MediaAccessSnapshot,
  MovementInput,
  ScreenShareSnapshot,
  ServerMessage,
  WorldStateSnapshot,
} from "@ig-campus/contracts";
import {
  isAcousticMode,
  isCampusZoneId,
  isInteractionOutcome,
  isPlayerRole,
  MAX_INTERACTION_ID_LENGTH,
  MAX_INTERACTION_REQUEST_ID_LENGTH,
} from "@ig-campus/contracts";
import { type CampusMapDefinition, loadCampusMap } from "@ig-campus/game-core";

const DEFAULT_SERVER_URL = "ws://127.0.0.1:2567";

export type CampusStateSnapshot = Omit<WorldStateSnapshot, "acoustic" | "screenShare"> & {
  acoustic: AcousticSnapshot | null;
  screenShare: ScreenShareSnapshot | null;
};

type StateListener = (state: CampusStateSnapshot) => void;
type LeaveListener = () => void;
type InteractionResultListener = (result: InteractionResult) => void;
type AuthResultListener = (result: AuthResult) => void;
type MapUpdateListener = (map: CampusMapDefinition) => void;
type ChatListener = (sessionId: string, message: string) => void;
type WhiteboardSyncListener = (
  interactableId: string,
  lines: Array<{ x0: number; y0: number; x1: number; y1: number; color: string; width: number }>,
) => void;
type WhiteboardDrawListener = (
  sessionId: string,
  interactableId: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  width: number,
) => void;
type EmojiReactionListener = (sessionId: string, emoji: string) => void;

export type CampusConnection = {
  sessionId: string;
  media: MediaAccessSnapshot;
  onStateChange: (listener: StateListener) => () => void;
  onLeave: (listener: LeaveListener) => () => void;
  onInteractionResult: (listener: InteractionResultListener) => () => void;
  onAuthResult: (listener: AuthResultListener) => () => void;
  onMapUpdate: (listener: MapUpdateListener) => () => void;
  onChat: (listener: ChatListener) => () => void;
  onWhiteboardSync: (listener: WhiteboardSyncListener) => () => void;
  onWhiteboardDraw: (listener: WhiteboardDrawListener) => () => void;
  onEmojiReaction: (listener: EmojiReactionListener) => () => void;
  sendMovement: (input: MovementInput) => void;
  updateProfile: (profile: JoinOptions) => void;
  sendChat: (message: string) => void;
  sendWhiteboardDraw: (
    interactableId: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    width: number,
  ) => void;
  sendEmojiReaction: (emoji: string) => void;
  interact: (request: InteractionRequest) => void;
  authenticate: (adminKey: string) => void;
  publishMap: (map: CampusMapDefinition) => void;
  leave: () => void;
};

export function getCampusServerUrl(): string {
  const envUrl = import.meta.env.VITE_CAMPUS_SERVER_URL ?? DEFAULT_SERVER_URL;
  try {
    const url = new URL(envUrl);
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      url.hostname = window.location.hostname;
    }
    return url.toString();
  } catch {
    return envUrl;
  }
}

export async function fetchCampusMap(): Promise<void> {
  try {
    const serverUrl = new URL(getCampusServerUrl());
    serverUrl.protocol = serverUrl.protocol.replace("ws", "http");
    serverUrl.pathname = "/map";

    const response = await fetch(serverUrl.toString());
    if (!response.ok) {
      console.error(`Falha ao buscar mapa do servidor: ${response.status}`);
      return;
    }

    const mapData = await response.json();
    loadCampusMap(mapData as CampusMapDefinition);
    console.log("Mapa sincronizado com o servidor");
  } catch (error) {
    console.warn("Nao foi possivel carregar o mapa do servidor, usando fallback local", error);
  }
}

export async function joinCampus(
  options: JoinOptions,
  signal?: AbortSignal,
): Promise<CampusConnection> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(getCampusServerUrl());
    const stateListeners = new Set<StateListener>();
    const leaveListeners = new Set<LeaveListener>();
    const interactionResultListeners = new Set<InteractionResultListener>();
    const authResultListeners = new Set<AuthResultListener>();
    const mapUpdateListeners = new Set<MapUpdateListener>();
    const chatListeners = new Set<ChatListener>();
    const whiteboardSyncListeners = new Set<WhiteboardSyncListener>();
    const whiteboardDrawListeners = new Set<WhiteboardDrawListener>();
    const emojiReactionListeners = new Set<EmojiReactionListener>();
    let connected = false;
    let settled = false;

    const abortConnection = () => {
      socket.close();

      if (!settled) {
        settled = true;
        reject(new DOMException("Conexão cancelada.", "AbortError"));
      }
    };

    if (signal?.aborted) {
      abortConnection();
      return;
    }

    signal?.addEventListener("abort", abortConnection, { once: true });

    const connection: CampusConnection = {
      sessionId: "",
      media: { available: false, reason: "not_configured" },
      onStateChange(listener) {
        stateListeners.add(listener);
        return () => stateListeners.delete(listener);
      },
      onLeave(listener) {
        leaveListeners.add(listener);
        return () => leaveListeners.delete(listener);
      },
      onInteractionResult(listener) {
        interactionResultListeners.add(listener);
        return () => interactionResultListeners.delete(listener);
      },
      onAuthResult(listener) {
        authResultListeners.add(listener);
        return () => authResultListeners.delete(listener);
      },
      onMapUpdate(listener) {
        mapUpdateListeners.add(listener);
        return () => mapUpdateListeners.delete(listener);
      },
      onChat(listener) {
        chatListeners.add(listener);
        return () => chatListeners.delete(listener);
      },
      onWhiteboardSync(listener) {
        whiteboardSyncListeners.add(listener);
        return () => whiteboardSyncListeners.delete(listener);
      },
      onWhiteboardDraw(listener) {
        whiteboardDrawListeners.add(listener);
        return () => whiteboardDrawListeners.delete(listener);
      },
      onEmojiReaction(listener) {
        emojiReactionListeners.add(listener);
        return () => emojiReactionListeners.delete(listener);
      },
      sendMovement(input) {
        send(socket, { type: "move", payload: input });
      },
      updateProfile(profile) {
        send(socket, { type: "profile", payload: profile });
      },
      sendChat(message) {
        send(socket, { type: "chat_request", payload: { message } });
      },
      sendWhiteboardDraw(interactableId, x0, y0, x1, y1, color, width) {
        send(socket, {
          type: "whiteboard_draw_request",
          payload: { interactableId, x0, y0, x1, y1, color, width },
        });
      },
      sendEmojiReaction(emoji) {
        send(socket, { type: "emoji_reaction_request", payload: { emoji } });
      },
      interact(request) {
        send(socket, { type: "interact", payload: request });
      },
      authenticate(adminKey) {
        send(socket, { type: "auth", payload: { adminKey } });
      },
      publishMap(map) {
        send(socket, { type: "publish_map_request", payload: map });
      },
      leave() {
        socket.close();
      },
    };

    socket.addEventListener("open", () => {
      send(socket, { type: "profile", payload: options });
    });

    socket.addEventListener("message", (event) => {
      const message = parseServerMessage(event.data);

      if (!message) {
        return;
      }

      if (message.type === "welcome") {
        connected = true;
        connection.sessionId = message.sessionId;
        connection.media = message.media;

        if (!settled) {
          settled = true;
          resolve(connection);
        }

        return;
      }

      if (message.type === "state") {
        for (const listener of stateListeners) {
          listener({
            serverTick: message.serverTick,
            players: message.players,
            proximity: message.proximity,
            acoustic: parseAcousticSnapshot(message.acoustic),
            screenShare: parseScreenShareSnapshot(message.screenShare),
          });
        }
      }

      if (message.type === "interaction_result") {
        const result = parseInteractionResult(message.result);
        if (result) {
          for (const listener of interactionResultListeners) {
            listener(result);
          }
        }
      }

      if (message.type === "auth_result") {
        const result = parseAuthResult(message.result);
        if (result) {
          for (const listener of authResultListeners) {
            listener(result);
          }
        }
      }

      if (message.type === "map_update") {
        const map = message.map as CampusMapDefinition;
        loadCampusMap(map);
        for (const listener of mapUpdateListeners) {
          listener(map);
        }
      }
      if (message.type === "chat_broadcast") {
        for (const listener of chatListeners) {
          listener(message.sessionId, message.message);
        }
      }

      if (message.type === "whiteboard_sync") {
        for (const listener of whiteboardSyncListeners) {
          listener(message.interactableId, message.lines);
        }
      }

      if (message.type === "whiteboard_draw_broadcast") {
        for (const listener of whiteboardDrawListeners) {
          listener(
            message.sessionId,
            message.interactableId,
            message.x0,
            message.y0,
            message.x1,
            message.y1,
            message.color,
            message.width,
          );
        }
      }

      if (message.type === "emoji_reaction_broadcast") {
        for (const listener of emojiReactionListeners) {
          listener(message.sessionId, message.emoji);
        }
      }

      if (message.type === "error") {
        console.warn(message.message);
      }
    });

    socket.addEventListener("error", () => {
      if (!settled) {
        settled = true;
        reject(
          new Error(
            `Não foi possível conectar ao servidor do campus (${getCampusServerUrl()}). Verifique se ele está rodando (pnpm dev).`,
          ),
        );
      }
    });

    socket.addEventListener("close", (event) => {
      for (const listener of leaveListeners) {
        listener();
      }

      if (!settled && !connected) {
        settled = true;
        reject(
          new Error(
            `Conexão encerrada antes do handshake (code ${event.code}). O servidor pode ter rejeitado a sessão.`,
          ),
        );
      }
    });
  });
}

export function sendMovement(connection: CampusConnection | null, input: MovementInput): void {
  if (!connection) {
    return;
  }

  connection.sendMovement(input);
}

function send(socket: WebSocket, message: ClientMessage): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
}

function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as ServerMessage;

    if (
      parsed.type === "welcome" ||
      parsed.type === "state" ||
      parsed.type === "error" ||
      parsed.type === "interaction_result" ||
      parsed.type === "auth_result" ||
      parsed.type === "map_update" ||
      parsed.type === "chat_broadcast" ||
      parsed.type === "whiteboard_sync" ||
      parsed.type === "whiteboard_draw_broadcast" ||
      parsed.type === "emoji_reaction_broadcast"
    ) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

export function parseInteractionResult(value: unknown): InteractionResult | null {
  if (
    !isRecord(value) ||
    !isInteractionOutcome(value.outcome) ||
    !isInteractionIdentifier(value.requestId, MAX_INTERACTION_REQUEST_ID_LENGTH) ||
    !isInteractionIdentifier(value.interactableId, MAX_INTERACTION_ID_LENGTH) ||
    !isInteractionIdentifier(value.actionId, MAX_INTERACTION_ID_LENGTH)
  ) {
    return null;
  }

  return {
    requestId: value.requestId,
    interactableId: value.interactableId,
    actionId: value.actionId,
    outcome: value.outcome,
  };
}

export function parseAuthResult(value: unknown): AuthResult | null {
  if (!isRecord(value) || typeof value.granted !== "boolean" || !isPlayerRole(value.role)) {
    return null;
  }

  return {
    granted: value.granted,
    role: value.role,
  };
}

function isInteractionIdentifier(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    /^[A-Za-z0-9:_-]+$/.test(value)
  );
}

export function parseAcousticSnapshot(value: unknown): AcousticSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const revision = value.revision;
  const environment = value.environment;
  const allowedPeerSessionIds = value.allowedPeerSessionIds;
  const audiblePeers = value.audiblePeers;

  if (
    !Number.isSafeInteger(revision) ||
    (revision as number) < 0 ||
    !isRecord(environment) ||
    typeof environment.label !== "string" ||
    environment.label.length === 0 ||
    environment.label.length > 64 ||
    !isAcousticMode(environment.mode) ||
    !(environment.zoneId === null || isCampusZoneId(environment.zoneId)) ||
    (environment.mode === "private" && environment.zoneId === null) ||
    !Array.isArray(allowedPeerSessionIds) ||
    !Array.isArray(audiblePeers)
  ) {
    return null;
  }

  if (
    !allowedPeerSessionIds.every(isSessionId) ||
    new Set(allowedPeerSessionIds).size !== allowedPeerSessionIds.length
  ) {
    return null;
  }

  const allowedIdentities = new Set(allowedPeerSessionIds);
  const parsedPeers = audiblePeers.filter(isProximityPeer);

  if (
    parsedPeers.length !== audiblePeers.length ||
    new Set(parsedPeers.map((peer) => peer.sessionId)).size !== parsedPeers.length ||
    parsedPeers.some((peer) => !allowedIdentities.has(peer.sessionId))
  ) {
    return null;
  }

  return {
    revision: revision as number,
    environment: {
      zoneId: environment.zoneId as AcousticSnapshot["environment"]["zoneId"],
      label: environment.label,
      mode: environment.mode,
    },
    allowedPeerSessionIds: [...allowedPeerSessionIds],
    audiblePeers: parsedPeers,
  };
}

export function parseScreenShareSnapshot(value: unknown): ScreenShareSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const revision = value.revision;
  const presentations = value.presentations;
  const audienceSessionIds = value.audienceSessionIds;

  if (
    !Number.isSafeInteger(revision) ||
    (revision as number) < 0 ||
    !Array.isArray(presentations) ||
    presentations.length > 1 ||
    !Array.isArray(audienceSessionIds)
  ) {
    return null;
  }

  if (
    !presentations.every(isScreenSharePresentation) ||
    new Set(presentations.map((presentation) => presentation.stationId)).size !==
      presentations.length ||
    !audienceSessionIds.every(isSessionId) ||
    new Set(audienceSessionIds).size !== audienceSessionIds.length
  ) {
    return null;
  }

  return {
    revision: revision as number,
    presentations,
    audienceSessionIds: [...audienceSessionIds],
  };
}

function isProximityPeer(value: unknown): value is AcousticSnapshot["audiblePeers"][number] {
  return (
    isRecord(value) &&
    isSessionId(value.sessionId) &&
    typeof value.distance === "number" &&
    Number.isFinite(value.distance) &&
    value.distance >= 0 &&
    (value.band === "close" || value.band === "nearby")
  );
}

function isScreenSharePresentation(
  value: unknown,
): value is ScreenShareSnapshot["presentations"][number] {
  return (
    isRecord(value) &&
    isInteractionIdentifier(value.stationId, MAX_INTERACTION_ID_LENGTH) &&
    isSessionId(value.presenterSessionId) &&
    typeof value.presenterName === "string" &&
    value.presenterName.trim().length > 0 &&
    value.presenterName.length <= 24
  );
}

function isSessionId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
