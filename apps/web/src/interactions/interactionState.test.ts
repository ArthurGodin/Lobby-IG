import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PLAYER_COLORS, type PlayerSnapshot } from "@ig-campus/contracts";
import { INTERACTABLES } from "@ig-campus/game-core";
import {
  buildInteractionOptions,
  buildInteractionPanelContent,
  createInteractionRequest,
  getInteractionResultMessage,
} from "./interactionState";

const FOCUS_DESKS = INTERACTABLES.filter((interactable) => interactable.kind === "focus_desk");

describe("estado de interação do cliente", () => {
  test("apresenta múltiplas mesas em ordem determinística", () => {
    const firstDesk = FOCUS_DESKS[0];
    const secondDesk = FOCUS_DESKS[1];
    assert.ok(firstDesk);
    assert.ok(secondDesk);
    const self = playerAt(
      "self",
      (firstDesk.interactionPosition.x + secondDesk.interactionPosition.x) / 2,
      firstDesk.interactionPosition.y,
    );

    const options = buildInteractionOptions(self, [self]);
    assert.deepEqual(
      options.slice(0, 2).map((option) => option.label),
      [firstDesk.label, secondDesk.label],
    );
    assert.ok(options.slice(0, 2).every((option) => option.available));
  });

  test("marca ocupação, cria requests únicos e traduz o resultado", () => {
    const desk = FOCUS_DESKS[0];
    assert.ok(desk);
    const self = playerAt("self", desk.exitPosition.x, desk.exitPosition.y);
    const occupant = playerAt("occupant", desk.seatPosition.x, desk.seatPosition.y);
    occupant.focusMode = true;
    occupant.focusDeskId = desk.id;
    const option = buildInteractionOptions(self, [self, occupant])[0];
    assert.ok(option);
    assert.equal(option.available, false);
    assert.equal(option.unavailableMessage, "Ocupada por outra pessoa");
    assert.deepEqual(buildInteractionPanelContent(self, [self, occupant], [option]), {
      active: false,
      label: desk.label,
      help: `${desk.label} está ocupada por occupant.`,
    });

    const firstRequest = createInteractionRequest({ ...option, available: true });
    const secondRequest = createInteractionRequest({ ...option, available: true });
    assert.notEqual(firstRequest.requestId, secondRequest.requestId);
    assert.equal(firstRequest.interactableId, desk.id);
    assert.equal(
      getInteractionResultMessage({ ...firstRequest, outcome: "conflict" }),
      `${desk.label} acabou de ser ocupada.`,
    );
  });
});

function playerAt(sessionId: string, x: number, y: number): PlayerSnapshot {
  return {
    sessionId,
    name: sessionId,
    color: PLAYER_COLORS[0],
    appearance: { outfitColor: PLAYER_COLORS[0] },
    x,
    y,
    facing: "down",
    moving: false,
    focusMode: false,
    focusDeskId: null,
    sequence: 0,
  };
}
