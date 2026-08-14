import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PLAYER_COLORS, type PlayerSnapshot } from "@ig-campus/contracts";
import {
  arePlayersAcousticallyCompatible,
  buildAcousticPolicy,
  CAMPUS_MAP,
  CLOSE_PROXIMITY_RADIUS,
  canStandAt,
  getAvailableSpawnPoint,
  getInteractionCandidates,
  getPlayerCollider,
  getProximityBand,
  getZoneAtPosition,
  INTERACTABLES,
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

const FOCUS_DESKS = INTERACTABLES.filter((interactable) => interactable.kind === "focus_desk");

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

  test("aceita uma interação identificada e rejeita identificadores perigosos", () => {
    const payload = {
      requestId: "request-1",
      interactableId: "dev-01",
      actionId: "enter_focus",
    };
    assert.deepEqual(parseClientMessage(JSON.stringify({ type: "interact", payload })), {
      type: "interact",
      payload,
    });
    assert.equal(
      parseClientMessage(
        JSON.stringify({ type: "interact", payload: { ...payload, actionId: "<script>" } }),
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

  test("barreira de foco bloqueia aproximação e sempre permite saída", () => {
    const barrier = [{ sessionId: "focus", x: 100, y: 100, radius: 64 }];
    const moveRight = { up: false, down: false, left: false, right: true, sequence: 1 };
    const approaching = moveWithCollision({ x: 35, y: 100 }, moveRight, 100, barrier);
    assert.equal(approaching.x, 35);

    const escaping = moveWithCollision({ x: 120, y: 100 }, moveRight, 100, barrier);
    assert.ok(escaping.x > 120);
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
    assert.equal(FOCUS_DESKS.length, 12);
    assert.equal(CAMPUS_MAP.interactables.length, 12);
  });

  test("ordena candidatos por disponibilidade, distância e id", () => {
    const firstDesk = FOCUS_DESKS[0];
    const secondDesk = FOCUS_DESKS[1];
    assert.ok(firstDesk);
    assert.ok(secondDesk);
    const self = playerAt(
      "self",
      (firstDesk.interactionPosition.x + secondDesk.interactionPosition.x) / 2,
      firstDesk.interactionPosition.y,
    );
    const candidates = getInteractionCandidates(self, [self]);
    assert.deepEqual(
      candidates.slice(0, 2).map((candidate) => candidate.interactable.id),
      [firstDesk.id, secondDesk.id],
    );

    const occupant = playerAt("occupant", firstDesk.seatPosition.x, firstDesk.seatPosition.y);
    occupant.focusMode = true;
    occupant.focusDeskId = firstDesk.id;
    const withOccupiedDesk = getInteractionCandidates(self, [self, occupant]);
    assert.equal(withOccupiedDesk[0]?.interactable.id, secondDesk.id);
    assert.equal(withOccupiedDesk.at(-1)?.unavailableReason, "occupied");

    self.focusMode = true;
    self.focusDeskId = firstDesk.id;
    const exit = getInteractionCandidates(self, [self, occupant]);
    assert.equal(exit.length, 1);
    assert.equal(exit[0]?.actionId, "leave_focus");
  });

  test("rejeita mesas duplicadas e saídas bloqueadas", () => {
    const firstDesk = FOCUS_DESKS[0];
    assert.ok(firstDesk);
    const invalidMap = {
      ...CAMPUS_MAP,
      interactables: [firstDesk, { ...firstDesk, exitPosition: { x: 0, y: 0 } }],
    };
    const errors = validateCampusMap(invalidMap);
    assert.ok(errors.some((error) => error.includes("objeto interativo duplicado")));
    assert.ok(errors.some((error) => error.includes("configuração de mesa de foco inválida")));
  });

  test("classifica as bordas de zona sem ambiguidade", () => {
    const reitoria = CAMPUS_MAP.zones.find((zone) => zone.id === "reitoria");
    assert.ok(reitoria);

    assert.equal(getZoneAtPosition({ x: reitoria.rect.x, y: reitoria.rect.y })?.id, "reitoria");
    assert.equal(
      getZoneAtPosition({
        x: reitoria.rect.x + reitoria.rect.width - 0.001,
        y: reitoria.rect.y + reitoria.rect.height - 0.001,
      })?.id,
      "reitoria",
    );
    assert.notEqual(
      getZoneAtPosition({ x: reitoria.rect.x + reitoria.rect.width, y: reitoria.rect.y })?.id,
      "reitoria",
    );
    assert.notEqual(
      getZoneAtPosition({ x: reitoria.rect.x, y: reitoria.rect.y + reitoria.rect.height })?.id,
      "reitoria",
    );
  });

  test("rejeita zonas sobrepostas", () => {
    const firstZone = CAMPUS_MAP.zones[0];
    const secondZone = CAMPUS_MAP.zones[1];
    assert.ok(firstZone);
    assert.ok(secondZone);
    const invalidMap = {
      ...CAMPUS_MAP,
      zones: [firstZone, { ...secondZone, rect: { ...firstZone.rect } }],
    };

    assert.ok(validateCampusMap(invalidMap).some((error) => error.includes("zonas sobrepostas")));
  });

  test("isola salas privadas sem alterar a proximidade fisica", () => {
    const openA = playerAt("open-a", 736, 536);
    const openB = playerAt("open-b", 768, 536);
    const privateA = playerAt("private-a", 850, 672);
    const privateB = playerAt("private-b", 880, 672);
    const corridor = playerAt("corridor", 800, 672);

    assert.equal(arePlayersAcousticallyCompatible(openA, openB), true);
    assert.equal(arePlayersAcousticallyCompatible(privateA, privateB), true);
    assert.equal(arePlayersAcousticallyCompatible(privateA, corridor), false);

    const policy = buildAcousticPolicy(privateA, [corridor, privateB, privateA]);
    assert.equal(policy.environment.zoneId, "reitoria");
    assert.equal(policy.environment.mode, "private");
    assert.deepEqual(policy.allowedPeerSessionIds, ["private-b"]);
    assert.deepEqual(
      policy.audiblePeers.map((peer) => peer.sessionId),
      ["private-b"],
    );
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
