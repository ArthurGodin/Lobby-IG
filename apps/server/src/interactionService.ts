import {
  createIdleInput,
  type InteractionActionId,
  type InteractionRequest,
  type InteractionResult,
  isInteractionActionId,
  type MovementInput,
  type PlayerSnapshot,
} from "@ig-campus/contracts";
import {
  getDistance,
  getWorldInteractableById,
  type ScreenShareReservation,
  type WorldInteractableDefinition,
  type WorldInteractableKind,
} from "@ig-campus/game-core";

const MAX_CACHED_RESULTS_PER_SESSION = 32;

export type InteractionSession = {
  player: PlayerSnapshot;
  input: MovementInput;
};

type InteractionContext = {
  request: InteractionRequest;
  session: InteractionSession;
  sessions: readonly InteractionSession[];
  screenShareOwnersByStationId: Map<string, string>;
};

type InteractionHandler = {
  actions: readonly InteractionActionId[];
  execute: (
    context: InteractionContext,
    interactable: WorldInteractableDefinition,
    actionId: InteractionActionId,
  ) => InteractionResult["outcome"];
};

export type InteractionService = {
  execute: (
    request: InteractionRequest,
    session: InteractionSession,
    sessions: readonly InteractionSession[],
  ) => InteractionResult;
  forgetSession: (sessionId: string) => void;
  getScreenShareReservations: () => readonly ScreenShareReservation[];
  reconcile: (sessions: readonly InteractionSession[]) => boolean;
};

export function createInteractionService(): InteractionService {
  const resultCache = new Map<string, Map<string, InteractionResult>>();
  const screenShareOwnersByStationId = new Map<string, string>();

  return {
    execute(request, session, sessions) {
      const sessionCache = getSessionCache(resultCache, session.player.sessionId);
      const cached = sessionCache.get(request.requestId);

      if (cached) {
        return cached.interactableId === request.interactableId &&
          cached.actionId === request.actionId
          ? cached
          : createResult(request, "invalid_action");
      }

      const interactable = getWorldInteractableById(request.interactableId);

      if (!interactable) {
        return cacheResult(sessionCache, createResult(request, "invalid_target"));
      }

      const handler = INTERACTION_HANDLERS[interactable.kind];

      if (!isInteractionActionId(request.actionId) || !handler.actions.includes(request.actionId)) {
        return cacheResult(sessionCache, createResult(request, "invalid_action"));
      }

      const outcome = handler.execute(
        { request, session, sessions, screenShareOwnersByStationId },
        interactable,
        request.actionId,
      );
      return cacheResult(sessionCache, createResult(request, outcome));
    },
    forgetSession(sessionId) {
      resultCache.delete(sessionId);
      releaseScreenSharesForSession(screenShareOwnersByStationId, sessionId);
    },
    getScreenShareReservations() {
      return [...screenShareOwnersByStationId]
        .map(([stationId, presenterSessionId]) => ({ stationId, presenterSessionId }))
        .sort((first, second) => first.stationId.localeCompare(second.stationId));
    },
    reconcile(sessions) {
      let changed = false;

      for (const [stationId, presenterSessionId] of screenShareOwnersByStationId) {
        const station = getWorldInteractableById(stationId);
        const presenter = sessions.find(
          (candidate) => candidate.player.sessionId === presenterSessionId,
        );

        if (
          station?.kind !== "screen_station" ||
          !presenter ||
          presenter.player.focusMode ||
          getDistance(presenter.player, station.interactionPosition) > station.interactionRadius
        ) {
          screenShareOwnersByStationId.delete(stationId);
          changed = true;
        }
      }

      return changed;
    },
  };
}

const INTERACTION_HANDLERS: Record<WorldInteractableKind, InteractionHandler> = {
  focus_desk: {
    actions: ["enter_focus", "leave_focus"],
    execute: executeFocusDeskAction,
  },
  screen_station: {
    actions: ["start_screen_share", "stop_screen_share"],
    execute: executeScreenStationAction,
  },
  whiteboard: {
    actions: ["open_whiteboard", "close_whiteboard"],
    execute: executeWhiteboardAction,
  },
};

function executeWhiteboardAction(
  context: InteractionContext,
  whiteboard: WorldInteractableDefinition,
  _actionId: InteractionActionId,
): InteractionResult["outcome"] {
  if (whiteboard.kind !== "whiteboard") {
    return "invalid_target";
  }

  const distance = getDistance(context.session.player, whiteboard.interactionPosition);
  if (distance > whiteboard.interactionRadius) {
    return "too_far";
  }

  return "succeeded";
}

