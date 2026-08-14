import type {
  InteractionActionId,
  InteractionRequest,
  InteractionResult,
  PlayerSnapshot,
  ScreenShareSnapshot,
} from "@ig-campus/contracts";
import {
  getInteractionCandidates,
  getWorldInteractableById,
  type WorldInteractableKind,
} from "@ig-campus/game-core";

export type InteractionOption = {
  key: string;
  interactableId: string;
  kind: WorldInteractableKind;
  label: string;
  actionId: InteractionActionId;
  actionLabel: string;
  available: boolean;
  unavailableMessage: string | null;
  distance: number;
};

export type InteractionPanelContent = {
  active: boolean;
  label: string;
  help: string;
};

let fallbackRequestSequence = 0;

export function buildInteractionOptions(
  self: PlayerSnapshot | null,
  players: readonly PlayerSnapshot[],
  screenShare?: Pick<ScreenShareSnapshot, "presentations">,
): InteractionOption[] {
  if (!self) {
    return [];
  }

  return getInteractionCandidates(self, players, screenShare).map((candidate) => ({
    key: `${candidate.interactable.id}:${candidate.actionId}`,
    interactableId: candidate.interactable.id,
    kind: candidate.interactable.kind,
    label: candidate.interactable.label,
    actionId: candidate.actionId,
    actionLabel: getInteractionActionLabel(candidate.actionId),
    available: candidate.available,
    unavailableMessage:
      candidate.unavailableReason === "occupied" ? "Ocupada por outra pessoa" : null,
    distance: Math.round(candidate.distance),
  }));
}

export function createInteractionRequest(option: InteractionOption): InteractionRequest {
  return createInteractionRequestForAction(option.interactableId, option.actionId);
}

export function createInteractionRequestForAction(
  interactableId: string,
  actionId: InteractionActionId,
): InteractionRequest {
  return {
    requestId: createRequestId(),
    interactableId,
    actionId,
  };
}

export function buildInteractionPanelContent(
  self: PlayerSnapshot | null,
  players: readonly PlayerSnapshot[],
  options: readonly InteractionOption[],
  screenShare?: Pick<ScreenShareSnapshot, "presentations">,
): InteractionPanelContent {
  if (self?.focusMode) {
    return {
      active: true,
      label: getWorldInteractableById(self.focusDeskId)?.label ?? "Deep Work",
      help: "Deep Work ativo · áudio e aproximação protegidos.",
    };
  }

  const ownPresentation = screenShare?.presentations.find(
    (presentation) => presentation.presenterSessionId === self?.sessionId,
  );

  if (ownPresentation) {
    return {
      active: true,
      label: getWorldInteractableById(ownPresentation.stationId)?.label ?? "Apresentação",
      help: "Compartilhando sua tela com as pessoas próximas.",
    };
  }

  const primary = options[0];

  if (!primary) {
    return {
      active: false,
      label: "Nenhum objeto próximo",
      help: "Aproxime-se de um objeto interativo do campus.",
    };
  }

  const occupant = players.find(
    (player) =>
      player.sessionId !== self?.sessionId && player.focusDeskId === primary.interactableId,
  );

  return {
    active: false,
    label: primary.label,
    help: occupant
      ? `${primary.label} está ocupada por ${occupant.name}.`
      : "Pressione E ou use o botão para interagir.",
  };
}

export function getInteractionResultMessage(result: InteractionResult): string {
  const label = getWorldInteractableById(result.interactableId)?.label ?? "Este objeto";

  switch (result.outcome) {
    case "succeeded":
      if (result.actionId === "leave_focus") {
        return `Você saiu de ${label}.`;
      }
      if (result.actionId === "start_screen_share") {
        return `Escolha a tela para compartilhar em ${label}.`;
      }
      if (result.actionId === "stop_screen_share") {
        return `Compartilhamento encerrado em ${label}.`;
      }
      return `Foco ativado em ${label}.`;
    case "invalid_target":
      return "Este objeto não está mais disponível no mapa.";
    case "invalid_action":
      return "Esta ação não é compatível com o objeto.";
    case "too_far":
      return `Aproxime-se de ${label} para interagir.`;
    case "unavailable":
      return "Conclua a interação atual antes de iniciar outra.";
    case "forbidden":
      return "Você não tem permissão para executar esta ação.";
    case "conflict":
      return `${label} acabou de ser ocupada.`;
  }
}

export function getInteractionActionLabel(actionId: InteractionActionId): string {
  switch (actionId) {
    case "leave_focus":
      return "Sair do foco";
    case "start_screen_share":
      return "Compartilhar tela";
    case "stop_screen_share":
      return "Encerrar apresentação";
    default:
      return "Sentar e focar";
  }
}

function createRequestId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  fallbackRequestSequence += 1;
  return `interaction-${Date.now().toString(36)}-${fallbackRequestSequence.toString(36)}`;
}
