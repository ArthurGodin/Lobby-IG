import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseAcousticSnapshot, parseInteractionResult } from "./campusClient";

const validSnapshot = {
  revision: 4,
  environment: {
    zoneId: "reitoria",
    label: "Administração / Reitoria",
    mode: "private",
  },
  allowedPeerSessionIds: ["beta"],
  audiblePeers: [{ sessionId: "beta", distance: 48, band: "close" }],
};

describe("snapshot acústico recebido", () => {
  test("aceita uma política coerente", () => {
    assert.deepEqual(parseAcousticSnapshot(validSnapshot), validSnapshot);
  });

  test("rejeita revisão, distância e identidades inválidas", () => {
    assert.equal(parseAcousticSnapshot({ ...validSnapshot, revision: -1 }), null);
    assert.equal(
      parseAcousticSnapshot({
        ...validSnapshot,
        audiblePeers: [{ sessionId: "beta", distance: Number.NaN, band: "close" }],
      }),
      null,
    );
    assert.equal(
      parseAcousticSnapshot({ ...validSnapshot, allowedPeerSessionIds: ["beta", "beta"] }),
      null,
    );
  });

  test("rejeita um par audível que não esteja autorizado", () => {
    assert.equal(
      parseAcousticSnapshot({
        ...validSnapshot,
        allowedPeerSessionIds: [],
      }),
      null,
    );
  });
});

describe("resultado de interação recebido", () => {
  test("aceita resultados correlacionados e rejeita identificadores inválidos", () => {
    const result = {
      requestId: "request-1",
      interactableId: "dev-01",
      actionId: "enter_focus",
      outcome: "succeeded",
    } as const;
    assert.deepEqual(parseInteractionResult(result), result);
    assert.equal(parseInteractionResult({ ...result, requestId: "<script>" }), null);
    assert.equal(parseInteractionResult({ ...result, outcome: "unknown" }), null);
  });
});
