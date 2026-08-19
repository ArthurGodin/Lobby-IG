import type { AcousticMode, CampusZoneId } from "@ig-campus/contracts";
import defaultCampusMap from "./campus.json" with { type: "json" };

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

export const ART_TILE_SIZE = 16;
export const ART_SCALE = 2;
export const TILE_SIZE = ART_TILE_SIZE * ART_SCALE;

export const CAMPUS_TILE_IDS = [
  "empty",
  "grass",
  "grass-flowers",
  "path",
  "patio-floor",
  "development-floor",
  "library-floor",
  "administration-floor",
  "wall-light",
  "wall-tech",
  "wall-library",
  "wall-administration",
  "door",
  "window",
  "roof",
  "tree",
  "shrub",
  "flowers",
  "bench",
  "fountain",
  "desk",
  "computer",
  "chair",
  "bookshelf",
  "admin-desk",
  "sign",
] as const;

export type CampusTileId = (typeof CAMPUS_TILE_IDS)[number];
export type CampusMapLayer = readonly CampusTileId[];

export type { CampusZoneId } from "@ig-campus/contracts";

export type CampusZone = {
  id: CampusZoneId;
  label: string;
  acousticMode: AcousticMode;
  rect: Rect;
};

export const WORLD_INTERACTABLE_KINDS = ["focus_desk", "screen_station", "whiteboard"] as const;
export type WorldInteractableKind = (typeof WORLD_INTERACTABLE_KINDS)[number];

export type WorldInteractableBase = {
  id: string;
  kind: WorldInteractableKind;
  label: string;
  interactionPosition: Vector2;
  interactionRadius: number;
  priority: number;
};

export type FocusDeskDefinition = WorldInteractableBase & {
  kind: "focus_desk";
  seatPosition: Vector2;
  exitPosition: Vector2;
  facing: "up" | "down" | "left" | "right";
};

export type ScreenStationDefinition = WorldInteractableBase & {
  kind: "screen_station";
  audienceRadius: number;
};

export type WhiteboardDefinition = WorldInteractableBase & {
  kind: "whiteboard";
};

export type WorldInteractableDefinition =
  | FocusDeskDefinition
  | ScreenStationDefinition
  | WhiteboardDefinition;

export type CampusMapDefinition = {
  id: "inforgeneses-campus";
  columns: number;
  rows: number;
  tileSize: number;
  layers: {
    ground: CampusMapLayer;
    structures: CampusMapLayer;
    decorations: CampusMapLayer;
  };
  zones: readonly CampusZone[];
  interactables: readonly WorldInteractableDefinition[];
  spawns: readonly Vector2[];
};

export type PlayerCollider = {
  width: number;
  height: number;
};

export const PLAYER_COLLIDER: Readonly<PlayerCollider> = Object.freeze({
  width: 18,
  height: 10,
});

const BLOCKING_TILE_IDS: ReadonlySet<CampusTileId> = new Set([
  "wall-light",
  "wall-tech",
  "wall-library",
  "wall-administration",
  "window",
  "roof",
  "tree",
  "shrub",
  "bench",
  "fountain",
  "desk",
  "computer",
  "chair",
  "bookshelf",
  "admin-desk",
  "sign",
]);

export let CAMPUS_MAP: CampusMapDefinition = defaultCampusMap as unknown as CampusMapDefinition;

export let MAP_COLUMNS = CAMPUS_MAP.columns;
export let MAP_ROWS = CAMPUS_MAP.rows;
export let MAP_WIDTH = MAP_COLUMNS * CAMPUS_MAP.tileSize;
export let MAP_HEIGHT = MAP_ROWS * CAMPUS_MAP.tileSize;
export let ZONES: readonly CampusZone[] = CAMPUS_MAP.zones;
export let INTERACTABLES: readonly WorldInteractableDefinition[] = CAMPUS_MAP.interactables;
export let SPAWN_POINTS: readonly Vector2[] = CAMPUS_MAP.spawns;
export let OBSTACLES: readonly Rect[] = deriveObstacles(CAMPUS_MAP);

