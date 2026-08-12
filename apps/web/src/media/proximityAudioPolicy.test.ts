import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CLOSE_PROXIMITY_RADIUS, PROXIMITY_RADIUS } from "@ig-campus/game-core";
import { calculateProximityGain } from "./proximityAudioPolicy";

describe("ganho do audio por proximidade", () => {
  test("mantem volume completo na faixa proxima", () => {
    assert.equal(calculateProximityGain(-1), 1);
    assert.equal(calculateProximityGain(0), 1);
    assert.equal(calculateProximityGain(CLOSE_PROXIMITY_RADIUS), 1);
  });

  test("reduz suavemente ate zero", () => {
    const midpoint = (CLOSE_PROXIMITY_RADIUS + PROXIMITY_RADIUS) / 2;
    assert.equal(calculateProximityGain(midpoint), 0.5);
    assert.ok(calculateProximityGain(midpoint - 1) > calculateProximityGain(midpoint + 1));
    assert.equal(calculateProximityGain(PROXIMITY_RADIUS), 0);
  });

  test("rejeita distancias invalidas ou fora do alcance", () => {
    assert.equal(calculateProximityGain(PROXIMITY_RADIUS + 1), 0);
    assert.equal(calculateProximityGain(Number.POSITIVE_INFINITY), 0);
    assert.equal(calculateProximityGain(Number.NaN), 0);
  });
});
