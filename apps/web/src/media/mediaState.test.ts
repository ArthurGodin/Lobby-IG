import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { canToggleMicrophone, INITIAL_MEDIA_STATE, mediaStatusLabel } from "./mediaState";

describe("estado da interface de audio", () => {
  test("habilita o controle apenas em estados seguros", () => {
    assert.equal(canToggleMicrophone("microphone-off"), true);
    assert.equal(canToggleMicrophone("active"), true);
    assert.equal(canToggleMicrophone("muted"), true);
    assert.equal(canToggleMicrophone("requesting-permission"), false);
    assert.equal(canToggleMicrophone("permission-denied"), false);
    assert.equal(canToggleMicrophone("privacy-error"), false);
    assert.equal(canToggleMicrophone("error"), false);
  });

  test("fornece rotulo legivel para todos os estados", () => {
    assert.equal(
      mediaStatusLabel({ status: "microphone-off", playbackBlocked: false }),
      "Microfone desligado",
    );
    assert.equal(mediaStatusLabel({ status: "active", playbackBlocked: false }), "Microfone ativo");
    assert.equal(
      mediaStatusLabel({ status: "permission-denied", playbackBlocked: false }),
      "Permissão bloqueada",
    );
    assert.equal(
      mediaStatusLabel({ status: "privacy-error", playbackBlocked: false }),
      "Privacidade do áudio indisponível",
    );
  });

  test("inicia sem participantes falando", () => {
    assert.deepEqual(INITIAL_MEDIA_STATE.speakingIdentities, []);
  });
});
