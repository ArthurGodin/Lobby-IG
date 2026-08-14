import type {
  AcousticSnapshot,
  MediaAccessSnapshot,
  PlayerSnapshot,
  ScreenShareSnapshot,
} from "@ig-campus/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CampusMediaController } from "../media/CampusMediaController";
import { type CampusMediaState, INITIAL_MEDIA_STATE } from "../media/mediaState";

export function useCampusMedia() {
  const audioRootRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<CampusMediaState>(INITIAL_MEDIA_STATE);
  const controllerRef = useRef<CampusMediaController | null>(null);
  const generationRef = useRef(0);
  const pendingAcousticRef = useRef<AcousticSnapshot | null>(null);
  const pendingScreenShareRef = useRef<ScreenShareSnapshot | null>(null);
  const pendingSpatialRef = useRef<{
    selfSessionId: string | null;
    players: readonly PlayerSnapshot[];
  }>({ selfSessionId: null, players: [] });

  const connect = useCallback(async (access: MediaAccessSnapshot) => {
    const generation = ++generationRef.current;
    await controllerRef.current?.disconnect();
    controllerRef.current = null;

    if (!access.available) {
      setState({
        ...INITIAL_MEDIA_STATE,
        status: access.reason === "not_configured" ? "unavailable" : "error",
      });
      return;
    }

    const { CampusMediaController } = await import("../media/CampusMediaController");

    if (generation !== generationRef.current) {
      return;
    }

    const controller = new CampusMediaController(setState, () => audioRootRef.current);
    controllerRef.current = controller;
    await controller.connect(access);
    controller.syncAcoustics(pendingAcousticRef.current);
    controller.syncScreenShare(pendingScreenShareRef.current);
    controller.syncSpatialPositions(
      pendingSpatialRef.current.selfSessionId,
      pendingSpatialRef.current.players,
    );
  }, []);
  const disconnect = useCallback(async () => {
    generationRef.current += 1;
    const controller = controllerRef.current;
    controllerRef.current = null;
    pendingAcousticRef.current = null;
    pendingScreenShareRef.current = null;
    pendingSpatialRef.current = { selfSessionId: null, players: [] };
    await controller?.disconnect();
    setState(INITIAL_MEDIA_STATE);
  }, []);
  const syncAcoustics = useCallback((acoustic: AcousticSnapshot | null) => {
    pendingAcousticRef.current = acoustic;
    controllerRef.current?.syncAcoustics(acoustic);
  }, []);
  const syncScreenShare = useCallback((screenShare: ScreenShareSnapshot | null) => {
    pendingScreenShareRef.current = screenShare;
    controllerRef.current?.syncScreenShare(screenShare);
  }, []);
  const toggleMicrophone = useCallback(() => {
    return controllerRef.current?.toggleMicrophone() ?? Promise.resolve();
  }, []);
  const muteMicrophone = useCallback(() => {
    return controllerRef.current?.muteMicrophone() ?? Promise.resolve();
  }, []);
  const syncSpatialPositions = useCallback(
    (selfSessionId: string | null, players: readonly PlayerSnapshot[]) => {
      pendingSpatialRef.current = { selfSessionId, players };
      controllerRef.current?.syncSpatialPositions(selfSessionId, players);
    },
    [],
  );
  const startAudio = useCallback(() => {
    return controllerRef.current?.startAudio() ?? Promise.resolve();
  }, []);
  const startScreenShare = useCallback((stationId: string) => {
    return controllerRef.current?.startScreenShare(stationId) ?? Promise.resolve();
  }, []);
  const stopScreenShare = useCallback(() => {
    return controllerRef.current?.stopScreenShare() ?? Promise.resolve();
  }, []);
  const attachScreenShareVideo = useCallback(
    (presenterIdentity: string, element: HTMLVideoElement, refreshVersion: number) => {
      if (refreshVersion < 0) {
        return;
      }

      return controllerRef.current?.attachScreenShareVideo(presenterIdentity, element);
    },
    [],
  );
  const setScreenShareViewing = useCallback((presenterIdentity: string, viewing: boolean) => {
    controllerRef.current?.setScreenShareViewing(presenterIdentity, viewing);
  }, []);
  const acknowledgeScreenShareStopped = useCallback(() => {
    controllerRef.current?.acknowledgeScreenShareStopped();
  }, []);

  useEffect(() => {
    return () => {
      void controllerRef.current?.disconnect();
    };
  }, []);

  return {
    audioRootRef,
    connect,
    disconnect,
    startAudio,
    startScreenShare,
    state,
    syncAcoustics,
    syncScreenShare,
    syncSpatialPositions,
    toggleMicrophone,
    muteMicrophone,
    stopScreenShare,
    attachScreenShareVideo,
    setScreenShareViewing,
    acknowledgeScreenShareStopped,
  };
}
