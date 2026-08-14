import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createIdleInput, type MovementInput, type ServerMessage } from "@ig-campus/contracts";
import WebSocket from "ws";
import {
  type CampusServer,
  createCampusServer,
  getLeasedInput,
  INPUT_LEASE_MS,
} from "./campusServer.js";

type TestClient = {
  socket: WebSocket;
  messages: ServerMessage[];
};

const servers: CampusServer[] = [];
const clients: TestClient[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) {
    client.socket.terminate();
  }

  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("servidor do campus", () => {
  test("vincula o acesso de midia ao sessionId da conexao", async () => {
    const server = createCampusServer({
      mediaAccessProvider: {
        async createAccess(participantIdentity) {
          return {
            available: true,
            serverUrl: "ws://127.0.0.1:7880",
            accessToken: "token-de-teste",
            participantIdentity,
          };
        },
      },
    });
    servers.push(server);
    const runningServer = await server.listen(0);
    const client = await connectClient(runningServer.websocketUrl, "Lin");
    const welcome = client.messages.find((message) => message.type === "welcome");

    assert.ok(welcome);
    assert.equal(welcome.type, "welcome");

    if (welcome.type !== "welcome") {
      return;
    }

    assert.deepEqual(welcome.media, {
      available: true,
      serverUrl: "ws://127.0.0.1:7880",
      accessToken: "token-de-teste",
      participantIdentity: welcome.sessionId,
    });
  });

  test("mantem o campus disponivel quando a midia nao foi configurada", async () => {
    const server = createCampusServer();
    servers.push(server);
    const runningServer = await server.listen(0);
    const client = await connectClient(runningServer.websocketUrl, "Lin");
    const welcome = client.messages.find((message) => message.type === "welcome");

    assert.ok(welcome);
    assert.equal(welcome.type, "welcome");

    if (welcome.type === "welcome") {
      assert.deepEqual(welcome.media, { available: false, reason: "not_configured" });
    }
  });

  test("normaliza a aparencia e preserva color para clientes legados", async () => {
    const server = createCampusServer();
    servers.push(server);
    const runningServer = await server.listen(0);
    const client = await connectClient(runningServer.websocketUrl, "Lin", {
      color: "#7a5aa6",
    });

    const state = await waitForMessage(
      client,
      (message) => message.type === "state" && hasPlayers(message, ["Lin"]),
    );
    assert.equal(state.type, "state");

    if (state.type !== "state") {
      return;
    }

    const player = state.players.find((candidate) => candidate.name === "Lin");
    assert.ok(player);
    assert.equal(player.color, "#7a5aa6");
    assert.deepEqual(player.appearance, { outfitColor: "#7a5aa6" });
  });

  test("atualiza somente a aparencia sem apagar o nome existente", async () => {
    const server = createCampusServer();
    servers.push(server);
    const runningServer = await server.listen(0);
    const client = await connectClient(runningServer.websocketUrl, "Lin");

    client.socket.send(
      JSON.stringify({
        type: "profile",
        payload: { appearance: { outfitColor: "#ca5a38" } },
      }),
    );

    const state = await waitForMessage(
      client,
      (message) =>
        message.type === "state" &&
        message.players.some(
          (player) => player.name === "Lin" && player.appearance.outfitColor === "#ca5a38",
        ),
    );
    assert.equal(state.type, "state");
  });

  test("ativa a cortina de foco e fecha sua presença acústica", async () => {
    const server = createCampusServer();
    servers.push(server);
    const runningServer = await server.listen(0);
    const client = await connectClient(runningServer.websocketUrl, "Lin");

    client.socket.send(JSON.stringify({ type: "focus", payload: { enabled: true } }));
    const state = await waitForMessage(
      client,
      (message) =>
        message.type === "state" &&
        message.players.some((player) => player.name === "Lin" && player.focusMode),
    );

    assert.equal(state.type, "state");
    if (state.type === "state") {
      const self = state.players.find((player) => player.name === "Lin");
      assert.ok(self?.focusMode);
      assert.deepEqual(state.acoustic.allowedPeerSessionIds, []);
      assert.deepEqual(state.acoustic.audiblePeers, []);
    }
  });

  test("envia proximidade personalizada para dois clientes", async () => {
    const server = createCampusServer();
    servers.push(server);
    const runningServer = await server.listen(0);
    const alpha = await connectClient(runningServer.websocketUrl, "Alpha");
    const beta = await connectClient(runningServer.websocketUrl, "Beta");

    const alphaState = await waitForMessage(
      alpha,
      (message) => message.type === "state" && hasPlayers(message, ["Alpha", "Beta"]),
    );
    const betaState = await waitForMessage(
      beta,
      (message) => message.type === "state" && hasPlayers(message, ["Alpha", "Beta"]),
    );

    assert.equal(alphaState.type, "state");
    assert.equal(betaState.type, "state");

    if (alphaState.type !== "state" || betaState.type !== "state") {
      return;
    }

    const alphaId = alphaState.players.find((player) => player.name === "Alpha")?.sessionId;
    const betaId = betaState.players.find((player) => player.name === "Beta")?.sessionId;
    assert.ok(alphaId);
    assert.ok(betaId);
    assert.deepEqual(
      alphaState.proximity.peers.map((peer) => peer.sessionId),
      [betaId],
    );
    assert.deepEqual(
      betaState.proximity.peers.map((peer) => peer.sessionId),
      [alphaId],
    );
    assert.equal(alphaState.acoustic.environment.mode, "open");
    assert.equal(alphaState.acoustic.environment.zoneId, "patio");
    assert.deepEqual(alphaState.acoustic.allowedPeerSessionIds, [betaId]);
    assert.deepEqual(
      alphaState.acoustic.audiblePeers.map((peer) => peer.sessionId),
      [betaId],
    );
    assert.ok(alphaState.acoustic.revision >= 1);
    assert.ok(alphaState.serverTick >= 0);
  });

  test("remove uma desconexão das permissões acústicas seguintes", async () => {
    const server = createCampusServer();
    servers.push(server);
    const runningServer = await server.listen(0);
    const alpha = await connectClient(runningServer.websocketUrl, "Alpha");
    const beta = await connectClient(runningServer.websocketUrl, "Beta");
    const together = await waitForMessage(
      alpha,
      (message) => message.type === "state" && hasPlayers(message, ["Alpha", "Beta"]),
    );
    assert.equal(together.type, "state");
    const betaId =
      together.type === "state"
        ? together.players.find((player) => player.name === "Beta")?.sessionId
        : undefined;
    assert.ok(betaId);

    beta.socket.close();
    const afterLeave = await waitForMessage(
      alpha,
      (message) =>
        message.type === "state" &&
        message.players.every((player) => player.name !== "Beta") &&
        !message.acoustic.allowedPeerSessionIds.includes(betaId) &&
        message.acoustic.revision > together.acoustic.revision,
    );

    assert.equal(afterLeave.type, "state");
    if (afterLeave.type === "state") {
      assert.ok(afterLeave.acoustic.revision > together.acoustic.revision);
    }
  });

  test("responde com erro a uma mensagem malformada e continua vivo", async () => {
    const server = createCampusServer();
    servers.push(server);
    const runningServer = await server.listen(0);
    const client = await connectClient(runningServer.websocketUrl, "Grace");

    client.socket.send(
      JSON.stringify({
        type: "move",
        payload: { up: "false", down: false, left: false, right: false, sequence: 1 },
      }),
    );

    const error = await waitForMessage(client, (message) => message.type === "error");
    assert.deepEqual(error, { type: "error", message: "Mensagem invalida." });
    assert.equal(client.socket.readyState, WebSocket.OPEN);
  });
});

