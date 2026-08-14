import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import {
  type AcousticSnapshot,
  createIdleInput,
  type MovementInput,
  type PlayerSnapshot,
  type ProximitySnapshot,
  pickPlayerColor,
  type ServerMessage,
  sanitizeDisplayName,
} from "@ig-campus/contracts";
import {
  buildAcousticPolicy,
  getAvailableSpawnPoint,
  getFacingDirection,
  getFocusBarriers,
  getProximityPeer,
  isMoving,
  moveWithCollision,
  PROXIMITY_RADIUS,
  SIMULATION_RATE,
} from "@ig-campus/game-core";
import { WebSocket, WebSocketServer } from "ws";
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
  spawnPointProvider?: (players: readonly PlayerSnapshot[]) => { x: number; y: number };
};

export function createCampusServer(options: CampusServerOptions = {}): CampusServer {
  const sessions = new Map<string, PlayerSession>();
  const mediaAccessProvider = options.mediaAccessProvider ?? createUnavailableMediaAccessProvider();
  const interactionService = createInteractionService();
  const httpServer = createHttpServer();
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
          broadcastState();
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

    for (const session of sessions.values()) {
      send(session.socket, {
        type: "state",
        serverTick,
        players,
        proximity: buildProximitySnapshot(session.player, players),
        acoustic: buildVersionedAcousticSnapshot(session, players),
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

export function getLeasedInput(
  input: MovementInput,
  lastInputAt: number,
  now: number,
): MovementInput {
  return now - lastInputAt <= INPUT_LEASE_MS ? input : createIdleInput(input.sequence);
}

function createHttpServer(): Server {
  return createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, service: "ig-campus-server" }));
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
    server.listen(port, "127.0.0.1", () => {
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
