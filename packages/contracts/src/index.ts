export const CAMPUS_ROOM_NAME = "campus";

export const CAMPUS_ZONE_IDS = ["patio", "desenvolvimento", "biblioteca", "reitoria"] as const;
export type CampusZoneId = (typeof CAMPUS_ZONE_IDS)[number];

export const ACOUSTIC_MODES = ["open", "private"] as const;
export type AcousticMode = (typeof ACOUSTIC_MODES)[number];

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
  focusMode: boolean;
  focusDeskId: string | null;
  sequence: number;
};

export const MAX_INTERACTION_ID_LENGTH = 64;
export const MAX_INTERACTION_REQUEST_ID_LENGTH = 64;

export const INTERACTION_ACTION_IDS = ["enter_focus", "leave_focus"] as const;
export type InteractionActionId = (typeof INTERACTION_ACTION_IDS)[number];

export const INTERACTION_OUTCOMES = [
  "succeeded",
  "invalid_target",
  "invalid_action",
  "too_far",
  "unavailable",
  "forbidden",
  "conflict",
] as const;
export type InteractionOutcome = (typeof INTERACTION_OUTCOMES)[number];

export type InteractionRequest = {
  requestId: string;
  interactableId: string;
  actionId: string;
};

export type InteractionResult = InteractionRequest & {
  outcome: InteractionOutcome;
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

export type AcousticEnvironmentSnapshot = {
  zoneId: CampusZoneId | null;
  label: string;
  mode: AcousticMode;
};

export type AcousticSnapshot = {
  revision: number;
  environment: AcousticEnvironmentSnapshot;
  allowedPeerSessionIds: string[];
  audiblePeers: ProximityPeerSnapshot[];
};

export const COMMONS_ACOUSTIC_ENVIRONMENT: AcousticEnvironmentSnapshot = {
  zoneId: null,
  label: "Áreas comuns",
  mode: "open",
};

export type WorldStateSnapshot = {
  serverTick: number;
  players: PlayerSnapshot[];
  proximity: ProximitySnapshot;
  acoustic: AcousticSnapshot;
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
    }
  | {
      type: "interact";
      payload: InteractionRequest;
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
      acoustic: AcousticSnapshot;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "interaction_result";
      result: InteractionResult;
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

export function isCampusZoneId(value: unknown): value is CampusZoneId {
  return typeof value === "string" && CAMPUS_ZONE_IDS.some((zoneId) => zoneId === value);
}

export function isAcousticMode(value: unknown): value is AcousticMode {
  return typeof value === "string" && ACOUSTIC_MODES.some((mode) => mode === value);
}

export function isInteractionActionId(value: unknown): value is InteractionActionId {
  return typeof value === "string" && INTERACTION_ACTION_IDS.some((actionId) => actionId === value);
}

export function isInteractionOutcome(value: unknown): value is InteractionOutcome {
  return typeof value === "string" && INTERACTION_OUTCOMES.some((outcome) => outcome === value);
}
