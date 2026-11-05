import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_MESSAGE_CHARS,
  draftProblem,
  enterSends,
  isBlank,
  isNearBottom,
  lastMessageId,
  mergeMessages,
  pollDelayMs,
  badgeText,
  unreadFrom,
  unreadLabel,
  unreadPollDelayMs,
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

test("Entrée envoie au clavier, sauf avec Maj, pendant une composition, ou sur un écran tactile", () => {
  const press = (overrides = {}) => ({ key: "Enter", shiftKey: false, isComposing: false, ...overrides });
  assert.equal(enterSends(press(), false), true);
  assert.equal(enterSends(press({ shiftKey: true }), false), false, "Maj+Entrée va à la ligne");
  assert.equal(enterSends(press({ isComposing: true }), false), false, "la composition d'un accent n'envoie pas");
  assert.equal(enterSends(press(), true), false, "sur écran tactile, Entrée va à la ligne : le bouton envoie");
  assert.equal(enterSends(press({ key: "a" }), false), false);
});

test("les messages non lus sont ceux des autres arrivés après le dernier vu : jamais les siens", () => {
  const batch = [message(5), message(6, { mine: true }), message(7), message(3)];
  assert.equal(unreadFrom(batch, 4), 2, "5 et 7 ; 6 est le mien, 3 est déjà vu");
  assert.equal(unreadFrom(batch, 7), 0);
  assert.equal(unreadFrom([], 0), 0);
});

test("la pastille ne grandit pas au-delà de 99 et se lit correctement", () => {
  assert.equal(badgeText(1), "1");
  assert.equal(badgeText(99), "99");
  assert.equal(badgeText(100), "99+");
  assert.equal(unreadLabel(1), "1 message non lu");
  assert.equal(unreadLabel(3), "3 messages non lus");
  assert.equal(unreadLabel(250), "99+ messages non lus");
});

test("le recomptage des non lus est plus lent que la discussion ouverte, et lent onglet caché", () => {
  assert.equal(unreadPollDelayMs(true), 10000);
  assert.equal(unreadPollDelayMs(false), 60000);
  assert.ok(unreadPollDelayMs(true) > pollDelayMs({ visible: true, failures: 0 }));
});