test("entrada de movimento expira sem heartbeat", () => {
  const moving: MovementInput = {
    up: false,
    down: false,
    left: false,
    right: true,
    sequence: 7,
  };

  assert.equal(getLeasedInput(moving, 1_000, 1_000 + INPUT_LEASE_MS), moving);
  assert.deepEqual(getLeasedInput(moving, 1_000, 1_001 + INPUT_LEASE_MS), createIdleInput(7));
});

async function connectClient(
  url: string,
  name: string,
  profile: Record<string, unknown> = {},
): Promise<TestClient> {
  const socket = new WebSocket(url);
  const client: TestClient = { socket, messages: [] };
  clients.push(client);

  socket.on("message", (rawMessage) => {
    client.messages.push(JSON.parse(rawMessage.toString()) as ServerMessage);
  });

  await waitForSocketOpen(socket);
  socket.send(JSON.stringify({ type: "profile", payload: { ...profile, name } }));
  await waitForMessage(client, (message) => message.type === "welcome");
  return client;
}

async function waitForMessage(
  client: TestClient,
  predicate: (message: ServerMessage) => boolean,
  timeoutMs = 2_000,
): Promise<ServerMessage> {
  const existing = client.messages.find(predicate);

  if (existing) {
    return existing;
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.socket.off("message", handleMessage);
      reject(new Error("Tempo esgotado aguardando mensagem WebSocket."));
    }, timeoutMs);

    const handleMessage = (rawMessage: WebSocket.RawData) => {
      const message = JSON.parse(rawMessage.toString()) as ServerMessage;

      if (!predicate(message)) {
        return;
      }

      clearTimeout(timeout);
      client.socket.off("message", handleMessage);
      resolve(message);
    };

    client.socket.on("message", handleMessage);
  });
}

function waitForSocketOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}

function hasPlayers(message: ServerMessage, expectedNames: string[]): boolean {
  if (message.type !== "state") {
    return false;
  }

  const names = message.players.map((player) => player.name);
  return expectedNames.every((name) => names.includes(name));
}
