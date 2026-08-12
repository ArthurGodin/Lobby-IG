import type { MediaAccessSnapshot, ProximitySnapshot } from "@ig-campus/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CampusMediaController } from "../media/CampusMediaController";
import { type CampusMediaState, INITIAL_MEDIA_STATE } from "../media/mediaState";

export function useCampusMedia() {
  const audioRootRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<CampusMediaState>(INITIAL_MEDIA_STATE);
  const controllerRef = useRef<CampusMediaController | null>(null);
  const generationRef = useRef(0);

  const connect = useCallback(async (access: MediaAccessSnapshot) => {
    const generation = ++generationRef.current;
    await controllerRef.current?.disconnect();
    controllerRef.current = null;

    if (!access.available) {
      setState({
        status: access.reason === "not_configured" ? "unavailable" : "error",
        playbackBlocked: false,
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
  }, []);
  const disconnect = useCallback(async () => {
    generationRef.current += 1;
    const controller = controllerRef.current;
    controllerRef.current = null;
    await controller?.disconnect();
    setState(INITIAL_MEDIA_STATE);
  }, []);
  const syncProximity = useCallback((proximity: ProximitySnapshot) => {
    controllerRef.current?.syncProximity(proximity);
  }, []);
  const toggleMicrophone = useCallback(() => {
    return controllerRef.current?.toggleMicrophone() ?? Promise.resolve();
  }, []);
  const startAudio = useCallback(() => {
    return controllerRef.current?.startAudio() ?? Promise.resolve();
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
    state,
    syncProximity,
    toggleMicrophone,
  };
}
