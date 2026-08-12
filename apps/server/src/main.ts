import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import {
  type ClientMessage,
  type MovementInput,
  type PlayerSnapshot,
  pickPlayerColor,
  sanitizeDisplayName,
} from "@ig-campus/contracts";
import {
  getFacingDirection,
  getSpawnPoint,
  isMoving,
  moveWithCollision,
  SIMULATION_RATE,
} from "@ig-campus/game-core";
import { type WebSocket, WebSocketServer } from "ws";

const port = Number.parseInt(process.env.CAMPUS_SERVER_PORT ?? "2567", 10);

type PlayerSession = {
  socket: WebSocket;
  input: MovementInput;
  player: PlayerSnapshot;
};

const sessions = new Map<string, PlayerSession>();

const httpServer = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, service: "ig-campus-server" }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

const websocketServer = new WebSocketServer({ server: httpServer });

websocketServer.on("connection", (socket) => {
  const sessionId = randomUUID();
  const spawnPoint = getSpawnPoint(sessions.size);
  const player: PlayerSnapshot = {
    sessionId,
    name: "Dev",
    color: pickPlayerColor(sessionId),
    x: spawnPoint.x,
    y: spawnPoint.y,
    facing: "down",
    moving: false,
    sequence: 0,
  };

  sessions.set(sessionId, {
    socket,
    player,
    input: {
      up: false,
      down: false,
      left: false,
      right: false,
      sequence: 0,
    },
  });

  send(socket, { type: "welcome", sessionId });
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

    if (message.type === "join") {
      session.player.name = sanitizeDisplayName(message.payload.name);
      session.player.color = message.payload.color ?? pickPlayerColor(sessionId);
      broadcastState();
      return;
    }

    session.input = normalizeInput(message.payload);
  });

  socket.on("close", () => {
    sessions.delete(sessionId);
    broadcastState();
  });
});

setInterval(updateWorld, 1000 / SIMULATION_RATE);

httpServer.listen(port, () => {
  console.log(`Inforgeneses Campus server listening on ws://localhost:${port}`);
});

function updateWorld(): void {
  if (sessions.size === 0) {
    return;
  }

  const deltaMs = 1000 / SIMULATION_RATE;

  for (const session of sessions.values()) {
    const nextPosition = moveWithCollision(session.player, session.input, deltaMs);
    session.player.x = roundPosition(nextPosition.x);
    session.player.y = roundPosition(nextPosition.y);
    session.player.facing = getFacingDirection(session.input, session.player.facing);
    session.player.moving = isMoving(session.input);
    session.player.sequence = session.input.sequence;
  }

  broadcastState();
}

function broadcastState(): void {
  const players = [...sessions.values()].map((session) => session.player);

  for (const session of sessions.values()) {
    send(session.socket, { type: "state", players });
  }
}

function send(socket: WebSocket, message: unknown): void {
  if (socket.readyState !== socket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
}

function parseClientMessage(rawMessage: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(rawMessage) as Partial<ClientMessage>;

    if (parsed.type === "join" && parsed.payload && typeof parsed.payload === "object") {
      return {
        type: "join",
        payload: parsed.payload,
      };
    }

    if (parsed.type === "move" && parsed.payload && typeof parsed.payload === "object") {
      return {
        type: "move",
        payload: normalizeInput(parsed.payload as MovementInput),
      };
    }

    return null;
  } catch {
    return null;
  }
}

function normalizeInput(input: MovementInput): MovementInput {
  return {
    up: Boolean(input.up),
    down: Boolean(input.down),
    left: Boolean(input.left),
    right: Boolean(input.right),
    sequence: Number.isFinite(input.sequence) ? input.sequence : 0,
  };
}

function roundPosition(value: number): number {
  return Math.round(value * 100) / 100;
}
