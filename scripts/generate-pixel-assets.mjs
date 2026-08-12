import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIRECTORY = resolve(SCRIPT_DIRECTORY, "../apps/web/public/assets/pixel");

const TILE_SIZE = 16;
const TILESET_COLUMNS = 8;
const TILESET_ROWS = 5;
const AVATAR_FRAME_WIDTH = 16;
const AVATAR_FRAME_HEIGHT = 24;
const AVATAR_COLUMNS = 3;
const AVATAR_ROWS = 4;

const COLORS = Object.freeze({
  transparent: [0, 0, 0, 0],
  outline: [35, 49, 45, 255],
  outlineSoft: [53, 69, 62, 255],
  grassDark: [75, 128, 83, 255],
  grass: [105, 158, 91, 255],
  grassLight: [139, 184, 103, 255],
  leafDark: [42, 94, 63, 255],
  leaf: [54, 124, 73, 255],
  leafLight: [92, 153, 81, 255],
  creamDark: [190, 176, 133, 255],
  cream: [222, 209, 166, 255],
  creamLight: [241, 230, 193, 255],
  stoneDark: [111, 119, 111, 255],
  stone: [151, 155, 138, 255],
  stoneLight: [190, 189, 163, 255],
  terracottaDark: [124, 61, 45, 255],
  terracotta: [173, 79, 54, 255],
  terracottaLight: [208, 112, 72, 255],
  woodDark: [91, 61, 45, 255],
  wood: [139, 91, 58, 255],
  woodLight: [180, 128, 76, 255],
  blueDark: [61, 82, 99, 255],
  blue: [86, 118, 137, 255],
  blueLight: [137, 163, 169, 255],
  adminDark: [51, 45, 64, 255],
  admin: [79, 65, 88, 255],
  adminLight: [117, 92, 105, 255],
  goldDark: [143, 103, 42, 255],
  gold: [199, 151, 55, 255],
  goldLight: [230, 192, 91, 255],
  waterDark: [50, 112, 137, 255],
  water: [73, 151, 172, 255],
  waterLight: [129, 194, 192, 255],
  flowerWhite: [244, 237, 214, 255],
  flowerPink: [216, 104, 113, 255],
  skinDark: [132, 78, 57, 255],
  skin: [190, 127, 88, 255],
  skinLight: [229, 171, 117, 255],
  hairDark: [51, 37, 35, 255],
  hair: [79, 54, 42, 255],
  hairLight: [113, 75, 49, 255],
  pantsDark: [43, 57, 72, 255],
  pants: [61, 82, 103, 255],
  shoe: [45, 39, 38, 255],
  white: [255, 255, 255, 255],
  maskDark: [102, 102, 102, 255],
  mask: [190, 190, 190, 255],
  maskLight: [245, 245, 245, 255],
  shadow: [30, 39, 37, 76],
});

class Raster {
  constructor(width, height, fill = COLORS.transparent) {
    this.width = width;
    this.height = height;
    this.pixels = Buffer.alloc(width * height * 4);
    this.fill(fill);
  }

  fill(color) {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        this.pixel(x, y, color);
      }
    }
  }

  pixel(x, y, color) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }

    const index = (y * this.width + x) * 4;
    this.pixels[index] = color[0];
    this.pixels[index + 1] = color[1];
    this.pixels[index + 2] = color[2];
    this.pixels[index + 3] = color[3];
  }

  rect(x, y, width, height, color) {
    for (let offsetY = 0; offsetY < height; offsetY += 1) {
      for (let offsetX = 0; offsetX < width; offsetX += 1) {
        this.pixel(x + offsetX, y + offsetY, color);
      }
    }
  }

  lineHorizontal(x, y, width, color) {
    this.rect(x, y, width, 1, color);
  }

  lineVertical(x, y, height, color) {
    this.rect(x, y, 1, height, color);
  }

  blit(source, destinationX, destinationY) {
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const sourceIndex = (y * source.width + x) * 4;
        this.pixel(destinationX + x, destinationY + y, [
          source.pixels[sourceIndex],
          source.pixels[sourceIndex + 1],
          source.pixels[sourceIndex + 2],
          source.pixels[sourceIndex + 3],
        ]);
      }
    }
  }
}

