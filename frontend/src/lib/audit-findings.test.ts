import assert from "node:assert/strict";
import { test } from "node:test";
import { toSuggestion, toSuggestions, type LiveAuditFinding } from "./audit-findings.ts";
import type { AISuggestion } from "./lonkoo-data.ts";

/**
 * L'onglet « Analyse IA » montre ce que le serveur renvoie, rien de plus. Avant, une remarque réelle recevait un score
 * (« +15 pts Score IA ») et un correctif (« +40% RPS », 2 réplicas) inventés, et « Appliquer » les écrivait dans le
 * canvas partagé.
 */

/** La seule remarque attendue pour ce cas. */
function one(finding: LiveAuditFinding, index = 0): AISuggestion {
  const result = toSuggestion(finding, index);
  assert.equal(result.length, 1);
  return result[0]!;
}

const complete: LiveAuditFinding = {
  id: "r1",
  severity: "CRITICAL",
  category: "SECURITY",
  title: "Base exposée",
  targetNodeId: "n1",
  currentConfig: "port ouvert",
  proposedConfig: "réseau privé",
  rationale: "Joignable depuis Internet",
};

test("une remarque du serveur est reprise telle quelle, en français pour l'écran", () => {
  const suggestion = one(complete);
  assert.equal(suggestion.id, "r1");
  assert.equal(suggestion.severity, "critique");
  assert.equal(suggestion.category, "Sécurité");
  assert.equal(suggestion.title, "Base exposée");
  assert.equal(suggestion.targetNodeId, "n1");
  assert.equal(suggestion.currentConfig, "port ouvert");
  assert.equal(suggestion.proposedConfig, "réseau privé");
  assert.equal(suggestion.rationale, "Joignable depuis Internet");
});

test("aucun score ni correctif n'est ajouté : la remarque ne peut rien écrire dans le canvas", () => {
  const suggestion = one(complete);
  assert.equal(suggestion.impactScore, undefined);
  assert.equal(suggestion.patch, undefined);
  // Même si un serveur ajoutait ces champs un jour, ils ne passent pas sans décision explicite.
  const other = one({ ...complete, impactScore: "+99 pts", patch: { replicas: 9 } } as LiveAuditFinding);
  assert.equal(other.impactScore, undefined);
  assert.equal(other.patch, undefined);
});

test("les trois gravités et les quatre catégories se traduisent", () => {
  const severities = ["CRITICAL", "RECOMMENDED", "OPTIMIZATION"].map((severity) => one({ ...complete, severity }).severity);
  assert.deepEqual(severities, ["critique", "recommandé", "optimisation"]);
  const categories = ["RESILIENCE", "STACK", "SECURITY", "PERFORMANCE"].map((category) => one({ ...complete, category }).category);
  assert.deepEqual(categories, ["Résilience", "Stack Technique", "Sécurité", "Performance"]);
});

test("une gravité ou une catégorie inconnue écarte la remarque au lieu d'être devinée", () => {
  assert.deepEqual(toSuggestion({ ...complete, severity: "URGENT" }, 0), []);
  assert.deepEqual(toSuggestion({ ...complete, severity: undefined }, 0), []);
  assert.deepEqual(toSuggestion({ ...complete, category: "COULEUR" }, 0), []);
  assert.deepEqual(toSuggestion({ ...complete, category: undefined }, 0), []);
});

test("sans titre ou sans bloc visé, la remarque est écartée", () => {
  assert.deepEqual(toSuggestion({ ...complete, title: "" }, 0), []);
  assert.deepEqual(toSuggestion({ ...complete, title: undefined }, 0), []);
  assert.deepEqual(toSuggestion({ ...complete, targetNodeId: undefined }, 0), []);
});

test("un texte absent reste vide : aucune phrase n'est écrite à la place du serveur", () => {
  const suggestion = one({ ...complete, rationale: undefined, currentConfig: undefined, proposedConfig: undefined });
  assert.equal(suggestion.rationale, "");
  assert.equal(suggestion.currentConfig, "");
  assert.equal(suggestion.proposedConfig, "");
});

test("un identifiant absent reçoit un numéro technique", () => {
  const suggestion = one({ ...complete, id: undefined }, 2);
  assert.equal(suggestion.id, "remarque-3");
});

test("une réponse sans remarque, ou sans liste, donne une liste vide", () => {
  assert.deepEqual(toSuggestions({}), []);
  assert.deepEqual(toSuggestions({ findings: [] }), []);
  assert.equal(toSuggestions({ findings: [complete, { ...complete, severity: "URGENT" }] }).length, 1);
});
