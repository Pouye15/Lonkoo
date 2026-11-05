import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CANVAS_TOO_LARGE_MESSAGE,
  CLOSE_CANVAS_TOO_LARGE,
  CLOSE_TOO_MANY_MESSAGES,
  stopsReconnection,
} from "./realtime-close.ts";

test("les codes sont ceux du serveur temps réel (realtime/src/limits.js)", () => {
  assert.equal(CLOSE_CANVAS_TOO_LARGE, 4413);
  assert.equal(CLOSE_TOO_MANY_MESSAGES, 4429);
});

test("canvas trop volumineux : on ne se reconnecte pas, sinon la modification refusée repartirait en boucle", () => {
  assert.equal(stopsReconnection(4413), true);
});

test("les autres coupures se reconnectent seules : trop de messages, accès retiré, panne du réseau, fermeture normale", () => {
  for (const code of [4429, 4403, 1006, 1001, 1000, 1009, undefined]) {
    assert.equal(stopsReconnection(code), false, `code ${code}`);
  }
});

test("le message dit ce qui s'est passé et quoi faire", () => {
  assert.match(CANVAS_TOO_LARGE_MESSAGE, /pas été enregistrée/);
  assert.match(CANVAS_TOO_LARGE_MESSAGE, /rechargez la page/);
});