function makeTile(fill = COLORS.transparent) {
  return new Raster(TILE_SIZE, TILE_SIZE, fill);
}

function drawGrass(tile) {
  tile.fill(COLORS.grass);
  for (const [x, y] of [
    [1, 2],
    [9, 1],
    [5, 7],
    [13, 9],
    [2, 13],
    [10, 14],
  ]) {
    tile.pixel(x, y, COLORS.grassLight);
    tile.pixel(x + 1, y + 1, COLORS.grassDark);
  }
}

function drawGrassTufts(tile) {
  drawGrass(tile);
  for (const [x, y] of [
    [3, 4],
    [11, 5],
    [7, 12],
  ]) {
    tile.pixel(x, y, COLORS.leafDark);
    tile.pixel(x + 1, y - 1, COLORS.leafLight);
    tile.pixel(x + 2, y, COLORS.leafDark);
  }
}

function drawGrassFlowers(tile) {
  drawGrass(tile);
  for (const [x, y, color] of [
    [4, 4, COLORS.flowerWhite],
    [12, 7, COLORS.flowerPink],
    [7, 13, COLORS.goldLight],
  ]) {
    tile.pixel(x, y - 1, color);
    tile.pixel(x - 1, y, color);
    tile.pixel(x + 1, y, color);
    tile.pixel(x, y + 1, color);
    tile.pixel(x, y, COLORS.goldDark);
  }
}

function drawPath(tile) {
  tile.fill(COLORS.cream);
  for (const [x, y] of [
    [2, 3],
    [11, 2],
    [7, 8],
    [13, 12],
    [3, 14],
  ]) {
    tile.pixel(x, y, COLORS.creamDark);
    tile.pixel((x + 5) % TILE_SIZE, (y + 3) % TILE_SIZE, COLORS.creamLight);
  }
}

function drawPathEdge(tile, side) {
  drawGrass(tile);
  if (side === "north" || side === "south") {
    const pathY = side === "north" ? 0 : 5;
    tile.rect(0, pathY, TILE_SIZE, 11, COLORS.cream);
    tile.lineHorizontal(0, side === "north" ? 10 : 5, TILE_SIZE, COLORS.creamDark);
    tile.lineHorizontal(0, side === "north" ? 11 : 4, TILE_SIZE, COLORS.grassDark);
    tile.pixel(3, pathY + 3, COLORS.creamLight);
    tile.pixel(11, pathY + 7, COLORS.creamDark);
    return;
  }

  const pathX = side === "west" ? 0 : 5;
  tile.rect(pathX, 0, 11, TILE_SIZE, COLORS.cream);
  tile.lineVertical(side === "west" ? 10 : 5, 0, TILE_SIZE, COLORS.creamDark);
  tile.lineVertical(side === "west" ? 11 : 4, 0, TILE_SIZE, COLORS.grassDark);
  tile.pixel(pathX + 3, 3, COLORS.creamLight);
  tile.pixel(pathX + 7, 11, COLORS.creamDark);
}

function drawStoneFloor(tile) {
  tile.fill(COLORS.stoneLight);
  for (let y = 0; y < TILE_SIZE; y += 8) {
    tile.lineHorizontal(0, y, TILE_SIZE, COLORS.stoneDark);
    const offset = y === 0 ? 0 : 4;
    for (let x = offset; x < TILE_SIZE; x += 8) {
      tile.lineVertical(x, y, 8, COLORS.stone);
    }
  }
  tile.pixel(2, 3, COLORS.creamLight);
  tile.pixel(11, 11, COLORS.cream);
}

function drawWoodFloor(tile) {
  tile.fill(COLORS.woodLight);
  for (let y = 0; y < TILE_SIZE; y += 4) {
    tile.lineHorizontal(0, y, TILE_SIZE, COLORS.woodDark);
    tile.pixel((y * 3 + 2) % TILE_SIZE, y + 2, COLORS.wood);
    tile.pixel((y * 3 + 9) % TILE_SIZE, y + 2, COLORS.creamDark);
  }
}

