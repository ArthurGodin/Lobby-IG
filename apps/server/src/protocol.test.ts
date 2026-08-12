import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PLAYER_COLORS } from "@ig-campus/contracts";
import {
  CLOSE_PROXIMITY_RADIUS,
  getAvailableSpawnPoint,
  getProximityBand,
  isMoving,
  moveWithCollision,
  PROXIMITY_RADIUS,
  SPAWN_POINTS,
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
    const position = { x: 339, y: 160 };
    const input = { up: false, down: false, left: false, right: true, sequence: 1 };
    assert.deepEqual(moveWithCollision(position, input, 100), position);
  });
});
