import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TokenVerifier } from "livekit-server-sdk";
import {
  createLiveKitMediaAccessProvider,
  createMediaAccessProviderFromEnv,
} from "./mediaAccess.js";

const TEST_API_KEY = "campus-test-key";
const TEST_API_SECRET = "campus-test-secret-with-enough-entropy";

describe("acesso de midia", () => {
  test("fica indisponivel quando a configuracao nao existe", async () => {
    const provider = createMediaAccessProviderFromEnv({});
    assert.deepEqual(await provider.createAccess("session-1", "Lin"), {
      available: false,
      reason: "not_configured",
    });
  });

  test("gera token restrito a sala e ao microfone", async () => {
    const provider = createLiveKitMediaAccessProvider({
      serverUrl: "ws://127.0.0.1:7880",
      apiKey: TEST_API_KEY,
      apiSecret: TEST_API_SECRET,
      roomName: "campus",
    });
    const access = await provider.createAccess("session-42", "Ada");

    assert.equal(access.available, true);

    if (!access.available) {
      return;
    }

    assert.equal(access.participantIdentity, "session-42");
    assert.equal(JSON.stringify(access).includes(TEST_API_SECRET), false);

    const grants = await new TokenVerifier(TEST_API_KEY, TEST_API_SECRET).verify(
      access.accessToken,
    );
    assert.equal(grants.sub, "session-42");
    assert.equal(grants.name, "Ada");
    assert.equal(grants.video?.room, "campus");
    assert.equal(grants.video?.roomJoin, true);
    assert.equal(grants.video?.canPublish, true);
    assert.equal(grants.video?.canPublishData, false);
    assert.equal(grants.video?.canSubscribe, true);
    assert.deepEqual(grants.video?.canPublishSources, ["microphone"]);
  });
});