function drawLibraryFloor(tile) {
  tile.fill(COLORS.blueLight);
  for (let y = 0; y < TILE_SIZE; y += 8) {
    for (let x = 0; x < TILE_SIZE; x += 8) {
      tile.rect(x, y, 7, 7, (x + y) % 16 === 0 ? COLORS.creamLight : COLORS.blueLight);
      tile.lineHorizontal(x, y + 7, 8, COLORS.blue);
      tile.lineVertical(x + 7, y, 8, COLORS.blue);
    }
  }
}

function drawAdminFloor(tile) {
  tile.fill(COLORS.admin);
  tile.lineHorizontal(0, 0, TILE_SIZE, COLORS.adminDark);
  tile.lineVertical(0, 0, TILE_SIZE, COLORS.adminDark);
  tile.lineHorizontal(0, 8, TILE_SIZE, COLORS.adminDark);
  tile.lineVertical(8, 0, TILE_SIZE, COLORS.adminDark);
  tile.rect(2, 2, 4, 4, COLORS.adminLight);
  tile.rect(10, 10, 4, 4, COLORS.goldDark);
  tile.pixel(3, 3, COLORS.gold);
  tile.pixel(11, 11, COLORS.gold);
}

function drawWall(tile) {
  tile.fill(COLORS.cream);
  tile.lineHorizontal(0, 0, TILE_SIZE, COLORS.creamLight);
  tile.lineHorizontal(0, 1, TILE_SIZE, COLORS.stone);
  tile.lineHorizontal(0, 14, TILE_SIZE, COLORS.creamDark);
  tile.lineHorizontal(0, 15, TILE_SIZE, COLORS.outlineSoft);
  for (let y = 5; y < 14; y += 5) {
    tile.lineHorizontal(0, y, TILE_SIZE, COLORS.creamDark);
    const offset = y === 5 ? 4 : 0;
    for (let x = offset; x < TILE_SIZE; x += 8) {
      tile.pixel(x, y - 1, COLORS.creamDark);
    }
  }
}

function drawWindow(tile) {
  drawWall(tile);
  tile.rect(3, 3, 10, 9, COLORS.outlineSoft);
  tile.rect(4, 4, 8, 7, COLORS.blue);
  tile.rect(5, 4, 3, 3, COLORS.blueLight);
  tile.lineVertical(8, 4, 7, COLORS.creamDark);
  tile.lineHorizontal(4, 8, 8, COLORS.creamDark);
  tile.lineHorizontal(2, 12, 12, COLORS.stoneDark);
}

function drawTechWall(tile) {
  drawWall(tile);
  tile.lineHorizontal(0, 3, TILE_SIZE, COLORS.blueDark);
  tile.lineHorizontal(0, 4, TILE_SIZE, COLORS.blue);
  for (const x of [2, 7, 12]) {
    tile.pixel(x, 9, COLORS.blueLight);
    tile.pixel(x + 1, 9, COLORS.grassLight);
  }
}

function drawLibraryWall(tile) {
  drawWall(tile);
  tile.rect(2, 3, 12, 9, COLORS.woodDark);
  tile.lineHorizontal(2, 8, 12, COLORS.woodLight);
  for (const [x, color] of [
    [3, COLORS.terracotta],
    [6, COLORS.blue],
    [9, COLORS.gold],
    [12, COLORS.grassDark],
  ]) {
    tile.rect(x, 4, 2, 4, color);
    tile.rect(14 - x, 9, 2, 3, color);
  }
}

function drawDoor(tile) {
  drawWall(tile);
  tile.rect(4, 3, 8, 13, COLORS.outline);
  tile.rect(5, 4, 6, 12, COLORS.wood);
  tile.lineVertical(6, 4, 12, COLORS.woodLight);
  tile.lineVertical(10, 4, 12, COLORS.woodDark);
  tile.pixel(9, 10, COLORS.goldLight);
}

function drawRoof(tile) {
  tile.fill(COLORS.terracotta);
  for (let y = 0; y < TILE_SIZE; y += 4) {
    tile.lineHorizontal(0, y, TILE_SIZE, COLORS.terracottaDark);
    for (let x = (y / 4) % 2 === 0 ? 0 : 4; x < TILE_SIZE; x += 8) {
      tile.lineVertical(x, y + 1, 3, COLORS.terracottaDark);
      tile.pixel(x + 1, y + 1, COLORS.terracottaLight);
    }
  }
}

