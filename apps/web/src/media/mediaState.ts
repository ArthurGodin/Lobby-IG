export type CampusMediaStatus =
  | "unavailable"
  | "connecting"
  | "microphone-off"
  | "requesting-permission"
  | "active"
  | "muted"
  | "permission-denied"
  | "reconnecting"
  | "privacy-error"
  | "error";

export type ScreenShareStatus = "idle" | "selecting" | "active" | "permission-denied" | "error";

export type CampusMediaState = {
  status: CampusMediaStatus;
  playbackBlocked: boolean;
  speakingIdentities: string[];
  screenShareStatus: ScreenShareStatus;
  screenShareStoppedStationId: string | null;
  screenShareTrackVersion: number;
};

export const INITIAL_MEDIA_STATE: CampusMediaState = {
  status: "unavailable",
  playbackBlocked: false,
  speakingIdentities: [],
  screenShareStatus: "idle",
  screenShareStoppedStationId: null,
  screenShareTrackVersion: 0,
};

export function mediaStatusLabel(
  state: Pick<CampusMediaState, "status" | "playbackBlocked">,
): string {
  switch (state.status) {
    case "connecting":
      return "Conectando o áudio";
    case "microphone-off":
      return "Microfone desligado";
    case "requesting-permission":
      return "Aguardando permissão";
    case "active":
      return "Microfone ativo";
    case "muted":
      return "Microfone mutado";
    case "permission-denied":
      return "Permissão bloqueada";
    case "reconnecting":
      return "Reconectando o áudio";
    case "privacy-error":
      return "Privacidade do áudio indisponível";
    case "error":
      return "Erro no áudio";
    default:
      return "Áudio indisponível";
  }
}

export function canToggleMicrophone(status: CampusMediaStatus): boolean {
  return status === "microphone-off" || status === "active" || status === "muted";
}

export function canStartScreenShare(status: CampusMediaStatus): boolean {
  return status === "microphone-off" || status === "active" || status === "muted";
}

export function screenShareStatusLabel(status: ScreenShareStatus): string {
  switch (status) {
    case "selecting":
      return "Escolhendo uma tela";
    case "active":
      return "Compartilhando sua tela";
    case "permission-denied":
      return "Permissão de tela bloqueada";
    case "error":
      return "Não foi possível compartilhar a tela";
    default:
      return "Nenhuma apresentação ativa";
  }
}
