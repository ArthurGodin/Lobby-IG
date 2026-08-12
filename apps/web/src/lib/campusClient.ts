import type {
  ClientMessage,
  JoinOptions,
  MediaAccessSnapshot,
  MovementInput,
  ServerMessage,
  WorldStateSnapshot,
} from "@ig-campus/contracts";

const DEFAULT_SERVER_URL = "ws://127.0.0.1:2567";

type StateListener = (state: WorldStateSnapshot) => void;
type LeaveListener = () => void;

export type CampusConnection = {
  sessionId: string;
  media: MediaAccessSnapshot;
  onStateChange: (listener: StateListener) => () => void;
  onLeave: (listener: LeaveListener) => () => void;
  sendMovement: (input: MovementInput) => void;
  updateProfile: (profile: JoinOptions) => void;
  leave: () => void;
};

export function getCampusServerUrl(): string {
  return import.meta.env.VITE_CAMPUS_SERVER_URL ?? DEFAULT_SERVER_URL;
}

export async function joinCampus(
  options: JoinOptions,
  signal?: AbortSignal,
): Promise<CampusConnection> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(getCampusServerUrl());
    const stateListeners = new Set<StateListener>();
    const leaveListeners = new Set<LeaveListener>();
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
      sendMovement(input) {
        send(socket, { type: "move", payload: input });
      },
      updateProfile(profile) {
        send(socket, { type: "profile", payload: profile });
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
          });
        }
      }

      if (message.type === "error") {
        console.warn(message.message);
      }
    });

    socket.addEventListener("error", () => {
      if (!settled) {
        settled = true;
        reject(new Error("Nao foi possivel conectar ao servidor local."));
      }
    });

    socket.addEventListener("close", () => {
      for (const listener of leaveListeners) {
        listener();
      }

      if (!settled && !connected) {
        settled = true;
        reject(new Error("Conexao fechada antes do handshake."));
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

    if (parsed.type === "welcome" || parsed.type === "state" || parsed.type === "error") {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}
