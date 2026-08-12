import { CLOSE_PROXIMITY_RADIUS, PROXIMITY_RADIUS } from "@ig-campus/game-core";

export const AUDIO_UNSUBSCRIBE_DELAY_MS = 750;

export function calculateProximityGain(distance: number): number {
  if (!Number.isFinite(distance) || distance >= PROXIMITY_RADIUS) {
    return 0;
  }

  if (distance <= CLOSE_PROXIMITY_RADIUS) {
    return 1;
  }

  const progress =
    (distance - CLOSE_PROXIMITY_RADIUS) / (PROXIMITY_RADIUS - CLOSE_PROXIMITY_RADIUS);
  const smoothStep = progress * progress * (3 - 2 * progress);
  return clamp(1 - smoothStep, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
