export const CAMPUS_ROOM_NAME = "campus";

export const PLAYER_COLORS = [
  "#2f7d5c",
  "#ca5a38",
  "#4f6fb0",
  "#c89b30",
  "#7a5aa6",
  "#2f8f9d",
] as const;

export type PlayerColor = (typeof PLAYER_COLORS)[number];

export type Direction = "up" | "down" | "left" | "right";

export type MovementInput = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  sequence: number;
};

export type JoinOptions = {
  name?: string;
  color?: PlayerColor;
};

export type PlayerSnapshot = {
  sessionId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  facing: Direction;
  moving: boolean;
  sequence: number;
};

export type ConnectionStatus = "connecting" | "connected" | "offline" | "error";

export type ClientMessage =
  | {
      type: "join";
      payload: JoinOptions;
    }
  | {
      type: "move";
      payload: MovementInput;
    };

export type ServerMessage =
  | {
      type: "welcome";
      sessionId: string;
    }
  | {
      type: "state";
      players: PlayerSnapshot[];
    }
  | {
      type: "error";
      message: string;
    };

export function createIdleInput(sequence = 0): MovementInput {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    sequence,
  };
}

export function sanitizeDisplayName(value: unknown): string {
  if (typeof value !== "string") {
    return "Dev";
  }

  const trimmed = value.trim().replace(/\s+/g, " ");

  if (trimmed.length === 0) {
    return "Dev";
  }

  return trimmed.slice(0, 24);
}

export function pickPlayerColor(seed: string): PlayerColor {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return PLAYER_COLORS[hash % PLAYER_COLORS.length] ?? PLAYER_COLORS[0];
}