function drawTree(tile) {
  tile.rect(7, 11, 3, 5, COLORS.woodDark);
  tile.rect(8, 10, 2, 5, COLORS.wood);
  tile.rect(3, 4, 11, 8, COLORS.leafDark);
  tile.rect(1, 6, 14, 4, COLORS.leafDark);
  tile.rect(4, 2, 8, 10, COLORS.leaf);
  tile.rect(6, 1, 5, 3, COLORS.leafLight);
  tile.rect(2, 6, 4, 3, COLORS.leafLight);
  tile.pixel(12, 6, COLORS.grassLight);
  tile.pixel(9, 10, COLORS.leafDark);
}

function drawBush(tile) {
  tile.rect(2, 7, 12, 7, COLORS.leafDark);
  tile.rect(1, 9, 14, 4, COLORS.leafDark);
  tile.rect(4, 5, 5, 8, COLORS.leaf);
  tile.rect(8, 6, 5, 7, COLORS.leaf);
  tile.rect(4, 6, 3, 3, COLORS.leafLight);
  tile.pixel(11, 8, COLORS.grassLight);
  tile.lineHorizontal(3, 14, 10, COLORS.outlineSoft);
}

function drawFlowerBed(tile) {
  tile.rect(1, 6, 14, 9, COLORS.woodDark);
  tile.rect(2, 7, 12, 7, COLORS.creamDark);
  tile.rect(3, 8, 10, 5, COLORS.grassDark);
  for (const [x, y, color] of [
    [4, 8, COLORS.flowerWhite],
    [8, 10, COLORS.flowerPink],
    [11, 8, COLORS.goldLight],
  ]) {
    tile.pixel(x, y, color);
    tile.pixel(x - 1, y + 1, color);
    tile.pixel(x + 1, y + 1, color);
  }
}

function drawCampusSign(tile) {
  tile.rect(3, 3, 10, 9, COLORS.outline);
  tile.rect(4, 4, 8, 7, COLORS.cream);
  tile.lineHorizontal(5, 5, 6, COLORS.goldDark);
  tile.lineHorizontal(5, 7, 6, COLORS.grassDark);
  tile.lineHorizontal(5, 9, 4, COLORS.blueDark);
  tile.rect(5, 12, 2, 4, COLORS.woodDark);
  tile.rect(10, 12, 2, 4, COLORS.woodDark);
}

function drawBench(tile) {
  tile.rect(2, 6, 12, 3, COLORS.outline);
  tile.rect(3, 6, 10, 2, COLORS.woodLight);
  tile.rect(2, 10, 12, 3, COLORS.outline);
  tile.rect(3, 10, 10, 2, COLORS.wood);
  tile.rect(3, 13, 2, 3, COLORS.outlineSoft);
  tile.rect(11, 13, 2, 3, COLORS.outlineSoft);
}

function drawLamp(tile) {
  tile.rect(7, 6, 2, 10, COLORS.outlineSoft);
  tile.rect(5, 3, 6, 5, COLORS.outline);
  tile.rect(6, 4, 4, 3, COLORS.goldLight);
  tile.pixel(7, 4, COLORS.white);
  tile.rect(5, 15, 6, 1, COLORS.outline);
}

function drawHedge(tile) {
  tile.rect(0, 5, 16, 10, COLORS.leafDark);
  tile.rect(0, 7, 16, 6, COLORS.leaf);
  for (let x = 1; x < TILE_SIZE; x += 4) {
    tile.rect(x, 5 + (x % 3), 3, 3, COLORS.leafLight);
    tile.pixel(x + 2, 12, COLORS.grassDark);
  }
  tile.lineHorizontal(0, 15, TILE_SIZE, COLORS.outlineSoft);
}

