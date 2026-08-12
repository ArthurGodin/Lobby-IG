export type CampusMediaStatus =
  | "unavailable"
  | "connecting"
  | "microphone-off"
  | "requesting-permission"
  | "active"
  | "muted"
  | "permission-denied"
  | "reconnecting"
  | "error";

export type CampusMediaState = {
  status: CampusMediaStatus;
  playbackBlocked: boolean;
};

export const INITIAL_MEDIA_STATE: CampusMediaState = {
  status: "unavailable",
  playbackBlocked: false,
};

export function mediaStatusLabel(state: CampusMediaState): string {
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
    case "error":
      return "Erro no áudio";
    default:
      return "Áudio indisponível";
  }
}

export function canToggleMicrophone(status: CampusMediaStatus): boolean {
  return status === "microphone-off" || status === "active" || status === "muted";
}