export function loadCampusMap(newMap: CampusMapDefinition): void {
  CAMPUS_MAP = newMap;
  MAP_COLUMNS = CAMPUS_MAP.columns;
  MAP_ROWS = CAMPUS_MAP.rows;
  MAP_WIDTH = MAP_COLUMNS * CAMPUS_MAP.tileSize;
  MAP_HEIGHT = MAP_ROWS * CAMPUS_MAP.tileSize;
  ZONES = CAMPUS_MAP.zones;
  INTERACTABLES = CAMPUS_MAP.interactables;
  SPAWN_POINTS = CAMPUS_MAP.spawns;
  OBSTACLES = deriveObstacles(CAMPUS_MAP);

  const validationErrors = validateCampusMap(CAMPUS_MAP);
  if (validationErrors.length > 0) {
    throw new Error(`Mapa canonico invalido:\n${validationErrors.join("\n")}`);
  }
}

const validationErrors = validateCampusMap(CAMPUS_MAP);

if (validationErrors.length > 0) {
  throw new Error(`Mapa canonico invalido:\n${validationErrors.join("\n")}`);
}

export function getCampusTile(
  layer: CampusMapLayer,
  column: number,
  row: number,
): CampusTileId | null {
  if (!isTileCoordinateInsideMap(column, row)) {
    return null;
  }

  return layer[row * MAP_COLUMNS + column] ?? null;
}

export function isBlockingTile(tileId: CampusTileId): boolean {
  return BLOCKING_TILE_IDS.has(tileId);
}

export function getPlayerCollider(position: Vector2): Rect {
  return {
    x: position.x - PLAYER_COLLIDER.width / 2,
    y: position.y - PLAYER_COLLIDER.height,
    width: PLAYER_COLLIDER.width,
    height: PLAYER_COLLIDER.height,
  };
}

export function isRectInsideMap(rect: Rect): boolean {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= MAP_WIDTH &&
    rect.y + rect.height <= MAP_HEIGHT
  );
}

export function getZoneAtPosition(
  position: Vector2,
  map: CampusMapDefinition = CAMPUS_MAP,
): CampusZone | null {
  return (
    map.zones.find(
      (zone) =>
        position.x >= zone.rect.x &&
        position.x < zone.rect.x + zone.rect.width &&
        position.y >= zone.rect.y &&
        position.y < zone.rect.y + zone.rect.height,
    ) ?? null
  );
}

export function validateCampusMap(map: CampusMapDefinition): string[] {
  const errors: string[] = [];
  const expectedLayerLength = map.columns * map.rows;
  const knownTileIds = new Set<string>(CAMPUS_TILE_IDS);

  if (map.tileSize !== TILE_SIZE) {
    errors.push(`tileSize esperado: ${TILE_SIZE}`);
  }

  for (const [layerName, layer] of Object.entries(map.layers)) {
    if (layer.length !== expectedLayerLength) {
      errors.push(`camada ${layerName} possui ${layer.length}, esperado ${expectedLayerLength}`);
    }

    layer.forEach((tileId, index) => {
      if (!knownTileIds.has(tileId)) {
        errors.push(`tile desconhecido ${String(tileId)} em ${layerName}[${index}]`);
      }
    });
  }

  const zoneIds = new Set<string>();

  for (const [zoneIndex, zone] of map.zones.entries()) {
    if (zoneIds.has(zone.id)) {
      errors.push(`zona duplicada: ${zone.id}`);
    }

    zoneIds.add(zone.id);

    if (!isRectWithinDimensions(zone.rect, map.columns * map.tileSize, map.rows * map.tileSize)) {
      errors.push(`zona fora do mapa: ${zone.id}`);
    }

    for (const previousZone of map.zones.slice(0, zoneIndex)) {
      if (rectanglesOverlap(zone.rect, previousZone.rect)) {
        errors.push(`zonas sobrepostas: ${previousZone.id} e ${zone.id}`);
      }
    }
  }

  const obstacles = deriveObstacles(map);

  obstacles.forEach((obstacle, index) => {
    if (!isRectWithinDimensions(obstacle, map.columns * map.tileSize, map.rows * map.tileSize)) {
      errors.push(`collider fora do mapa: ${index}`);
    }
  });

  map.spawns.forEach((spawn, index) => {
    const collider = getPlayerColliderForMap(spawn, map);
    const insideMap = isRectWithinDimensions(
      collider,
      map.columns * map.tileSize,
      map.rows * map.tileSize,
    );
    const blocked = obstacles.some((obstacle) => rectanglesOverlap(collider, obstacle));

    if (!insideMap || blocked) {
      errors.push(`spawn nao caminhavel: ${index}`);
    }
  });

  const interactableIds = new Set<string>();

  for (const interactable of map.interactables) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(interactable.id) || interactableIds.has(interactable.id)) {
      errors.push(`objeto interativo duplicado ou com id inválido: ${interactable.id || "vazio"}`);
    }
    interactableIds.add(interactable.id);

    if (
      !WORLD_INTERACTABLE_KINDS.includes(interactable.kind) ||
      interactable.label.trim().length === 0 ||
      interactable.label.length > 64 ||
      !Number.isFinite(interactable.interactionPosition.x) ||
      !Number.isFinite(interactable.interactionPosition.y) ||
      !isRectWithinDimensions(
        getPlayerColliderForMap(interactable.interactionPosition, map),
        map.columns * map.tileSize,
        map.rows * map.tileSize,
      ) ||
      !Number.isFinite(interactable.interactionRadius) ||
      interactable.interactionRadius <= 0 ||
      interactable.interactionRadius > map.tileSize * 10 ||
      !Number.isSafeInteger(interactable.priority) ||
      interactable.priority < 0 ||
      interactable.priority > 1_000
    ) {
      errors.push(`configuração interativa inválida: ${interactable.id}`);
    }

    if (interactable.kind === "focus_desk") {
      if (
        !isRectWithinDimensions(
          getPlayerColliderForMap(interactable.seatPosition, map),
          map.columns * map.tileSize,
          map.rows * map.tileSize,
        )
      ) {
        errors.push(`assento de mesa fora do mapa: ${interactable.id}`);
      }

      const exitCollider = getPlayerColliderForMap(interactable.exitPosition, map);
      if (
        !isRectWithinDimensions(
          exitCollider,
          map.columns * map.tileSize,
          map.rows * map.tileSize,
        ) ||
        obstacles.some((obstacle) => rectanglesOverlap(exitCollider, obstacle))
      ) {
        errors.push(`configuração de mesa de foco inválida: ${interactable.id}`);
      }
    }

    if (
      interactable.kind === "screen_station" &&
      (!Number.isFinite(interactable.audienceRadius) ||
        interactable.audienceRadius < interactable.interactionRadius ||
        interactable.audienceRadius > map.tileSize * 12)
    ) {
      errors.push(`configuração de estação de tela inválida: ${interactable.id}`);
    }
  }

  return errors;
}

