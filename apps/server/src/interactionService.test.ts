import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createIdleInput,
  type InteractionRequest,
  PLAYER_COLORS,
  type PlayerSnapshot,
} from "@ig-campus/contracts";
import { INTERACTABLES, SPAWN_POINTS } from "@ig-campus/game-core";
import { createInteractionService, type InteractionSession } from "./interactionService.js";

const FOCUS_DESKS = INTERACTABLES.filter((interactable) => interactable.kind === "focus_desk");
const SCREEN_STATIONS = INTERACTABLES.filter(
  (interactable) => interactable.kind === "screen_station",
);

describe("serviço de interações", () => {
  test("entra, deduplica e sai de uma mesa de foco", () => {
    const desk = FOCUS_DESKS[0];
    assert.ok(desk);
    const service = createInteractionService();
    const session = sessionAt("self", desk.exitPosition.x, desk.exitPosition.y);
    const enter = request("request-enter", desk.id, "enter_focus");

    assert.deepEqual(service.execute(enter, session, [session]), {
      ...enter,
      outcome: "succeeded",
    });
    assert.equal(session.player.focusDeskId, desk.id);
    assert.deepEqual({ x: session.player.x, y: session.player.y }, desk.seatPosition);

    assert.deepEqual(service.execute(enter, session, [session]), {
      ...enter,
      outcome: "succeeded",
    });
    assert.equal(
      service.execute({ ...enter, actionId: "leave_focus" }, session, [session]).outcome,
      "invalid_action",
    );

    const leave = request("request-leave", desk.id, "leave_focus");
    assert.equal(service.execute(leave, session, [session]).outcome, "succeeded");
    assert.equal(session.player.focusMode, false);
    assert.equal(session.player.focusDeskId, null);
    assert.deepEqual({ x: session.player.x, y: session.player.y }, desk.exitPosition);
  });

  test("revalida alvo, ação, distância e disputa", () => {
    const desk = FOCUS_DESKS[0];
    const distantSpawn = SPAWN_POINTS[0];
    assert.ok(desk);
    assert.ok(distantSpawn);
    const service = createInteractionService();
    const distant = sessionAt("distant", distantSpawn.x, distantSpawn.y);

    assert.equal(
      service.execute(request("missing", "missing-object", "enter_focus"), distant, [distant])
        .outcome,
      "invalid_target",
    );
    assert.equal(
      service.execute(request("unknown-action", desk.id, "explode"), distant, [distant]).outcome,
      "invalid_action",
    );
    assert.equal(
      service.execute(request("too-far", desk.id, "enter_focus"), distant, [distant]).outcome,
      "too_far",
    );

    const first = sessionAt("first", desk.exitPosition.x, desk.exitPosition.y);
    const second = sessionAt("second", desk.exitPosition.x, desk.exitPosition.y);
    assert.equal(
      service.execute(request("first-enter", desk.id, "enter_focus"), first, [first, second])
        .outcome,
      "succeeded",
    );
    assert.equal(
      service.execute(request("second-enter", desk.id, "enter_focus"), second, [first, second])
        .outcome,
      "conflict",
    );
  });

  test("reserva uma estação de tela, impede disputa e libera ao sair", () => {
    const station = SCREEN_STATIONS[0];
    assert.ok(station);
    if (!station) {
      return;
    }

    const service = createInteractionService();
    const alpha = sessionAt("alpha", station.interactionPosition.x, station.interactionPosition.y);
    const beta = sessionAt("beta", station.interactionPosition.x, station.interactionPosition.y);
    const start = request("screen-start", station.id, "start_screen_share");

    assert.equal(service.execute(start, alpha, [alpha, beta]).outcome, "succeeded");
    assert.deepEqual(service.getScreenShareReservations(), [
      { stationId: station.id, presenterSessionId: "alpha" },
    ]);
    assert.equal(
      service.execute(request("screen-conflict", station.id, "start_screen_share"), beta, [
        alpha,
        beta,
      ]).outcome,
      "conflict",
    );
    assert.equal(
      service.execute(request("screen-stop-beta", station.id, "stop_screen_share"), beta, [
        alpha,
        beta,
      ]).outcome,
      "forbidden",
    );

    alpha.player.x += station.interactionRadius + 1;
    assert.equal(service.reconcile([alpha, beta]), true);
    assert.deepEqual(service.getScreenShareReservations(), []);
  });
});

function request(requestId: string, interactableId: string, actionId: string): InteractionRequest {
  return { requestId, interactableId, actionId };
}

function sessionAt(sessionId: string, x: number, y: number): InteractionSession {
  const player: PlayerSnapshot = {
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
    role: "member",
    sequence: 0,
  };

  return { player, input: createIdleInput() };
}
