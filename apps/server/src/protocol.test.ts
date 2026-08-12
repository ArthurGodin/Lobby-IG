import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PLAYER_COLORS } from "@ig-campus/contracts";
import {
  CAMPUS_MAP,
  CLOSE_PROXIMITY_RADIUS,
  canStandAt,
  getAvailableSpawnPoint,
  getPlayerCollider,
  getProximityBand,
  isMoving,
  MAP_HEIGHT,
  MAP_WIDTH,
  moveWithCollision,
  OBSTACLES,
  PROXIMITY_RADIUS,
  SPAWN_POINTS,
  validateCampusMap,
} from "@ig-campus/game-core";
import { parseClientMessage } from "./protocol.js";

describe("protocolo do campus", () => {
  test("aceita apenas um perfil com cor conhecida", () => {
    assert.deepEqual(
      parseClientMessage(
        JSON.stringify({ type: "profile", payload: { name: "Ada", color: PLAYER_COLORS[0] } }),
      ),
      { type: "profile", payload: { name: "Ada", color: PLAYER_COLORS[0] } },
    );
    assert.equal(
      parseClientMessage(
        JSON.stringify({ type: "profile", payload: { name: "Ada", color: "#000000" } }),
      ),
      null,
    );
  });

  test("aceita aparencia valida e rejeita cor de roupa desconhecida", () => {
    assert.deepEqual(
      parseClientMessage(
        JSON.stringify({
          type: "profile",
          payload: { appearance: { outfitColor: PLAYER_COLORS[1] } },
        }),
      ),
      {
        type: "profile",
        payload: { appearance: { outfitColor: PLAYER_COLORS[1] } },
      },
    );
    assert.equal(
      parseClientMessage(
        JSON.stringify({
          type: "profile",
          payload: { appearance: { outfitColor: "#000000" } },
        }),
      ),
      null,
    );
    assert.equal(
      parseClientMessage(JSON.stringify({ type: "profile", payload: { appearance: null } })),
      null,
    );
  });

  test("rejeita coercoes perigosas no movimento", () => {
    assert.equal(
      parseClientMessage(
        JSON.stringify({
          type: "move",
          payload: { up: "false", down: false, left: false, right: false, sequence: 1 },
        }),
      ),
      null,
    );
    assert.equal(
      parseClientMessage(
        JSON.stringify({
          type: "move",
          payload: { up: false, down: false, left: false, right: true, sequence: -1 },
        }),
      ),
      null,
    );
  });
});

describe("regras puras do mundo", () => {
  test("classifica exatamente os dois limites de proximidade", () => {
    assert.equal(getProximityBand(CLOSE_PROXIMITY_RADIUS), "close");
    assert.equal(getProximityBand(CLOSE_PROXIMITY_RADIUS + 1), "nearby");
    assert.equal(getProximityBand(PROXIMITY_RADIUS), "nearby");
    assert.equal(getProximityBand(PROXIMITY_RADIUS + 1), null);
  });

  test("direcoes opostas nao marcam o avatar como andando", () => {
    assert.equal(isMoving({ up: true, down: true, left: false, right: false, sequence: 1 }), false);
  });

  test("seleciona um spawn diferente de uma posicao ocupada", () => {
    const occupied = SPAWN_POINTS[0];
    assert.ok(occupied);
    assert.notDeepEqual(getAvailableSpawnPoint([occupied]), occupied);
  });

  test("uma parede interrompe o movimento autoritativo", () => {
    const position = { x: 822, y: 184 };
    const input = { up: false, down: false, left: false, right: true, sequence: 1 };
    assert.deepEqual(moveWithCollision(position, input, 100), position);
  });

  test("mapa canonico possui camadas e identificadores validos", () => {
    const expectedLength = CAMPUS_MAP.columns * CAMPUS_MAP.rows;
    assert.equal(CAMPUS_MAP.columns, 48);
    assert.equal(CAMPUS_MAP.rows, 34);
    assert.equal(CAMPUS_MAP.layers.ground.length, expectedLength);
    assert.equal(CAMPUS_MAP.layers.structures.length, expectedLength);
    assert.equal(CAMPUS_MAP.layers.decorations.length, expectedLength);
    assert.deepEqual(
      CAMPUS_MAP.zones.map((zone) => zone.id),
      ["patio", "desenvolvimento", "biblioteca", "reitoria"],
    );
    assert.deepEqual(validateCampusMap(CAMPUS_MAP), []);
  });

  test("spawns sao caminhaveis e colliders permanecem dentro do mapa", () => {
    for (const spawn of SPAWN_POINTS) {
      assert.equal(canStandAt(spawn), true);
    }

    for (const obstacle of OBSTACLES) {
      assert.ok(obstacle.x >= 0);
      assert.ok(obstacle.y >= 0);
      assert.ok(obstacle.x + obstacle.width <= MAP_WIDTH);
      assert.ok(obstacle.y + obstacle.height <= MAP_HEIGHT);
    }

    const firstSpawn = SPAWN_POINTS[0];
    assert.ok(firstSpawn);
    const feetCollider = getPlayerCollider(firstSpawn);
    assert.ok(feetCollider.y < firstSpawn.y);
    assert.equal(feetCollider.y + feetCollider.height, firstSpawn.y);
  });
});
