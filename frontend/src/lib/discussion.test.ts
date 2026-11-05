import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_MESSAGE_CHARS,
  draftProblem,
  isBlank,
  isNearBottom,
  lastMessageId,
  mergeMessages,
  pollDelayMs,
  type DiscussionMessage,
} from "./discussion.ts";

function message(id: number, overrides: Partial<DiscussionMessage> = {}): DiscussionMessage {
  return {
    id,
    authorId: "u1",
    authorName: "Aminata Sow",
    avatarUrl: null,
    body: `message ${id}`,
    createdAt: "2026-11-05T10:00:00Z",
    mine: false,
    ...overrides,
  };
}

test("un texte vide ou fait d'espaces ne part pas, sans erreur à afficher", () => {
  assert.equal(isBlank(""), true);
  assert.equal(isBlank("  \n\t "), true);
  assert.equal(isBlank("bonjour"), false);
  assert.equal(draftProblem("   "), null);
});

test("le plafond est celui du serveur : 2 000 caractères passent, 2 001 non (espaces de bord exclus)", () => {
  assert.equal(MAX_MESSAGE_CHARS, 2000);
  assert.equal(draftProblem("x".repeat(2000)), null);
  assert.match(draftProblem("x".repeat(2001)) ?? "", /2000 caractères/);
  assert.equal(draftProblem(`  ${"x".repeat(2000)}  `), null, "le serveur retire les espaces de bord avant de compter");
});

test("les messages reçus s'ajoutent à la suite, sans doublon", () => {
  const current = [message(1), message(2)];
  const merged = mergeMessages(current, [message(2), message(3)]);
  assert.deepEqual(merged.map((m) => m.id), [1, 2, 3]);
});

test("un message déjà là n'est pas remplacé : l'ordre de la conversation reste celui des identifiants", () => {
  const merged = mergeMessages([message(5)], [message(3), message(4)]);
  assert.deepEqual(merged.map((m) => m.id), [3, 4, 5]);
});

test("rien de nouveau : le même tableau revient, donc aucun rendu inutile", () => {
  const current = [message(1), message(2)];
  assert.equal(mergeMessages(current, [message(1)]), current);
  assert.equal(mergeMessages(current, []), current);
});

test("le dernier identifiant sert de point de départ à la lecture suivante", () => {
  assert.equal(lastMessageId([]), undefined);
  assert.equal(lastMessageId([message(4), message(9)]), 9);
});

test("la lecture est rapide si l'onglet est visible, lente s'il est caché, et ralentit après des échecs", () => {
  assert.equal(pollDelayMs({ visible: true, failures: 0 }), 3000);
  assert.equal(pollDelayMs({ visible: false, failures: 0 }), 20000);
  assert.equal(pollDelayMs({ visible: true, failures: 1 }), 6000);
  assert.equal(pollDelayMs({ visible: true, failures: 2 }), 12000);
  assert.equal(pollDelayMs({ visible: true, failures: 3 }), 24000);
  assert.equal(pollDelayMs({ visible: true, failures: 50 }), 30000, "jamais plus de 30 s");
  assert.equal(pollDelayMs({ visible: false, failures: 5 }), 30000);
});

test("la liste suit les nouveaux messages seulement si on est déjà en bas", () => {
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 600, clientHeight: 400 }), true);
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 530, clientHeight: 400 }), true, "à 70 px du bas");
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 100, clientHeight: 400 }), false, "on relit plus haut");
});
