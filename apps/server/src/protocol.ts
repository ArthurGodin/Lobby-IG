import {
  type AuthRequest,
  type AvatarAppearance,
  type ClientMessage,
  isPlayerColor,
  type JoinOptions,
  MAX_INTERACTION_ID_LENGTH,
  MAX_INTERACTION_REQUEST_ID_LENGTH,
  type MovementInput,
  sanitizeAdminKey,
} from "@ig-campus/contracts";

export function parseClientMessage(rawMessage: string): ClientMessage | null {
  try {
    const parsed: unknown = JSON.parse(rawMessage);

    if (!isRecord(parsed) || !isRecord(parsed.payload)) {
      return null;
    }

    if (parsed.type === "profile") {
      const profile = parseProfile(parsed.payload);
      return profile ? { type: "profile", payload: profile } : null;
    }

    if (parsed.type === "move") {
      const input = parseMovementInput(parsed.payload);
      return input ? { type: "move", payload: input } : null;
    }

    if (parsed.type === "interact") {
      return parseInteraction(parsed.payload);
    }

    if (parsed.type === "auth") {
      const auth = parseAuthRequest(parsed.payload);
      return auth ? { type: "auth", payload: auth } : null;
    }

    if (parsed.type === "publish_map_request") {
      return { type: "publish_map_request", payload: parsed.payload };
    }

    if (parsed.type === "chat_request" && typeof parsed.payload.message === "string") {
      return { type: "chat_request", payload: { message: parsed.payload.message.slice(0, 120) } };
    }

    if (
      parsed.type === "whiteboard_draw_request" &&
      typeof parsed.payload.interactableId === "string" &&
      typeof parsed.payload.x0 === "number" &&
      typeof parsed.payload.y0 === "number" &&
      typeof parsed.payload.x1 === "number" &&
      typeof parsed.payload.y1 === "number" &&
      typeof parsed.payload.color === "string" &&
      typeof parsed.payload.width === "number"
    ) {
      return {
        type: "whiteboard_draw_request",
        payload: {
          interactableId: parsed.payload.interactableId,
          x0: parsed.payload.x0,
          y0: parsed.payload.y0,
          x1: parsed.payload.x1,
          y1: parsed.payload.y1,
          color: parsed.payload.color,
          width: parsed.payload.width,
        },
      };
    }

    if (
      parsed.type === "emoji_reaction_request" &&
      typeof parsed.payload.emoji === "string" &&
      parsed.payload.emoji.length > 0 &&
      parsed.payload.emoji.length <= 8
    ) {
      return { type: "emoji_reaction_request", payload: { emoji: parsed.payload.emoji } };
    }

    return null;
  } catch {
    return null;
  }
}

function parseInteraction(value: Record<string, unknown>): ClientMessage | null {
  if (
    !isSafeIdentifier(value.requestId, MAX_INTERACTION_REQUEST_ID_LENGTH) ||
    !isSafeIdentifier(value.interactableId, MAX_INTERACTION_ID_LENGTH) ||
    !isSafeIdentifier(value.actionId, MAX_INTERACTION_ID_LENGTH)
  ) {
    return null;
  }

  return {
    type: "interact",
    payload: {
      requestId: value.requestId,
      interactableId: value.interactableId,
      actionId: value.actionId,
    },
  };
}

function parseAuthRequest(value: Record<string, unknown>): AuthRequest | null {
  const adminKey = sanitizeAdminKey(value.adminKey);

  if (!adminKey) {
    return null;
  }

  return { adminKey };
}

export function parseMovementInput(value: unknown): MovementInput | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.up !== "boolean" ||
    typeof value.down !== "boolean" ||
    typeof value.left !== "boolean" ||
    typeof value.right !== "boolean" ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 0
  ) {
    return null;
  }

  return {
    up: value.up,
    down: value.down,
    left: value.left,
    right: value.right,
    sequence: value.sequence as number,
  };
}

function parseProfile(value: Record<string, unknown>): JoinOptions | null {
  if (value.name !== undefined && typeof value.name !== "string") {
    return null;
  }

  if (value.color !== undefined && !isPlayerColor(value.color)) {
    return null;
  }

  const appearance = parseAvatarAppearance(value.appearance);

  if (value.appearance !== undefined && !appearance) {
    return null;
  }

  const profile: JoinOptions = {};

  if (typeof value.name === "string") {
    profile.name = value.name;
  }

  if (isPlayerColor(value.color)) {
    profile.color = value.color;
  }

  if (appearance) {
    profile.appearance = appearance;
  }

  return profile;
}

function parseAvatarAppearance(value: unknown): AvatarAppearance | null {
  if (!isRecord(value) || !isPlayerColor(value.outfitColor)) {
    return null;
  }

  return { outfitColor: value.outfitColor };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeIdentifier(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    /^[A-Za-z0-9:_-]+$/.test(value)
  );
}
