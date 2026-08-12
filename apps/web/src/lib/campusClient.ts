import type {
  ClientMessage,
  JoinOptions,
  MovementInput,
  PlayerSnapshot,
  ServerMessage,
} from "@ig-campus/contracts";

const DEFAULT_SERVER_URL = "ws://localhost:2567";

type StateListener = (state: { players: PlayerSnapshot[] }) => void;
type LeaveListener = () => void;

export type CampusConnection = {
  sessionId: string;
  onStateChange: (listener: StateListener) => () => void;
  onLeave: (listener: LeaveListener) => () => void;
  sendMovement: (input: MovementInput) => void;
  leave: () => void;
};

export function getCampusServerUrl(): string {
  return import.meta.env.VITE_CAMPUS_SERVER_URL ?? DEFAULT_SERVER_URL;
}

export async function joinCampus(options: JoinOptions): Promise<CampusConnection> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(getCampusServerUrl());
    const stateListeners = new Set<StateListener>();
    const leaveListeners = new Set<LeaveListener>();
    let connected = false;
    let settled = false;

    const connection: CampusConnection = {
      sessionId: "",
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
      leave() {
        socket.close();
      },
    };

    socket.addEventListener("open", () => {
      send(socket, { type: "join", payload: options });
    });

    socket.addEventListener("message", (event) => {
      const message = parseServerMessage(event.data);

      if (!message) {
        return;
      }

      if (message.type === "welcome") {
        connected = true;
        connection.sessionId = message.sessionId;

        if (!settled) {
          settled = true;
          resolve(connection);
        }

        return;
      }

      if (message.type === "state") {
        for (const listener of stateListeners) {
          listener({ players: message.players });
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
