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
};

export function createInteractionService(): InteractionService {
  const resultCache = new Map<string, Map<string, InteractionResult>>();

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
        { request, session, sessions },
        interactable,
        request.actionId,
      );
      return cacheResult(sessionCache, createResult(request, outcome));
    },
    forgetSession(sessionId) {
      resultCache.delete(sessionId);
    },
  };
}

const INTERACTION_HANDLERS = {
  focus_desk: {
    actions: ["enter_focus", "leave_focus"],
    execute: executeFocusDeskAction,
  },
} satisfies Record<WorldInteractableKind, InteractionHandler>;

function executeFocusDeskAction(
  context: InteractionContext,
  desk: WorldInteractableDefinition,
  actionId: InteractionActionId,
): InteractionResult["outcome"] {
  if (actionId === "leave_focus") {
    return leaveFocusDesk(context.session, desk);
  }

  return enterFocusDesk(context, desk);
}

function enterFocusDesk(
  { session, sessions }: InteractionContext,
  desk: WorldInteractableDefinition,
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
  desk: WorldInteractableDefinition,
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