function drawFountain(tile) {
  tile.rect(1, 7, 14, 7, COLORS.stoneDark);
  tile.rect(2, 7, 12, 6, COLORS.stoneLight);
  tile.rect(3, 8, 10, 4, COLORS.water);
  tile.lineHorizontal(4, 8, 8, COLORS.waterLight);
  tile.rect(7, 3, 2, 7, COLORS.stoneDark);
  tile.rect(6, 2, 4, 3, COLORS.stoneLight);
  tile.pixel(5, 4, COLORS.waterLight);
  tile.pixel(10, 4, COLORS.waterLight);
  tile.lineHorizontal(2, 14, 12, COLORS.outlineSoft);
}

function drawDesk(tile) {
  tile.rect(1, 4, 14, 8, COLORS.outline);
  tile.rect(2, 5, 12, 5, COLORS.woodLight);
  tile.lineHorizontal(2, 9, 12, COLORS.woodDark);
  tile.rect(2, 12, 3, 4, COLORS.woodDark);
  tile.rect(11, 12, 3, 4, COLORS.woodDark);
  tile.pixel(4, 6, COLORS.creamLight);
  tile.lineHorizontal(9, 7, 3, COLORS.wood);
}

function drawChair(tile) {
  tile.rect(4, 2, 8, 8, COLORS.outline);
  tile.rect(5, 3, 6, 6, COLORS.blueDark);
  tile.rect(5, 3, 6, 2, COLORS.blue);
  tile.rect(3, 10, 10, 3, COLORS.outline);
  tile.rect(4, 10, 8, 2, COLORS.blue);
  tile.rect(4, 13, 2, 3, COLORS.outlineSoft);
  tile.rect(10, 13, 2, 3, COLORS.outlineSoft);
}

function drawComputer(tile) {
  tile.rect(2, 2, 12, 9, COLORS.outline);
  tile.rect(3, 3, 10, 7, COLORS.blueDark);
  tile.rect(4, 4, 8, 5, COLORS.blue);
  tile.rect(4, 4, 5, 2, COLORS.blueLight);
  tile.pixel(11, 8, COLORS.grassLight);
  tile.rect(7, 11, 2, 3, COLORS.outlineSoft);
  tile.rect(4, 14, 8, 2, COLORS.outline);
}

function drawBookshelf(tile) {
  tile.rect(1, 1, 14, 15, COLORS.outline);
  tile.rect(2, 2, 12, 13, COLORS.woodDark);
  for (let y = 3; y < 14; y += 5) {
    tile.lineHorizontal(2, y + 3, 12, COLORS.woodLight);
    tile.rect(3, y, 2, 3, COLORS.terracotta);
    tile.rect(6, y - 1, 2, 4, COLORS.blueLight);
    tile.rect(9, y, 2, 3, COLORS.gold);
    tile.rect(12, y - 1, 1, 4, COLORS.grassLight);
  }
}

function drawMeetingTable(tile) {
  tile.rect(1, 4, 14, 9, COLORS.outline);
  tile.rect(2, 5, 12, 7, COLORS.wood);
  tile.rect(3, 5, 10, 2, COLORS.woodLight);
  tile.rect(7, 6, 2, 5, COLORS.goldDark);
  tile.rect(3, 13, 3, 3, COLORS.outlineSoft);
  tile.rect(10, 13, 3, 3, COLORS.outlineSoft);
}

function drawPlant(tile) {
  tile.rect(5, 11, 7, 5, COLORS.terracottaDark);
  tile.rect(6, 12, 5, 3, COLORS.terracotta);
  tile.rect(7, 4, 2, 8, COLORS.leafDark);
  tile.rect(3, 5, 5, 3, COLORS.leaf);
  tile.rect(9, 3, 4, 4, COLORS.leafLight);
  tile.pixel(5, 4, COLORS.grassLight);
  tile.pixel(11, 7, COLORS.leafDark);
}

function drawAdminEmblem(tile) {
  tile.rect(1, 1, 14, 14, COLORS.adminDark);
  tile.rect(2, 2, 12, 12, COLORS.admin);
  tile.lineHorizontal(4, 4, 8, COLORS.goldDark);
  tile.lineHorizontal(5, 3, 6, COLORS.gold);
  tile.rect(4, 6, 8, 1, COLORS.gold);
  for (const x of [5, 8, 11]) {
    tile.rect(x, 7, 1, 4, COLORS.goldLight);
  }
  tile.lineHorizontal(3, 11, 10, COLORS.gold);
  tile.lineHorizontal(2, 13, 12, COLORS.goldDark);
}

