export const CAMPUS_ROOM_NAME = "campus";

export const CAMPUS_ZONE_IDS = ["patio", "desenvolvimento", "biblioteca", "reitoria"] as const;
export type CampusZoneId = (typeof CAMPUS_ZONE_IDS)[number];

export const ACOUSTIC_MODES = ["open", "private"] as const;
export type AcousticMode = (typeof ACOUSTIC_MODES)[number];

export const PLAYER_ROLES = ["member", "admin"] as const;
export type PlayerRole = (typeof PLAYER_ROLES)[number];

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
  role: PlayerRole;
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

export const INTERACTION_ACTION_IDS = [
  "enter_focus",
  "leave_focus",
  "start_screen_share",
  "stop_screen_share",
  "open_whiteboard",
  "close_whiteboard",
] as const;
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

export type AuthRequest = {
  adminKey: string;
};

export type AuthResult = {
  granted: boolean;
  role: PlayerRole;
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

export type ScreenSharePresentationSnapshot = {
  stationId: string;
  presenterSessionId: string;
  presenterName: string;
};

export type ScreenShareSnapshot = {
  revision: number;
  presentations: ScreenSharePresentationSnapshot[];
  audienceSessionIds: string[];
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
  screenShare: ScreenShareSnapshot;
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
    }
  | {
      type: "auth";
      payload: AuthRequest;
    }
  | {
      type: "publish_map_request";
      payload: unknown;
    }
  | {
      type: "chat_request";
      payload: { message: string };
    }
  | {
      type: "whiteboard_draw_request";
      payload: {
        interactableId: string;
        x0: number;
        y0: number;
        x1: number;
        y1: number;
        color: string;
        width: number;
      };
    }
  | {
      type: "emoji_reaction_request";
      payload: { emoji: string };
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
      screenShare: ScreenShareSnapshot;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "interaction_result";
      result: InteractionResult;
    }
  | {
      type: "auth_result";
      result: AuthResult;
    }
  | {
      type: "map_update";
      map: unknown;
    }
  | {
      type: "chat_broadcast";
      sessionId: string;
      message: string;
    }
  | {
      type: "whiteboard_draw_broadcast";
      sessionId: string;
      interactableId: string;
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      color: string;
      width: number;
    }
  | {
      type: "whiteboard_sync";
      interactableId: string;
      lines: Array<{
        x0: number;
        y0: number;
        x1: number;
        y1: number;
        color: string;
        width: number;
      }>;
    }
  | {
      type: "emoji_reaction_broadcast";
      sessionId: string;
      emoji: string;
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

export function isPlayerRole(value: unknown): value is PlayerRole {
  return typeof value === "string" && PLAYER_ROLES.some((role) => role === value);
}

export function sanitizeAdminKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length >= 4 && trimmed.length <= 256 ? trimmed : null;
}