function executeFocusDeskAction(
  context: InteractionContext,
  desk: WorldInteractableDefinition,
  actionId: InteractionActionId,
): InteractionResult["outcome"] {
  if (desk.kind !== "focus_desk") {
    return "invalid_target";
  }

  if (actionId === "leave_focus") {
    return leaveFocusDesk(context.session, desk);
  }

  return enterFocusDesk(context, desk);
}

function enterFocusDesk(
  { session, sessions }: InteractionContext,
  desk: Extract<WorldInteractableDefinition, { kind: "focus_desk" }>,
): InteractionResult["outcome"] {
  if (session.player.focusMode) {
    return session.player.focusDeskId === desk.id ? "succeeded" : "unavailable";
  }

  if (getDistance(session.player, desk.interactionPosition) > desk.interactionRadius) {
    return "too_far";
  }

  const occupied = sessions.some(
    (candidate) =>
      candidate.player.sessionId !== session.player.sessionId &&
      candidate.player.focusDeskId === desk.id,
  );

  if (occupied) {
    return "conflict";
  }

  session.player.x = desk.seatPosition.x;
  session.player.y = desk.seatPosition.y;
  session.player.facing = desk.facing;
  session.player.moving = false;
  session.player.focusMode = true;
  session.player.focusDeskId = desk.id;
  session.input = createIdleInput(session.input.sequence);
  return "succeeded";
}

function leaveFocusDesk(
  session: InteractionSession,
  desk: Extract<WorldInteractableDefinition, { kind: "focus_desk" }>,
): InteractionResult["outcome"] {
  if (!session.player.focusMode) {
    return "succeeded";
  }

  if (session.player.focusDeskId !== desk.id) {
    return "unavailable";
  }

  session.player.focusMode = false;
  session.player.focusDeskId = null;
  session.player.moving = false;
  session.player.x = desk.exitPosition.x;
  session.player.y = desk.exitPosition.y;
  session.player.facing = "down";
  session.input = createIdleInput(session.input.sequence);
  return "succeeded";
}

function executeScreenStationAction(
  context: InteractionContext,
  station: WorldInteractableDefinition,
  actionId: InteractionActionId,
): InteractionResult["outcome"] {
  if (station.kind !== "screen_station") {
    return "invalid_target";
  }

  if (actionId === "stop_screen_share") {
    return stopScreenShare(context, station);
  }

  return startScreenShare(context, station);
}

function startScreenShare(
  { session, screenShareOwnersByStationId }: InteractionContext,
  station: Extract<WorldInteractableDefinition, { kind: "screen_station" }>,
): InteractionResult["outcome"] {
  if (session.player.focusMode) {
    return "unavailable";
  }

  if (getDistance(session.player, station.interactionPosition) > station.interactionRadius) {
    return "too_far";
  }

  const currentOwner = screenShareOwnersByStationId.get(station.id);

  if (currentOwner === session.player.sessionId) {
    return "succeeded";
  }

  if (currentOwner || screenShareOwnersByStationId.size > 0) {
    return "conflict";
  }

  screenShareOwnersByStationId.set(station.id, session.player.sessionId);
  return "succeeded";
}

function stopScreenShare(
  { session, screenShareOwnersByStationId }: InteractionContext,
  station: Extract<WorldInteractableDefinition, { kind: "screen_station" }>,
): InteractionResult["outcome"] {
  const currentOwner = screenShareOwnersByStationId.get(station.id);

  if (!currentOwner) {
    return "succeeded";
  }

  if (currentOwner !== session.player.sessionId) {
    return "forbidden";
  }

  screenShareOwnersByStationId.delete(station.id);
  return "succeeded";
}

function releaseScreenSharesForSession(
  screenShareOwnersByStationId: Map<string, string>,
  sessionId: string,
): void {
  for (const [stationId, presenterSessionId] of screenShareOwnersByStationId) {
    if (presenterSessionId === sessionId) {
      screenShareOwnersByStationId.delete(stationId);
    }
  }
}

function createResult(
  request: InteractionRequest,
  outcome: InteractionResult["outcome"],
): InteractionResult {
  return { ...request, outcome };
}

function getSessionCache(
  cache: Map<string, Map<string, InteractionResult>>,
  sessionId: string,
): Map<string, InteractionResult> {
  const existing = cache.get(sessionId);

  if (existing) {
    return existing;
  }

  const created = new Map<string, InteractionResult>();
  cache.set(sessionId, created);
  return created;
}

function cacheResult(
  cache: Map<string, InteractionResult>,
  result: InteractionResult,
): InteractionResult {
  cache.set(result.requestId, result);

  if (cache.size > MAX_CACHED_RESULTS_PER_SESSION) {
    const oldestRequestId = cache.keys().next().value;
    if (oldestRequestId) {
      cache.delete(oldestRequestId);
    }
  }

  return result;
}