function drawDarkWall(tile) {
  tile.fill(COLORS.adminDark);
  tile.lineHorizontal(0, 0, TILE_SIZE, COLORS.adminLight);
  tile.lineHorizontal(0, 1, TILE_SIZE, COLORS.goldDark);
  for (let y = 5; y < TILE_SIZE; y += 5) {
    tile.lineHorizontal(0, y, TILE_SIZE, COLORS.outline);
    for (let x = y === 5 ? 4 : 0; x < TILE_SIZE; x += 8) {
      tile.lineVertical(x, y - 4, 4, COLORS.outlineSoft);
    }
  }
}

function drawRug(tile) {
  tile.fill(COLORS.adminDark);
  tile.rect(1, 1, 14, 14, COLORS.goldDark);
  tile.rect(2, 2, 12, 12, COLORS.terracottaDark);
  tile.rect(4, 4, 8, 8, COLORS.admin);
  tile.pixel(7, 5, COLORS.goldLight);
  tile.pixel(8, 5, COLORS.goldLight);
  tile.rect(6, 7, 4, 2, COLORS.gold);
  tile.pixel(7, 10, COLORS.goldLight);
  tile.pixel(8, 10, COLORS.goldLight);
}

function drawArchway(tile) {
  tile.fill(COLORS.cream);
  tile.rect(2, 2, 12, 14, COLORS.outlineSoft);
  tile.rect(3, 3, 10, 13, COLORS.stone);
  tile.rect(5, 5, 6, 11, COLORS.outline);
  tile.rect(6, 6, 4, 10, COLORS.adminDark);
  tile.pixel(5, 5, COLORS.gold);
  tile.pixel(10, 5, COLORS.gold);
  tile.lineHorizontal(2, 1, 12, COLORS.goldDark);
}

function drawServerRack(tile) {
  tile.rect(3, 1, 10, 15, COLORS.outline);
  tile.rect(4, 2, 8, 13, COLORS.blueDark);
  for (let y = 3; y < 14; y += 3) {
    tile.lineHorizontal(5, y, 6, COLORS.outlineSoft);
    tile.pixel(6, y + 1, COLORS.grassLight);
    tile.pixel(8, y + 1, COLORS.goldLight);
    tile.pixel(10, y + 1, COLORS.blueLight);
  }
}

function drawWhiteboard(tile) {
  tile.rect(1, 2, 14, 11, COLORS.outlineSoft);
  tile.rect(2, 3, 12, 9, COLORS.flowerWhite);
  tile.lineHorizontal(4, 5, 7, COLORS.blue);
  tile.lineHorizontal(5, 7, 8, COLORS.grassDark);
  tile.lineHorizontal(3, 9, 5, COLORS.terracotta);
  tile.rect(4, 13, 2, 3, COLORS.outlineSoft);
  tile.rect(10, 13, 2, 3, COLORS.outlineSoft);
}

function drawBooksPile(tile) {
  tile.rect(2, 11, 12, 4, COLORS.outline);
  tile.rect(3, 11, 10, 3, COLORS.blue);
  tile.rect(4, 7, 9, 4, COLORS.outline);
  tile.rect(5, 7, 7, 3, COLORS.terracotta);
  tile.rect(3, 3, 8, 4, COLORS.outline);
  tile.rect(4, 3, 6, 3, COLORS.gold);
  tile.pixel(5, 4, COLORS.goldLight);
}