// End of validation and map update functions

function deriveObstacles(map: CampusMapDefinition): readonly Rect[] {
  const obstacles: Rect[] = [];

  for (let row = 0; row < map.rows; row += 1) {
    let runStart: number | null = null;

    for (let column = 0; column <= map.columns; column += 1) {
      const blocked =
        column < map.columns &&
        (isBlockingTileAt(map.layers.structures, column, row, map.columns) ||
          isBlockingTileAt(map.layers.decorations, column, row, map.columns));

      if (blocked && runStart === null) {
        runStart = column;
      }

      if (!blocked && runStart !== null) {
        obstacles.push(
          Object.freeze({
            x: runStart * map.tileSize,
            y: row * map.tileSize,
            width: (column - runStart) * map.tileSize,
            height: map.tileSize,
          }),
        );
        runStart = null;
      }
    }
  }

  return Object.freeze(obstacles);
}

function isBlockingTileAt(
  layer: CampusMapLayer,
  column: number,
  row: number,
  columns: number,
): boolean {
  const tileId = layer[row * columns + column];
  return tileId !== undefined && isBlockingTile(tileId);
}

function isTileCoordinateInsideMap(column: number, row: number): boolean {
  return isTileCoordinateInsideDimensions(column, row, MAP_COLUMNS, MAP_ROWS);
}

function isTileCoordinateInsideDimensions(
  column: number,
  row: number,
  columns: number,
  rows: number,
): boolean {
  return (
    Number.isInteger(column) &&
    Number.isInteger(row) &&
    column >= 0 &&
    row >= 0 &&
    column < columns &&
    row < rows
  );
}

function getPlayerColliderForMap(position: Vector2, _map: CampusMapDefinition): Rect {
  return {
    x: position.x - PLAYER_COLLIDER.width / 2,
    y: position.y - PLAYER_COLLIDER.height,
    width: PLAYER_COLLIDER.width,
    height: PLAYER_COLLIDER.height,
  };
}

function isRectWithinDimensions(rect: Rect, width: number, height: number): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= width &&
    rect.y + rect.height <= height
  );
}

function rectanglesOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
