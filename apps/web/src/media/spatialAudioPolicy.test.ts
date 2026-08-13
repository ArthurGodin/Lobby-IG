import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PlayerSnapshot } from "@ig-campus/contracts";
import { PROXIMITY_RADIUS } from "@ig-campus/game-core";
import {
  buildSpatialPanByIdentity,
  calculateStereoPan,
  filterVisibleSpeakingIdentities,
} from "./spatialAudioPolicy";

describe("posicionamento estereo", () => {
  test("posiciona fontes a esquerda, ao centro e a direita", () => {
    assert.equal(calculateStereoPan(100, 100), 0);
    assert.ok(calculateStereoPan(100, 40) < 0);
    assert.ok(calculateStereoPan(100, 160) > 0);
  });

  test("mantem uma zona central neutra e limita os extremos", () => {
    assert.equal(calculateStereoPan(100, 100 + PROXIMITY_RADIUS * 0.05), 0);
    assert.equal(calculateStereoPan(100, 100 - PROXIMITY_RADIUS * 2), -1);
    assert.equal(calculateStereoPan(100, 100 + PROXIMITY_RADIUS * 2), 1);
  });

  test("usa centro seguro para entradas invalidas", () => {
    assert.equal(calculateStereoPan(Number.NaN, 10), 0);
    assert.equal(calculateStereoPan(10, Number.POSITIVE_INFINITY), 0);
    assert.equal(calculateStereoPan(10, 20, 0), 0);
  });

  test("deriva o pan de cada jogador em relacao ao avatar local", () => {
    const players = [player("self", 100), player("left", 20), player("right", 180)];
    const pans = buildSpatialPanByIdentity("self", players);

    assert.equal(pans.has("self"), false);
    assert.ok((pans.get("left") ?? 0) < 0);
    assert.ok((pans.get("right") ?? 0) > 0);
    assert.deepEqual(buildSpatialPanByIdentity("missing", players), new Map());
  });

  test("exibe fala local e apenas participantes remotos audiveis", () => {
    assert.deepEqual(
      filterVisibleSpeakingIdentities(
        new Set(["blocked", "self", "allowed"]),
        "self",
        new Set(["allowed"]),
      ),
      ["allowed", "self"],
    );
  });
});

function player(sessionId: string, x: number): PlayerSnapshot {
  return {
    sessionId,
    name: sessionId,
    color: "#2f7d5c",
    appearance: { outfitColor: "#2f7d5c" },
    facing: "down",
    moving: false,
    sequence: 0,
    x,
    y: 100,
  };
}
