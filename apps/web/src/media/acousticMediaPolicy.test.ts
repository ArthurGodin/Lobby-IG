import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AcousticSnapshot } from "@ig-campus/contracts";
import { buildAcousticMediaPlan } from "./acousticMediaPolicy";

function snapshot(
  revision: number,
  allowedPeerSessionIds: string[],
  audiblePeerSessionIds = allowedPeerSessionIds,
): AcousticSnapshot {
  return {
    revision,
    environment: { zoneId: null, label: "Áreas comuns", mode: "open" },
    allowedPeerSessionIds,
    audiblePeers: audiblePeerSessionIds.map((sessionId) => ({
      sessionId,
      distance: 48,
      band: "close",
    })),
  };
}

describe("planejador de mídia acústica", () => {
  test("remove imediatamente quem perdeu permissão", () => {
    const plan = buildAcousticMediaPlan(snapshot(3, ["beta"]), 2, new Set(["beta", "gamma"]));

    assert.ok(plan);
    assert.deepEqual(plan.immediatelyBlockedIdentities, ["gamma"]);
    assert.equal(plan.desiredGains.get("beta"), 1);
  });

  test("preserva permissão quando somente a distância sai do raio", () => {
    const plan = buildAcousticMediaPlan(snapshot(4, ["beta"], []), 3, new Set(["beta"]));

    assert.ok(plan);
    assert.deepEqual(plan.immediatelyBlockedIdentities, []);
    assert.equal(plan.desiredGains.has("beta"), false);
  });

  test("ignora revisões antigas e fecha diante de snapshot ausente", () => {
    assert.equal(buildAcousticMediaPlan(snapshot(2, ["beta"]), 2, new Set()), null);

    const closed = buildAcousticMediaPlan(null, 2, new Set(["beta"]));
    assert.ok(closed?.failClosed);
    assert.deepEqual(closed.allowedIdentities, []);
    assert.deepEqual(closed.immediatelyBlockedIdentities, ["beta"]);
  });

  test("gera impressão estável sem depender da ordem recebida", () => {
    const first = buildAcousticMediaPlan(snapshot(1, ["gamma", "beta"]), 0, new Set());
    const second = buildAcousticMediaPlan(snapshot(2, ["beta", "gamma"]), 1, new Set());
    assert.equal(first?.allowedFingerprint, second?.allowedFingerprint);
  });
});
