import {
  type AvatarAppearance,
  type ClientMessage,
  isPlayerColor,
  type JoinOptions,
  type MovementInput,
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

    return null;
  } catch {
    return null;
  }
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