// Frames 0-25 intentionally match TILE_FRAME_BY_ID in apps/web/src/game/assets.ts.
const TILE_BUILDERS = [
  () => {},
  drawGrass,
  drawGrassFlowers,
  drawPath,
  drawStoneFloor,
  drawWoodFloor,
  drawLibraryFloor,
  drawAdminFloor,
  drawWall,
  drawTechWall,
  drawLibraryWall,
  drawDarkWall,
  drawDoor,
  drawWindow,
  drawRoof,
  drawTree,
  drawBush,
  drawFlowerBed,
  drawBench,
  drawFountain,
  drawDesk,
  drawComputer,
  drawChair,
  drawBookshelf,
  drawMeetingTable,
  drawCampusSign,
  drawGrassTufts,
  (tile) => drawPathEdge(tile, "north"),
  (tile) => drawPathEdge(tile, "south"),
  (tile) => drawPathEdge(tile, "west"),
  (tile) => drawPathEdge(tile, "east"),
  drawLamp,
  drawHedge,
  drawPlant,
  drawAdminEmblem,
  drawRug,
  drawArchway,
  drawServerRack,
  drawWhiteboard,
  drawBooksPile,
];

function buildTilesheet() {
  if (TILE_BUILDERS.length > TILESET_COLUMNS * TILESET_ROWS) {
    throw new Error("The tilesheet grid is too small for the declared tile builders.");
  }

  const sheet = new Raster(TILESET_COLUMNS * TILE_SIZE, TILESET_ROWS * TILE_SIZE);

  TILE_BUILDERS.forEach((drawTile, frame) => {
    const tile = makeTile();
    drawTile(tile);
    const x = (frame % TILESET_COLUMNS) * TILE_SIZE;
    const y = Math.floor(frame / TILESET_COLUMNS) * TILE_SIZE;
    sheet.blit(tile, x, y);
  });

  return sheet;
}

function drawAvatarFrame(base, mask, direction, pose, frameX, frameY) {
  const x = frameX * AVATAR_FRAME_WIDTH;
  const y = frameY * AVATAR_FRAME_HEIGHT;
  const step = pose - 1;
  const leftFootOffset = step === -1 ? -1 : step === 1 ? 1 : 0;
  const rightFootOffset = -leftFootOffset;

  base.rect(x + 3, y + 21, 10, 2, COLORS.shadow);
  base.rect(x + 5 + leftFootOffset, y + 18, 3, 4, COLORS.pantsDark);
  base.rect(x + 8 + rightFootOffset, y + 18, 3, 4, COLORS.pants);
  base.rect(x + 4 + leftFootOffset, y + 21, 4, 2, COLORS.shoe);
  base.rect(x + 8 + rightFootOffset, y + 21, 4, 2, COLORS.shoe);

  if (direction === "down") {
    base.rect(x + 4, y + 4, 8, 7, COLORS.hairDark);
    base.rect(x + 5, y + 5, 6, 7, COLORS.skin);
    base.rect(x + 6, y + 5, 4, 2, COLORS.skinLight);
    base.rect(x + 4, y + 3, 8, 4, COLORS.hair);
    base.rect(x + 5, y + 2, 6, 2, COLORS.hairDark);
    base.pixel(x + 5, y + 7, COLORS.outline);
    base.pixel(x + 10, y + 7, COLORS.outline);
    base.pixel(x + 8, y + 9, COLORS.skinDark);
    base.rect(x + 7, y + 11, 2, 2, COLORS.skin);
    base.rect(x + 3, y + 13 + step, 2, 5, COLORS.skin);
    base.rect(x + 11, y + 13 - step, 2, 5, COLORS.skin);

    mask.rect(x + 4, y + 12, 8, 7, COLORS.maskDark);
    mask.rect(x + 5, y + 12, 6, 6, COLORS.mask);
    mask.rect(x + 6, y + 12, 4, 2, COLORS.maskLight);
    mask.pixel(x + 8, y + 15, COLORS.maskDark);
    return;
  }

  if (direction === "up") {
    base.rect(x + 4, y + 4, 8, 8, COLORS.hairDark);
    base.rect(x + 5, y + 3, 6, 8, COLORS.hair);
    base.rect(x + 6, y + 2, 5, 3, COLORS.hairLight);
    base.rect(x + 4, y + 7, 2, 4, COLORS.hairDark);
    base.rect(x + 10, y + 6, 2, 5, COLORS.hairDark);
    base.rect(x + 7, y + 11, 2, 2, COLORS.skinDark);
    base.rect(x + 3, y + 13 - step, 2, 5, COLORS.skinDark);
    base.rect(x + 11, y + 13 + step, 2, 5, COLORS.skinDark);

    mask.rect(x + 4, y + 12, 8, 7, COLORS.maskDark);
    mask.rect(x + 5, y + 12, 6, 6, COLORS.mask);
    mask.lineHorizontal(x + 6, y + 13, 4, COLORS.maskLight);
    mask.lineVertical(x + 8, y + 14, 4, COLORS.maskDark);
    return;
  }

  const facingLeft = direction === "left";
  const front = facingLeft ? 4 : 5;
  const back = facingLeft ? 10 : 11;
  const faceStart = facingLeft ? 4 : 5;
  base.rect(x + 4, y + 4, 8, 7, COLORS.hairDark);
  base.rect(x + faceStart, y + 5, 7, 7, COLORS.skin);
  base.rect(x + 5, y + 3, 6, 4, COLORS.hair);
  base.rect(x + (facingLeft ? 4 : 9), y + 4, 3, 5, COLORS.hairDark);
  base.pixel(x + front, y + 8, COLORS.outline);
  base.pixel(x + (facingLeft ? 3 : 12), y + 8, COLORS.skinLight);
  base.pixel(x + (facingLeft ? 4 : 11), y + 10, COLORS.skinDark);
  base.rect(x + 7, y + 11, 2, 2, COLORS.skin);
  base.rect(x + back, y + 13 - step, 2, 5, COLORS.skinDark);
  base.rect(x + front - 1, y + 13 + step, 2, 5, COLORS.skin);

  mask.rect(x + 4, y + 12, 8, 7, COLORS.maskDark);
  mask.rect(x + 5, y + 12, 6, 6, COLORS.mask);
  mask.rect(x + (facingLeft ? 5 : 8), y + 12, 3, 2, COLORS.maskLight);
  mask.lineVertical(x + (facingLeft ? 10 : 5), y + 14, 4, COLORS.maskDark);
}

