import type {
  AcousticEnvironmentSnapshot,
  AcousticSnapshot,
  Direction,
  MovementInput,
  PlayerSnapshot,
  ProximityBand,
  ProximityPeerSnapshot,
} from "@ig-campus/contracts";
import { COMMONS_ACOUSTIC_ENVIRONMENT } from "@ig-campus/contracts";
import {
  getPlayerCollider,
  getZoneAtPosition,
  MAP_COLUMNS,
  MAP_HEIGHT,
  MAP_ROWS,
  MAP_WIDTH,
  OBSTACLES,
  PLAYER_COLLIDER,
  type Rect,
  SPAWN_POINTS,
  TILE_SIZE,
  type Vector2,
} from "./campusMap.js";

export * from "./campusMap.js";

/** @deprecated Use PLAYER_COLLIDER for collision geometry. */
export const PLAYER_RADIUS = PLAYER_COLLIDER.width / 2;
export const PLAYER_SPEED = 150;
export const SIMULATION_RATE = 20;
export const CLOSE_PROXIMITY_RADIUS = TILE_SIZE * 3;
export const PROXIMITY_RADIUS = TILE_SIZE * 6;
export const FOCUS_BARRIER_RADIUS = TILE_SIZE * 2;

export type FocusBarrier = {
  sessionId: string;
  x: number;
  y: number;
  radius: number;
};

export function getSpawnPoint(index: number): Vector2 {
  const firstSpawn = SPAWN_POINTS[0] ?? { x: TILE_SIZE * 1.5, y: TILE_SIZE * 1.75 };
  return SPAWN_POINTS[index % SPAWN_POINTS.length] ?? firstSpawn;
}

export function getAvailableSpawnPoint(occupiedPositions: Vector2[]): Vector2 {
  const minimumDistance = PLAYER_RADIUS * 2 + 8;
  const candidates = [...SPAWN_POINTS, ...getWalkableTileCenters()];
  const freeCandidate = candidates.find((candidate) =>
    occupiedPositions.every((position) => getDistance(candidate, position) >= minimumDistance),
  );

  if (freeCandidate) {
    return { ...freeCandidate };
  }

  const safestCandidate = candidates.reduce<{ candidate: Vector2; clearance: number } | null>(
    (best, candidate) => {
      const clearance = Math.min(
        ...occupiedPositions.map((position) => getDistance(candidate, position)),
      );

      if (!best || clearance > best.clearance) {
        return { candidate, clearance };
      }

      return best;
    },
    null,
  );

  return safestCandidate ? { ...safestCandidate.candidate } : getSpawnPoint(0);
}

export function moveWithCollision(
  position: Vector2,
  input: MovementInput,
  deltaMs: number,
  focusBarriers: readonly FocusBarrier[] = [],
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
  const x =
    canStandAt(movedOnX) && canEnterFocusBarrier(movedOnX, focusBarriers) ? movedOnX.x : position.x;

  const movedOnY = { x, y: position.y + velocity.y };
  const y =
    canStandAt(movedOnY) && canEnterFocusBarrier(movedOnY, focusBarriers) ? movedOnY.y : position.y;

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
  const axis = inputToAxis(input);
  return axis.x !== 0 || axis.y !== 0;
}

export function getDistance(from: Vector2, to: Vector2): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

export function getProximityBand(distance: number): ProximityBand | null {
  if (distance <= CLOSE_PROXIMITY_RADIUS) {
    return "close";
  }

  if (distance <= PROXIMITY_RADIUS) {
    return "nearby";
  }

  return null;
}

export function getProximityPeer(
  listener: PlayerSnapshot,
  candidate: PlayerSnapshot,
): ProximityPeerSnapshot | null {
  if (listener.sessionId === candidate.sessionId) {
    return null;
  }

  const distance = getDistance(listener, candidate);
  const band = getProximityBand(distance);

  if (!band) {
    return null;
  }

  return {
    sessionId: candidate.sessionId,
    distance: Math.round(distance),
    band,
  };
}

export function getAcousticEnvironment(player: PlayerSnapshot): AcousticEnvironmentSnapshot {
  const zone = getZoneAtPosition(player);

  if (!zone) {
    return { ...COMMONS_ACOUSTIC_ENVIRONMENT };
  }

  return {
    zoneId: zone.id,
    label: zone.label,
    mode: zone.acousticMode,
  };
}

export function arePlayersAcousticallyCompatible(
  first: PlayerSnapshot,
  second: PlayerSnapshot,
): boolean {
  if (first.focusMode || second.focusMode) {
    return false;
  }

  const firstEnvironment = getAcousticEnvironment(first);
  const secondEnvironment = getAcousticEnvironment(second);

  if (firstEnvironment.mode === "open" && secondEnvironment.mode === "open") {
    return true;
  }

  return (
    firstEnvironment.mode === "private" &&
    secondEnvironment.mode === "private" &&
    firstEnvironment.zoneId === secondEnvironment.zoneId
  );
}

export function buildAcousticPolicy(
  listener: PlayerSnapshot,
  players: PlayerSnapshot[],
): Omit<AcousticSnapshot, "revision"> {
  const compatiblePlayers = players
    .filter(
      (candidate) =>
        candidate.sessionId !== listener.sessionId &&
        !listener.focusMode &&
        !candidate.focusMode &&
        arePlayersAcousticallyCompatible(listener, candidate),
    )
    .sort((first, second) => first.sessionId.localeCompare(second.sessionId));
  const audiblePeers = compatiblePlayers
    .map((candidate) => getProximityPeer(listener, candidate))
    .filter((peer) => peer !== null)
    .sort((first, second) => first.sessionId.localeCompare(second.sessionId));

  return {
    environment: getAcousticEnvironment(listener),
    allowedPeerSessionIds: compatiblePlayers.map((player) => player.sessionId),
    audiblePeers,
  };
}

export function getFocusBarriers(
  players: readonly PlayerSnapshot[],
  moverSessionId: string,
): FocusBarrier[] {
  return players
    .filter((player) => player.sessionId !== moverSessionId && player.focusMode)
    .map((player) => ({
      sessionId: player.sessionId,
      x: player.x,
      y: player.y,
      radius: FOCUS_BARRIER_RADIUS,
    }));
}

function canEnterFocusBarrier(position: Vector2, barriers: readonly FocusBarrier[]): boolean {
  return barriers.every((barrier) => getDistance(position, barrier) >= barrier.radius);
}

export function canStandAt(position: Vector2): boolean {
  const playerBox = getPlayerCollider(position);

  return (
    playerBox.x >= 0 &&
    playerBox.y >= 0 &&
    playerBox.x + playerBox.width <= MAP_WIDTH &&
    playerBox.y + playerBox.height <= MAP_HEIGHT &&
    !OBSTACLES.some((obstacle) => rectanglesOverlap(playerBox, obstacle))
  );
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

function getWalkableTileCenters(): Vector2[] {
  const candidates: Vector2[] = [];

  for (let row = 1; row < MAP_ROWS - 1; row += 1) {
    for (let column = 1; column < MAP_COLUMNS - 1; column += 1) {
      const x = (column + 0.5) * TILE_SIZE;
      const y = (row + 0.75) * TILE_SIZE;
      const candidate = { x, y };

      if (canStandAt(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}
