import type { AcousticMode, CampusZoneId } from "@ig-campus/contracts";

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
  spawns: readonly Vector2[];
};

export type PlayerCollider = {
  width: number;
  height: number;
};

const CAMPUS_COLUMNS = 48;
const CAMPUS_ROWS = 34;
const EMPTY_TILE: CampusTileId = "empty";

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

export const CAMPUS_MAP: CampusMapDefinition = createCampusMap();

export const MAP_COLUMNS = CAMPUS_MAP.columns;
export const MAP_ROWS = CAMPUS_MAP.rows;
export const MAP_WIDTH = MAP_COLUMNS * CAMPUS_MAP.tileSize;
export const MAP_HEIGHT = MAP_ROWS * CAMPUS_MAP.tileSize;
export const ZONES: readonly CampusZone[] = CAMPUS_MAP.zones;
export const SPAWN_POINTS: readonly Vector2[] = CAMPUS_MAP.spawns;
export const OBSTACLES: readonly Rect[] = deriveObstacles(CAMPUS_MAP);

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

  if (map.columns !== CAMPUS_COLUMNS || map.rows !== CAMPUS_ROWS) {
    errors.push(`dimensoes esperadas: ${CAMPUS_COLUMNS}x${CAMPUS_ROWS}`);
  }

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

  return errors;
}

function createCampusMap(): CampusMapDefinition {
  const ground = createLayer("grass");
  const structures = createLayer(EMPTY_TILE);
  const decorations = createLayer(EMPTY_TILE);

  paintGround(ground);
  paintStructures(structures);
  paintDecorations(decorations);

  return Object.freeze({
    id: "inforgeneses-campus",
    columns: CAMPUS_COLUMNS,
    rows: CAMPUS_ROWS,
    tileSize: TILE_SIZE,
    layers: Object.freeze({
      ground: Object.freeze(ground),
      structures: Object.freeze(structures),
      decorations: Object.freeze(decorations),
    }),
    zones: Object.freeze([
      createZone("patio", "Pátio", "open", 2, 2, 19, 13),
      createZone("desenvolvimento", "Desenvolvimento", "open", 26, 2, 20, 13),
      createZone("biblioteca", "Biblioteca", "open", 2, 19, 19, 13),
      createZone("reitoria", "Administração / Reitoria", "private", 26, 19, 20, 13),
    ]),
    spawns: Object.freeze([
      feetAtTile(7, 12),
      feetAtTile(9, 12),
      feetAtTile(7, 10),
      feetAtTile(9, 10),
      feetAtTile(23, 16),
      feetAtTile(24, 17),
    ]),
  });
}

function paintGround(layer: CampusTileId[]): void {
  fillTileRect(layer, 1, 15, 46, 4, "path");
  fillTileRect(layer, 22, 1, 4, 32, "path");
  fillTileRect(layer, 3, 3, 17, 11, "patio-floor");
  fillTileRect(layer, 27, 3, 18, 11, "development-floor");
  fillTileRect(layer, 3, 20, 17, 11, "library-floor");
  fillTileRect(layer, 27, 20, 18, 11, "administration-floor");

  for (const [column, row] of [
    [2, 16],
    [6, 17],
    [19, 16],
    [28, 17],
    [42, 16],
    [23, 4],
    [24, 28],
    [46, 7],
  ] as const) {
    setTile(layer, column, row, "grass-flowers");
  }
}

function paintStructures(layer: CampusTileId[]): void {
  outlineTileRect(layer, 0, 0, CAMPUS_COLUMNS, CAMPUS_ROWS, "wall-light");

  outlineTileRect(layer, 26, 2, 20, 13, "wall-tech");
  setTile(layer, 35, 14, "door");
  setTile(layer, 36, 14, "door");
  setTile(layer, 29, 14, "window");
  setTile(layer, 42, 14, "window");
  setTile(layer, 26, 2, "roof");
  setTile(layer, 45, 2, "roof");

  outlineTileRect(layer, 2, 19, 19, 13, "wall-library");
  setTile(layer, 10, 19, "door");
  setTile(layer, 11, 19, "door");
  setTile(layer, 5, 19, "window");
  setTile(layer, 17, 19, "window");
  setTile(layer, 2, 19, "roof");
  setTile(layer, 20, 19, "roof");

  outlineTileRect(layer, 26, 19, 20, 13, "wall-administration");
  setTile(layer, 35, 19, "door");
  setTile(layer, 36, 19, "door");
  setTile(layer, 29, 19, "window");
  setTile(layer, 42, 19, "window");
  setTile(layer, 26, 19, "roof");
  setTile(layer, 45, 19, "roof");
}