function buildAvatarSheets() {
  const width = AVATAR_COLUMNS * AVATAR_FRAME_WIDTH;
  const height = AVATAR_ROWS * AVATAR_FRAME_HEIGHT;
  const base = new Raster(width, height);
  const mask = new Raster(width, height);
  const directions = ["down", "left", "right", "up"];

  directions.forEach((direction, row) => {
    for (let pose = 0; pose < AVATAR_COLUMNS; pose += 1) {
      drawAvatarFrame(base, mask, direction, pose, pose, row);
    }
  });

  return { base, mask };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const payload = Buffer.concat([typeBuffer, data]);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(payload));
  return Buffer.concat([length, payload, checksum]);
}

function encodePng(raster) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(raster.width, 0);
  header.writeUInt32BE(raster.height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const scanlines = Buffer.alloc((raster.width * 4 + 1) * raster.height);
  const rowBytes = raster.width * 4;
  for (let y = 0; y < raster.height; y += 1) {
    const rowOffset = y * (rowBytes + 1);
    scanlines[rowOffset] = 0;
    raster.pixels.copy(scanlines, rowOffset + 1, y * rowBytes, (y + 1) * rowBytes);
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND"),
  ]);
}

function hasTransparency(raster) {
  for (let index = 3; index < raster.pixels.length; index += 4) {
    if (raster.pixels[index] < 255) {
      return true;
    }
  }
  return false;
}

function writeAsset(filename, raster) {
  const png = encodePng(raster);
  const outputPath = resolve(OUTPUT_DIRECTORY, filename);
  writeFileSync(outputPath, png);
  return {
    file: filename,
    width: raster.width,
    height: raster.height,
    alpha: hasTransparency(raster),
    bytes: png.length,
    sha256: createHash("sha256").update(png).digest("hex"),
  };
}

mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

const tilesheet = buildTilesheet();
const avatar = buildAvatarSheets();
const results = [
  writeAsset("campus-tiles.png", tilesheet),
  writeAsset("avatar-base.png", avatar.base),
  writeAsset("avatar-outfit-mask.png", avatar.mask),
];

for (const result of results) {
  console.log(
    `${result.file}: ${result.width}x${result.height}, alpha=${result.alpha}, ` +
      `${result.bytes} bytes, sha256=${result.sha256}`,
  );
}
