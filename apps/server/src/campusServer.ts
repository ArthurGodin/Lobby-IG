import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import {
  type AcousticSnapshot,
  createIdleInput,
  type MovementInput,
  type PlayerSnapshot,
  type ProximitySnapshot,
  pickPlayerColor,
  type ScreenShareSnapshot,
  type ServerMessage,
  sanitizeDisplayName,
} from "@ig-campus/contracts";
import {
  buildAcousticPolicy,
  buildScreenShareAccessPolicy,
  CAMPUS_MAP,
  type CampusMapDefinition,
  getAvailableSpawnPoint,
  getFacingDirection,
  getFocusBarriers,
  getProximityPeer,
  isMoving,
  loadCampusMap,
  moveWithCollision,
  PROXIMITY_RADIUS,
  type ScreenShareReservation,
  SIMULATION_RATE,
} from "@ig-campus/game-core";
import { WebSocket, WebSocketServer } from "ws";
import { createIdentityService, type IdentityService } from "./identity.js";
import { createInteractionService } from "./interactionService.js";
import { createUnavailableMediaAccessProvider, type MediaAccessProvider } from "./mediaAccess.js";
import { parseClientMessage } from "./protocol.js";

export const INPUT_LEASE_MS = 1_000;
const MAX_PAYLOAD_BYTES = 4_096;
const MAX_BUFFERED_BYTES = 64 * 1_024;
const MAX_SIMULATION_DELTA_MS = 100;

type PlayerSession = {
  acousticRevision: number;
  acousticFingerprint: string | null;
  screenShareRevision: number;
  screenShareFingerprint: string | null;
  socket: WebSocket;
  input: MovementInput;
  lastInputAt: number;
  player: PlayerSnapshot;
};

export type CampusServer = {
  listen: (port: number) => Promise<{ port: number; websocketUrl: string }>;
  close: () => Promise<void>;
};

export type CampusServerOptions = {
  mediaAccessProvider?: MediaAccessProvider;
  identityService?: IdentityService;
  spawnPointProvider?: (players: readonly PlayerSnapshot[]) => { x: number; y: number };
};

