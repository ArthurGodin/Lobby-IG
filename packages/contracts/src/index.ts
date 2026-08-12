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

export type AvatarAppearance = {
  outfitColor: PlayerColor;
};

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
  appearance?: AvatarAppearance;
};

export type PlayerSnapshot = {
  sessionId: string;
  name: string;
  color: PlayerColor;
  appearance: AvatarAppearance;
  x: number;
  y: number;
  facing: Direction;
  moving: boolean;
  sequence: number;
};

export type ProximityBand = "close" | "nearby";

export type ProximityPeerSnapshot = {
  sessionId: string;
  distance: number;
  band: ProximityBand;
};

export type ProximitySnapshot = {
  radius: number;
  peers: ProximityPeerSnapshot[];
};

export type WorldStateSnapshot = {
  serverTick: number;
  players: PlayerSnapshot[];
  proximity: ProximitySnapshot;
};

export type ConnectionStatus = "connecting" | "connected" | "offline" | "error";

export type MediaUnavailableReason = "not_configured" | "token_error";

export type MediaAccessSnapshot =
  | {
      available: false;
      reason: MediaUnavailableReason;
    }
  | {
      available: true;
      serverUrl: string;
      accessToken: string;
      participantIdentity: string;
    };

export type ClientMessage =
  | {
      type: "profile";
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
      media: MediaAccessSnapshot;
    }
  | {
      type: "state";
      serverTick: number;
      players: PlayerSnapshot[];
      proximity: ProximitySnapshot;
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

export function isPlayerColor(value: unknown): value is PlayerColor {
  return typeof value === "string" && PLAYER_COLORS.some((color) => color === value);
}
