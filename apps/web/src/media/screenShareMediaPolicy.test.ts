import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ScreenShareSnapshot } from "@ig-campus/contracts";
import { buildScreenShareMediaPlan } from "./screenShareMediaPolicy";

function snapshot(
  revision: number,
  presenterSessionIds: string[],
  audienceSessionIds: string[] = [],
): ScreenShareSnapshot {
  return {
    revision,
    presentations: presenterSessionIds.map((presenterSessionId) => ({
      stationId: "patio-screen",
      presenterSessionId,
      presenterName: presenterSessionId,
    })),
    audienceSessionIds,
  };
}

describe("política de mídia da apresentação", () => {
  test("assina somente apresentadores visíveis e preserva a audiência do dono", () => {
    const plan = buildScreenShareMediaPlan(snapshot(3, ["alpha"], ["beta"]), 2, new Set());

    assert.ok(plan);
    assert.deepEqual(plan.allowedPresenterIdentities, ["alpha"]);
    assert.deepEqual(plan.audienceIdentities, ["beta"]);
  });

  test("falha fechada e corta imediatamente apresentadores que perderam acesso", () => {
    const plan = buildScreenShareMediaPlan(null, 4, new Set(["alpha"]));

    assert.ok(plan?.failClosed);
    assert.deepEqual(plan?.immediatelyBlockedPresenterIdentities, ["alpha"]);
    assert.equal(buildScreenShareMediaPlan(snapshot(4, ["alpha"]), 4, new Set()), null);
  });
});