export function createCampusServer(options: CampusServerOptions = {}): CampusServer {
  const sessions = new Map<string, PlayerSession>();
  const whiteboardsPath = fileURLToPath(
    new URL("../../../packages/game-core/src/whiteboards.json", import.meta.url),
  );

  let initialWhiteboards: Array<
    [
      string,
      Array<{ x0: number; y0: number; x1: number; y1: number; color: string; width: number }>,
    ]
  > = [];
  if (existsSync(whiteboardsPath)) {
    try {
      initialWhiteboards = JSON.parse(readFileSync(whiteboardsPath, "utf8"));
    } catch (e) {
      console.warn("Falha ao carregar whiteboards.json", e);
    }
  }

  const whiteboards = new Map<
    string,
    Array<{ x0: number; y0: number; x1: number; y1: number; color: string; width: number }>
  >(initialWhiteboards);

  let saveWhiteboardsTimeout: NodeJS.Timeout | null = null;
  const scheduleWhiteboardsSave = () => {
    if (!saveWhiteboardsTimeout) {
      saveWhiteboardsTimeout = setTimeout(() => {
        saveWhiteboardsTimeout = null;
        try {
          writeFileSync(
            whiteboardsPath,
            JSON.stringify([...whiteboards.entries()], null, 2),
            "utf8",
          );
        } catch (e) {
          console.error("Falha ao salvar whiteboards", e);
        }
      }, 5000);
    }
  };
  const mediaAccessProvider = options.mediaAccessProvider ?? createUnavailableMediaAccessProvider();
  const identityService = options.identityService ?? createIdentityService();
  const interactionService = createInteractionService();
  const httpServer = createHttpServer(sessions);
  const websocketServer = new WebSocketServer({
    server: httpServer,
    maxPayload: MAX_PAYLOAD_BYTES,
  });
  let simulationTimer: NodeJS.Timeout | null = null;
  let serverTick = 0;
  let previousUpdateAt = Date.now();

  websocketServer.on("connection", (socket) => {
    const sessionId = randomUUID();
    const connectedPlayers = [...sessions.values()].map((session) => session.player);
    const spawnPoint =
      options.spawnPointProvider?.(connectedPlayers) ?? getAvailableSpawnPoint(connectedPlayers);
    const player: PlayerSnapshot = {
      sessionId,
      name: "Dev",
      color: pickPlayerColor(sessionId),
      appearance: { outfitColor: pickPlayerColor(sessionId) },
      role: "member",
      x: spawnPoint.x,
      y: spawnPoint.y,
      facing: "down",
      moving: false,
      focusMode: false,
      focusDeskId: null,
      sequence: 0,
    };

    sessions.set(sessionId, {
      acousticRevision: 0,
      acousticFingerprint: null,
      screenShareRevision: 0,
      screenShareFingerprint: null,
      socket,
      player,
      input: createIdleInput(),
      lastInputAt: Date.now(),
    });

    void mediaAccessProvider
      .createAccess(sessionId, player.name)
      .catch(() => ({ available: false, reason: "token_error" }) as const)
      .then((media) => {
        if (sessions.has(sessionId)) {
          send(socket, { type: "welcome", sessionId, media });
        }
      });
    broadcastState();

    socket.on("message", (rawMessage) => {
      const message = parseClientMessage(rawMessage.toString());

      if (!message) {
        send(socket, { type: "error", message: "Mensagem invalida." });
        return;
      }

      const session = sessions.get(sessionId);

      if (!session) {
        return;
      }

      if (message.type === "profile") {
        if (message.payload.name !== undefined) {
          session.player.name = sanitizeDisplayName(message.payload.name);
        }

        const outfitColor =
          message.payload.appearance?.outfitColor ??
          message.payload.color ??
          session.player.appearance.outfitColor;
        session.player.color = outfitColor;
        session.player.appearance = { outfitColor };
        broadcastState();
        return;
      }

      if (message.type === "interact") {
        const result = interactionService.execute(message.payload, session, [...sessions.values()]);
        send(session.socket, { type: "interaction_result", result });

        if (result.outcome === "succeeded") {
          if (message.payload.actionId === "open_whiteboard") {
            const lines = whiteboards.get(message.payload.interactableId) ?? [];
            send(session.socket, {
              type: "whiteboard_sync",
              interactableId: message.payload.interactableId,
              lines,
            });
          }
          broadcastState();
        }
        return;
      }

      if (message.type === "whiteboard_draw_request") {
        const lines = whiteboards.get(message.payload.interactableId) ?? [];
        lines.push({
          x0: message.payload.x0,
          y0: message.payload.y0,
          x1: message.payload.x1,
          y1: message.payload.y1,
          color: message.payload.color,
          width: message.payload.width,
        });

        // Prevent memory leak
        if (lines.length > 5000) {
          lines.splice(0, lines.length - 5000);
        }
        whiteboards.set(message.payload.interactableId, lines);
        scheduleWhiteboardsSave();

        const broadcastMsg = {
          type: "whiteboard_draw_broadcast",
          sessionId: session.player.sessionId,
          interactableId: message.payload.interactableId,
          x0: message.payload.x0,
          y0: message.payload.y0,
          x1: message.payload.x1,
          y1: message.payload.y1,
          color: message.payload.color,
          width: message.payload.width,
        } as const;

        for (const s of sessions.values()) {
          send(s.socket, broadcastMsg);
        }
        return;
      }

      if (message.type === "chat_request") {
        if (message.payload.message.trim().length > 0) {
          const broadcastMsg = {
            type: "chat_broadcast",
            sessionId: session.player.sessionId,
            message: message.payload.message.trim(),
          } as const;

          for (const s of sessions.values()) {
            send(s.socket, broadcastMsg);
          }
        }
        return;
      }

      if (message.type === "emoji_reaction_request") {
        const broadcastMsg = {
          type: "emoji_reaction_broadcast",
          sessionId: session.player.sessionId,
          emoji: message.payload.emoji,
        } as const;

        for (const s of sessions.values()) {
          send(s.socket, broadcastMsg);
        }
        return;
      }

      if (message.type === "auth") {
        const granted = identityService.validateAdminKey(message.payload.adminKey);

        if (granted) {
          session.player.role = "admin";
        }

        send(session.socket, {
          type: "auth_result",
          result: { granted, role: session.player.role },
        });

        if (granted) {
          broadcastState();
        }
        return;
      }

      if (message.type === "publish_map_request") {
        if (session.player.role !== "admin") {
          send(session.socket, { type: "error", message: "Sem permissao para publicar mapas." });
          return;
        }

        try {
          const newMap = message.payload as CampusMapDefinition;
          loadCampusMap(newMap);

          const filePath = fileURLToPath(
            new URL("../../../packages/game-core/src/campus.json", import.meta.url),
          );
          writeFileSync(filePath, JSON.stringify(newMap, null, 2), "utf8");

          for (const clientSession of sessions.values()) {
            send(clientSession.socket, { type: "map_update", map: newMap });
          }
        } catch (error) {
          const err = error as Error;
          send(session.socket, {
            type: "error",
            message: `Falha ao publicar mapa: ${err.message}`,
          });
        }
        return;
      }

      if (message.payload.sequence <= session.input.sequence) {
        return;
      }

      session.input = message.payload;
      session.lastInputAt = Date.now();
    });

    socket.on("error", (error) => {
      console.warn(`WebSocket ${sessionId} falhou: ${error.message}`);
    });

    socket.on("close", () => {
      sessions.delete(sessionId);
      interactionService.forgetSession(sessionId);
      broadcastState();
    });
  });

  function updateWorld(): void {
    if (sessions.size === 0) {
      previousUpdateAt = Date.now();
      return;
    }

    const now = Date.now();
    const deltaMs = Math.min(Math.max(now - previousUpdateAt, 0), MAX_SIMULATION_DELTA_MS);
    previousUpdateAt = now;
    serverTick += 1;

    for (const session of sessions.values()) {
      const input = session.player.focusMode
        ? createIdleInput(session.input.sequence)
        : getLeasedInput(session.input, session.lastInputAt, now);
      const nextPosition = moveWithCollision(
        session.player,
        input,
        deltaMs,
        getFocusBarriers(
          [...sessions.values()].map((candidate) => candidate.player),
          session.player.sessionId,
        ),
      );
      session.player.x = roundPosition(nextPosition.x);
      session.player.y = roundPosition(nextPosition.y);
      session.player.facing = getFacingDirection(input, session.player.facing);
      session.player.moving = isMoving(input);
      session.player.sequence = input.sequence;
    }

    broadcastState();
  }

  function broadcastState(): void {
    const players = [...sessions.values()].map((session) => session.player);
    interactionService.reconcile([...sessions.values()]);
    const screenShareReservations = interactionService.getScreenShareReservations();

    for (const session of sessions.values()) {
      send(session.socket, {
        type: "state",
        serverTick,
        players,
        proximity: buildProximitySnapshot(session.player, players),
        acoustic: buildVersionedAcousticSnapshot(session, players),
        screenShare: buildVersionedScreenShareSnapshot(session, players, screenShareReservations),
      });
    }
  }

  return {
    async listen(port) {
      await listen(httpServer, port);
      previousUpdateAt = Date.now();
      simulationTimer = setInterval(updateWorld, 1_000 / SIMULATION_RATE);

      const address = httpServer.address();

      if (!address || typeof address === "string") {
        throw new Error("Servidor iniciou sem uma porta TCP valida.");
      }

      return {
        port: address.port,
        websocketUrl: `ws://127.0.0.1:${address.port}`,
      };
    },
    async close() {
      if (simulationTimer) {
        clearInterval(simulationTimer);
        simulationTimer = null;
      }

      for (const socket of websocketServer.clients) {
        socket.terminate();
      }

      await closeWebSocketServer(websocketServer);
      await closeHttpServer(httpServer);
    },
  };
}

