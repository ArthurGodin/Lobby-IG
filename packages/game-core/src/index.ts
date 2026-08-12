import type { Direction, MovementInput } from "@ig-campus/contracts";

export type Vector2 = {
  x: number;
  y: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const TILE_SIZE = 32;
export const MAP_COLUMNS = 30;
export const MAP_ROWS = 18;
export const MAP_WIDTH = MAP_COLUMNS * TILE_SIZE;
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE;
export const PLAYER_RADIUS = 13;
export const PLAYER_SPEED = 150;
export const SIMULATION_RATE = 20;

export const SPAWN_POINTS: Vector2[] = [
  { x: 144, y: 160 },
  { x: 208, y: 160 },
  { x: 144, y: 224 },
  { x: 208, y: 224 },
  { x: 760, y: 400 },
  { x: 824, y: 400 },
];

export const OBSTACLES: Rect[] = [
  { x: 0, y: 0, width: MAP_WIDTH, height: TILE_SIZE },
  { x: 0, y: MAP_HEIGHT - TILE_SIZE, width: MAP_WIDTH, height: TILE_SIZE },
  { x: 0, y: 0, width: TILE_SIZE, height: MAP_HEIGHT },
  { x: MAP_WIDTH - TILE_SIZE, y: 0, width: TILE_SIZE, height: MAP_HEIGHT },
  { x: 352, y: 64, width: 256, height: 32 },
  { x: 352, y: 96, width: 32, height: 128 },
  { x: 576, y: 96, width: 32, height: 128 },
  { x: 96, y: 352, width: 192, height: 32 },
  { x: 96, y: 416, width: 192, height: 32 },
  { x: 672, y: 128, width: 160, height: 96 },
  { x: 448, y: 352, width: 64, height: 128 },
  { x: 544, y: 352, width: 64, height: 128 },
];

export const ZONES = [
  {
    id: "patio",
    label: "Patio",
    rect: { x: 64, y: 64, width: 256, height: 224 },
  },
  {
    id: "biblioteca",
    label: "Biblioteca",
    rect: { x: 640, y: 64, width: 256, height: 208 },
  },
  {
    id: "reitoria",
    label: "Reitoria",
    rect: { x: 384, y: 320, width: 256, height: 192 },
  },
] as const;

export function getSpawnPoint(index: number): Vector2 {
  return SPAWN_POINTS[index % SPAWN_POINTS.length] ?? { x: 144, y: 160 };
}

export function moveWithCollision(
  position: Vector2,
  input: MovementInput,
  deltaMs: number,
): Vector2 {
  const axis = inputToAxis(input);

  if (axis.x === 0 && axis.y === 0) {
    return position;
  }

  const length = Math.hypot(axis.x, axis.y) || 1;
  const distance = PLAYER_SPEED * (deltaMs / 1000);
  const velocity = {
    x: (axis.x / length) * distance,
    y: (axis.y / length) * distance,
  };

  const movedOnX = { x: position.x + velocity.x, y: position.y };
  const x = canStandAt(movedOnX) ? movedOnX.x : position.x;

  const movedOnY = { x, y: position.y + velocity.y };
  const y = canStandAt(movedOnY) ? movedOnY.y : position.y;

  return { x, y };
}

export function getFacingDirection(input: MovementInput, fallback: Direction): Direction {
  if (input.up) {
    return "up";
  }

  if (input.down) {
    return "down";
  }

  if (input.left) {
    return "left";
  }

  if (input.right) {
    return "right";
  }

  return fallback;
}

export function isMoving(input: MovementInput): boolean {
  return input.up || input.down || input.left || input.right;
}

export function canStandAt(position: Vector2): boolean {
  const playerBox = {
    x: position.x - PLAYER_RADIUS,
    y: position.y - PLAYER_RADIUS,
    width: PLAYER_RADIUS * 2,
    height: PLAYER_RADIUS * 2,
  };

  return !OBSTACLES.some((obstacle) => rectanglesOverlap(playerBox, obstacle));
}

export function inputToAxis(input: MovementInput): Vector2 {
  return {
    x: Number(input.right) - Number(input.left),
    y: Number(input.down) - Number(input.up),
  };
}

export function rectanglesOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
