import assert from "node:assert/strict";
import { test } from "node:test";
import { canChangeVisibility, isProjectId, visibilityHint } from "./public-projects.ts";

test("un identifiant du serveur se reconnaît, un nom court non", () => {
  assert.equal(isProjectId("5d091ef3-bd11-48d7-a1e2-6357a968ce29"), true);
  assert.equal(isProjectId("5D091EF3-BD11-48D7-A1E2-6357A968CE29"), true);
  assert.equal(isProjectId("demo-5d091e"), false, "le nom court d'un projet de la personne");
  assert.equal(isProjectId("5d091ef3-bd11-48d7-a1e2-6357a968ce29x"), false);
  assert.equal(isProjectId(""), false);
});

test("seul le propriétaire peut changer la visibilité", () => {
  assert.equal(canChangeVisibility("Owner"), true);
  for (const role of ["Maintainer", "Write", "Triage", "Read", undefined]) {
    assert.equal(canChangeVisibility(role), false, String(role));
  }
});

test("l'infobulle dit ce que la visibilité permet et qui peut la changer", () => {
  assert.match(visibilityHint("public", true), /lecture seule/);
  assert.match(visibilityHint("public", true), /passer en privé/);
  assert.match(visibilityHint("private", true), /passer en public/);
  assert.match(visibilityHint("private", true), /seuls les membres/);
  const locked = visibilityHint("public", false);
  assert.match(locked, /Seul le propriétaire/);
  assert.doesNotMatch(locked, /Cliquer/, "pas d'invitation à cliquer sur un bouton inactif");
});