export function buildProximitySnapshot(
  listener: PlayerSnapshot,
  players: PlayerSnapshot[],
): ProximitySnapshot {
  const peers = players
    .map((player) => getProximityPeer(listener, player))
    .filter((peer) => peer !== null)
    .sort((first, second) => first.distance - second.distance);

  return {
    radius: PROXIMITY_RADIUS,
    peers,
  };
}

function buildVersionedAcousticSnapshot(
  session: PlayerSession,
  players: PlayerSnapshot[],
): AcousticSnapshot {
  const policy = buildAcousticPolicy(session.player, players);
  const fingerprint = JSON.stringify(policy);

  if (fingerprint !== session.acousticFingerprint) {
    session.acousticRevision += 1;
    session.acousticFingerprint = fingerprint;
  }

  return {
    revision: session.acousticRevision,
    ...policy,
  };
}

function buildVersionedScreenShareSnapshot(
  session: PlayerSession,
  players: PlayerSnapshot[],
  reservations: readonly ScreenShareReservation[],
): ScreenShareSnapshot {
  const policy = buildScreenShareAccessPolicy(session.player, players, reservations);
  const fingerprint = JSON.stringify(policy);

  if (fingerprint !== session.screenShareFingerprint) {
    session.screenShareRevision += 1;
    session.screenShareFingerprint = fingerprint;
  }

  return {
    revision: session.screenShareRevision,
    ...policy,
  };
}

export function getLeasedInput(
  input: MovementInput,
  lastInputAt: number,
  now: number,
): MovementInput {
  return now - lastInputAt <= INPUT_LEASE_MS ? input : createIdleInput(input.sequence);
}

function createHttpServer(sessions: Map<string, PlayerSession>): Server {
  return createServer((request, response) => {
    // Add CORS headers for all requests
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, service: "ig-campus-server" }));
      return;
    }

    if (request.url === "/map" && request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(CAMPUS_MAP));
      return;
    }

    if (request.url === "/webhook" && request.method === "POST") {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk.toString();
      });
      request.on("end", () => {
        try {
          const payload = JSON.parse(body);
          // Broadcast to all clients
          const chatMsg = {
            type: "chat_broadcast" as const,
            sessionId: "system-webhook",
            message: payload.message || "Evento recebido do Webhook!",
          };
          for (const session of sessions.values()) {
            send(session.socket, chatMsg);
          }
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ ok: true, broadcasted: true }));
        } catch (e) {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "invalid_json" }));
        }
      });
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > MAX_BUFFERED_BYTES) {
    return;
  }

  socket.send(JSON.stringify(message));
}

function roundPosition(value: number): number {
  return Math.round(value * 100) / 100;
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleError = (error: Error) => reject(error);
    server.once("error", handleError);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", handleError);
      resolve();
    });
  });
}

function closeWebSocketServer(server: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