function paintDecorations(layer: CampusTileId[]): void {
  fillTileRect(layer, 11, 7, 2, 2, "fountain");
  setTile(layer, 6, 10, "bench");
  setTile(layer, 17, 10, "bench");
  setTile(layer, 5, 5, "tree");
  setTile(layer, 17, 5, "tree");
  setTile(layer, 4, 12, "shrub");
  setTile(layer, 18, 12, "shrub");
  setTile(layer, 8, 5, "flowers");
  setTile(layer, 15, 12, "flowers");
  setTile(layer, 3, 14, "sign");

  for (const row of [5, 8, 11]) {
    for (const column of [29, 32, 39, 42]) {
      setTile(layer, column, row, "computer");
      setTile(layer, column, row + 1, "chair");
    }
  }

  for (const row of [22, 25, 28]) {
    for (let column = 5; column <= 17; column += 1) {
      if (column !== 10 && column !== 11) {
        setTile(layer, column, row, "bookshelf");
      }
    }
  }
  setTile(layer, 4, 29, "desk");
  setTile(layer, 18, 29, "desk");

  fillTileRect(layer, 32, 25, 8, 1, "admin-desk");
  for (const column of [33, 35, 37, 39]) {
    setTile(layer, column, 27, "chair");
  }
  setTile(layer, 28, 22, "shrub");
  setTile(layer, 43, 22, "shrub");
  setTile(layer, 35, 22, "sign");

  for (const [column, row] of [
    [2, 6],
    [21, 5],
    [22, 8],
    [25, 11],
    [46, 12],
    [22, 22],
    [25, 27],
    [46, 28],
  ] as const) {
    setTile(layer, column, row, "tree");
  }
}

function createLayer(fill: CampusTileId): CampusTileId[] {
  return Array.from({ length: CAMPUS_COLUMNS * CAMPUS_ROWS }, () => fill);
}

function fillTileRect(
  layer: CampusTileId[],
  x: number,
  y: number,
  width: number,
  height: number,
  tileId: CampusTileId,
): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      setTile(layer, column, row, tileId);
    }
  }
}

function outlineTileRect(
  layer: CampusTileId[],
  x: number,
  y: number,
  width: number,
  height: number,
  tileId: CampusTileId,
): void {
  fillTileRect(layer, x, y, width, 1, tileId);
  fillTileRect(layer, x, y + height - 1, width, 1, tileId);
  fillTileRect(layer, x, y, 1, height, tileId);
  fillTileRect(layer, x + width - 1, y, 1, height, tileId);
}

function setTile(layer: CampusTileId[], column: number, row: number, tileId: CampusTileId): void {
  if (!isTileCoordinateInsideDimensions(column, row, CAMPUS_COLUMNS, CAMPUS_ROWS)) {
    throw new RangeError(`Tile fora do mapa: ${column},${row}`);
  }

  layer[row * CAMPUS_COLUMNS + column] = tileId;
}

function createZone(
  id: CampusZoneId,
  label: string,
  acousticMode: AcousticMode,
  column: number,
  row: number,
  width: number,
  height: number,
): CampusZone {
  return Object.freeze({
    id,
    label,
    acousticMode,
    rect: Object.freeze({
      x: column * TILE_SIZE,
      y: row * TILE_SIZE,
      width: width * TILE_SIZE,
      height: height * TILE_SIZE,
    }),
  });
}

function feetAtTile(column: number, row: number): Readonly<Vector2> {
  return Object.freeze({
    x: (column + 0.5) * TILE_SIZE,
    y: (row + 0.75) * TILE_SIZE,
  });
}

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
