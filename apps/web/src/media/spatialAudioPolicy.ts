import type { PlayerSnapshot } from "@ig-campus/contracts";
import { PROXIMITY_RADIUS } from "@ig-campus/game-core";

export const STEREO_PAN_DEAD_ZONE = 0.08;

export function calculateStereoPan(
  listenerX: number,
  sourceX: number,
  audibleRadius = PROXIMITY_RADIUS,
): number {
  if (
    !Number.isFinite(listenerX) ||
    !Number.isFinite(sourceX) ||
    !Number.isFinite(audibleRadius) ||
    audibleRadius <= 0
  ) {
    return 0;
  }

  const normalizedOffset = clamp((sourceX - listenerX) / audibleRadius, -1, 1);
  const direction = Math.sign(normalizedOffset);
  const magnitude = Math.abs(normalizedOffset);

  if (magnitude <= STEREO_PAN_DEAD_ZONE) {
    return 0;
  }

  return direction * clamp((magnitude - STEREO_PAN_DEAD_ZONE) / (1 - STEREO_PAN_DEAD_ZONE), 0, 1);
}

export function buildSpatialPanByIdentity(
  selfSessionId: string | null,
  players: readonly PlayerSnapshot[],
): Map<string, number> {
  const listener = players.find((player) => player.sessionId === selfSessionId);

  if (!listener) {
    return new Map();
  }

  return new Map(
    players
      .filter((player) => player.sessionId !== selfSessionId)
      .map((player) => [player.sessionId, calculateStereoPan(listener.x, player.x)]),
  );
}

export function filterVisibleSpeakingIdentities(
  detectedIdentities: ReadonlySet<string>,
  localIdentity: string,
  audibleRemoteIdentities: ReadonlySet<string>,
): string[] {
  return [...detectedIdentities]
    .filter((identity) => identity === localIdentity || audibleRemoteIdentities.has(identity))
    .sort();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
