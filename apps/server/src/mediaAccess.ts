import type { MediaAccessSnapshot } from "@ig-campus/contracts";
import { AccessToken, TrackSource } from "livekit-server-sdk";

export const MEDIA_TOKEN_TTL = "12h";
export const DEFAULT_MEDIA_ROOM = "campus";

export type MediaAccessProvider = {
  createAccess: (
    participantIdentity: string,
    participantName: string,
  ) => Promise<MediaAccessSnapshot>;
};

export type LiveKitMediaConfig = {
  serverUrl: string;
  apiKey: string;
  apiSecret: string;
  roomName: string;
};

export function createUnavailableMediaAccessProvider(): MediaAccessProvider {
  return {
    async createAccess() {
      return { available: false, reason: "not_configured" };
    },
  };
}

export function createLiveKitMediaAccessProvider(config: LiveKitMediaConfig): MediaAccessProvider {
  return {
    async createAccess(participantIdentity, participantName) {
      const token = new AccessToken(config.apiKey, config.apiSecret, {
        identity: participantIdentity,
        name: participantName,
        ttl: MEDIA_TOKEN_TTL,
      });
      token.addGrant({
        room: config.roomName,
        roomJoin: true,
        canPublish: true,
        canPublishSources: [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE],
        canPublishData: false,
        canSubscribe: true,
        canUpdateOwnMetadata: false,
      });

      return {
        available: true,
        serverUrl: config.serverUrl,
        accessToken: await token.toJwt(),
        participantIdentity,
      };
    },
  };
}

export function createMediaAccessProviderFromEnv(
  environment: NodeJS.ProcessEnv = process.env,
): MediaAccessProvider {
  const serverUrl = environment.LIVEKIT_URL?.trim();
  const apiKey = environment.LIVEKIT_API_KEY?.trim();
  const apiSecret = environment.LIVEKIT_API_SECRET?.trim();

  if (!serverUrl || !apiKey || !apiSecret) {
    return createUnavailableMediaAccessProvider();
  }

  return createLiveKitMediaAccessProvider({
    serverUrl,
    apiKey,
    apiSecret,
    roomName: environment.LIVEKIT_ROOM?.trim() || DEFAULT_MEDIA_ROOM,
  });
}
