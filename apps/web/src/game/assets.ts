import type { Direction } from "@ig-campus/contracts";
import { ART_TILE_SIZE, type CampusTileId } from "@ig-campus/game-core";

export { ART_TILE_SIZE };

export const AVATAR_FRAME_WIDTH = 16;
export const AVATAR_FRAME_HEIGHT = 24;
export const AVATAR_FRAME_COLUMNS = 3;
export const AVATAR_FRAME_ROWS = 4;
export const AVATAR_WALK_FRAME_DURATION_MS = 160;

export const PIXEL_ASSETS = {
  campusTiles: {
    key: "campus-tiles",
    url: "/assets/pixel/campus-tiles.png",
    frameWidth: ART_TILE_SIZE,
    frameHeight: ART_TILE_SIZE,
  },
  avatarBase: {
    key: "avatar-base",
    url: "/assets/pixel/avatar-base.png",
    frameWidth: AVATAR_FRAME_WIDTH,
    frameHeight: AVATAR_FRAME_HEIGHT,
  },
  avatarOutfitMask: {
    key: "avatar-outfit-mask",
    url: "/assets/pixel/avatar-outfit-mask.png",
    frameWidth: AVATAR_FRAME_WIDTH,
    frameHeight: AVATAR_FRAME_HEIGHT,
  },
} as const;

export const TILE_FRAME_BY_ID: Record<CampusTileId, number> = {
  empty: 0,
  grass: 1,
  "grass-flowers": 2,
  path: 3,
  "patio-floor": 4,
  "development-floor": 5,
  "library-floor": 6,
  "administration-floor": 7,
  "wall-light": 8,
  "wall-tech": 9,
  "wall-library": 10,
  "wall-administration": 11,
  door: 12,
  window: 13,
  roof: 14,
  tree: 15,
  shrub: 16,
  flowers: 17,
  bench: 18,
  fountain: 19,
  desk: 20,
  computer: 21,
  chair: 22,
  bookshelf: 23,
  "admin-desk": 24,
  sign: 25,
};

export const DIRECTION_ROW: Record<Direction, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

/**
 * Returns a row-major frame for the aligned base and outfit-mask sheets.
 * The middle pose is idle; walking alternates the two outer poses.
 */
export function getAvatarFrame(facing: Direction, moving: boolean, timeMs: number): number {
  const row = DIRECTION_ROW[facing];
  const walkPhase = Math.floor(Math.max(0, timeMs) / AVATAR_WALK_FRAME_DURATION_MS) % 2;
  const column = moving ? (walkPhase === 0 ? 0 : 2) : 1;
  return row * AVATAR_FRAME_COLUMNS + column;
}
