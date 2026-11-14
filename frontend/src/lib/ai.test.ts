import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "./api.ts";
import {
  aiErrorMessage,
  asAuditResult,
  asProposal,
  backupVersionName,
  categoryLabel,
  correctionInstruction,
  countBySeverity,
  demoAuditResult,
  discardedNotice,
  findingsSummary,
  graphFromSnapshot,
  parseChatEvent,
  severityLabel,
  severitySummary,
  sortFindings,
  takeChatEvents,
  takeSseEvents,
  type AiFinding,
} from "./ai.ts";
import type { ArchitectureNode } from "./lonkoo-data.ts";

function finding(overrides: Partial<AiFinding> = {}): AiFinding {
  return {
    id: "f1",
    severity: "RECOMMENDED",
    category: "STACK",
    title: "Ajouter une passerelle devant la base",
    targetNodeId: "n1",
    rationale: "Une base ne reçoit pas de trafic direct.",
    currentConfig: "Accès direct",
    proposedConfig: "Passerelle API devant la base",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Libellés                                                            */
/* ------------------------------------------------------------------ */

test("les gravités du contrat portent les libellés imposés", () => {
  assert.equal(severityLabel("CRITICAL"), "critique");
  assert.equal(severityLabel("RECOMMENDED"), "recommandé");
  assert.equal(severityLabel("OPTIMIZATION"), "optimisation");
  assert.equal(severityLabel(null), "gravité non précisée");
});

test("les catégories du contrat portent les libellés imposés", () => {
  assert.equal(categoryLabel("RESILIENCE"), "Résilience");
  assert.equal(categoryLabel("STACK"), "Stack Technique");
  assert.equal(categoryLabel("SECURITY"), "Sécurité");
  assert.equal(categoryLabel("PERFORMANCE"), "Performance");
  assert.equal(categoryLabel(null), "catégorie non précisée");
});

test("les remarques sont triées du plus grave au moins grave, l'inconnu à la fin", () => {
  const sorted = sortFindings([
    finding({ id: "a", severity: null }),
    finding({ id: "b", severity: "OPTIMIZATION" }),
    finding({ id: "c", severity: "CRITICAL" }),
    finding({ id: "d", severity: "RECOMMENDED" }),
  ]);
  assert.deepEqual(
    sorted.map((f) => f.id),
    ["c", "d", "b", "a"],
  );
});

/* ------------------------------------------------------------------ */
/* Décompte (le seul indicateur, aucun score inventé)                  */
/* ------------------------------------------------------------------ */

test("le décompte par gravité ne compte que les remarques reçues", () => {
  const counts = countBySeverity([
    finding({ severity: "CRITICAL" }),
    finding({ severity: "CRITICAL" }),
    finding({ severity: "OPTIMIZATION" }),
    finding({ severity: null }),
  ]);
  assert.deepEqual(counts, { CRITICAL: 2, RECOMMENDED: 0, OPTIMIZATION: 1, other: 1, total: 4 });
});

test("le résumé des gravités s'accorde en nombre", () => {
  assert.equal(severitySummary([]), "");
  assert.equal(severitySummary([finding({ severity: "CRITICAL" })]), "1 critique");
  assert.equal(
    severitySummary([finding({ severity: "CRITICAL" }), finding({ severity: "CRITICAL" }), finding({ severity: "RECOMMENDED" })]),
    "2 critiques, 1 recommandée",
  );
});

test("le résumé d'un audit dit le nombre de remarques, ou qu'il n'y en a aucune", () => {
  assert.equal(findingsSummary([]), "Aucune remarque");
  assert.equal(findingsSummary([finding({ severity: "CRITICAL" })]), "1 remarque : 1 critique");
  assert.equal(
    findingsSummary([finding({ severity: "CRITICAL" }), finding({ severity: "OPTIMIZATION" })]),
    "2 remarques : 1 critique, 1 optimisation",
  );
});

test("les remarques écartées par le serveur sont annoncées, et rien n'est dit quand il n'y en a pas", () => {
  assert.equal(discardedNotice(0), null);
  assert.equal(discardedNotice(-1), null);
  assert.equal(discardedNotice(1), "1 remarque a été écartée : elle visait un bloc absent du canvas.");
  assert.equal(discardedNotice(3), "3 remarques ont été écartées : elles visaient des blocs absents du canvas.");
});

test("la consigne de correction reprend la proposition, le titre à défaut", () => {
  assert.equal(correctionInstruction(finding()), "Passerelle API devant la base");
  assert.equal(correctionInstruction(finding({ proposedConfig: "   " })), "Ajouter une passerelle devant la base");
});

test("la version de retour porte l'heure et tient dans la limite du serveur", () => {
  assert.equal(backupVersionName(new Date(2026, 10, 14, 9, 5)), "Avant IA 09h05");
  assert.equal(backupVersionName(new Date(2026, 10, 14, 14, 32)), "Avant IA 14h32");
  assert.ok(backupVersionName(new Date(2026, 10, 14, 23, 59)).length <= 80);
});

/* ------------------------------------------------------------------ */
/* Lecture des réponses : rien n'est complété                          */
/* ------------------------------------------------------------------ */

test("une remarque incomplète garde ses champs vides au lieu d'être inventée", () => {
  const result = asAuditResult({
    findings: [{ title: "Point unique de défaillance", severity: "INCONNU", targetNodeId: "" }],
    discarded: 2,
    demo: true,
  });
  assert.equal(result.findings.length, 1);
  const first = result.findings[0];
  assert.ok(first);
  assert.equal(first.id, "remarque-1");
  assert.equal(first.severity, null);
  assert.equal(first.category, null);
  assert.equal(first.targetNodeId, null);
  assert.equal(first.currentConfig, "");
  assert.equal(first.proposedConfig, "");
  assert.equal(result.discarded, 2);
  assert.equal(result.demo, true);
});

test("une réponse d'audit vide ou illisible donne zéro remarque, jamais un jeu d'exemple", () => {
  assert.deepEqual(asAuditResult(null), { findings: [], discarded: 0, demo: false });
  assert.deepEqual(asAuditResult({ findings: "oui" }), { findings: [], discarded: 0, demo: false });
  assert.deepEqual(asAuditResult({ findings: [{ id: "x" }, 42] }), { findings: [], discarded: 0, demo: false });
});

test("les avertissements d'une proposition sont facultatifs", () => {
  const sans = asProposal({ canvas: { nodes: [], edges: [] }, summary: " Ajout d'une passerelle ", demo: false });
  assert.equal(sans.warnings, undefined);
  assert.equal(sans.summary, "Ajout d'une passerelle");
  assert.equal(sans.demo, false);

  const avec = asProposal({ canvas: {}, warnings: ["Le bloc « cache » disparaît.", "", 7], demo: true });
  assert.deepEqual(avec.warnings, ["Le bloc « cache » disparaît."]);
  assert.equal(avec.demo, true);

  assert.equal(asProposal({ summary: "x" }).canvas, null);
});

test("les remarques du mode démonstration sont étiquetées démonstration", () => {
  const demo = demoAuditResult();
  assert.equal(demo.demo, true);
  assert.ok(demo.findings.length > 0);
  for (const item of demo.findings) {
    assert.ok(item.severity !== null, "la gravité d'exemple doit correspondre au contrat");
    assert.ok(item.category !== null, "la catégorie d'exemple doit correspondre au contrat");
  }
});

/* ------------------------------------------------------------------ */
/* Erreurs                                                             */
/* ------------------------------------------------------------------ */

test("chaque erreur de l'IA a son message, jamais un repli silencieux", () => {
  assert.equal(
    aiErrorMessage(new ApiError(429, "Trop de demandes", "Limite de 30 appels par jour atteinte.")),
    "Limite de 30 appels par jour atteinte.",
  );
  assert.equal(
    aiErrorMessage(new ApiError(429, "Trop de demandes", "Trop de demandes")),
    "La limite d'appels à l'IA pour aujourd'hui est atteinte. Réessayez demain.",
  );
  assert.equal(aiErrorMessage(new ApiError(501, "Non implémenté", "")), "L'agent IA n'est pas branché sur ce serveur.");
  assert.equal(
    aiErrorMessage(new ApiError(502, "Mauvaise passerelle", "", ["nodes[0].name : identifiant invalide"])),
    "La proposition de l'agent IA ne respecte pas le contrat du canvas : elle a été refusée, rien n'a été modifié.",
  );
  assert.equal(
    aiErrorMessage(new ApiError(502, "Mauvaise passerelle", "")),
    "Le fournisseur d'IA est indisponible pour le moment. Réessayez dans un instant.",
  );
  assert.equal(
    aiErrorMessage(new ApiError(503, "Indisponible", "")),
    "Le fournisseur d'IA est indisponible pour le moment. Réessayez dans un instant.",
  );
  assert.equal(aiErrorMessage(new ApiError(504, "Délai dépassé", "")), "Le fournisseur d'IA n'a pas répondu à temps. Réessayez dans un instant.");
  assert.equal(aiErrorMessage(new ApiError(0, "Serveur injoignable", "Le serveur est injoignable.")), "Le serveur est injoignable. Réessayez dans un instant.");
  assert.equal(aiErrorMessage(new ApiError(404, "Introuvable", "Ce canvas n'existe pas.")), "Ce canvas n'existe pas.");
  assert.equal(aiErrorMessage(new Error("boum")), "Une erreur inattendue s'est produite.");
});

/* ------------------------------------------------------------------ */
/* Flux SSE                                                            */
/* ------------------------------------------------------------------ */

test("un événement coupé entre deux lectures est conservé puis complété", () => {
  // Première lecture : un événement entier, puis le début d'un second.
  const first = takeSseEvents('data: {"content": "Bon"}\n\ndata: {"cont');
  assert.deepEqual(first.events, ['data: {"content": "Bon"}']);
  assert.equal(first.rest, 'data: {"cont');

  // Deuxième lecture : la suite complète l'événement coupé, rien n'est perdu.
  const second = takeSseEvents(`${first.rest}ent": "jour"}\n\n`);
  assert.deepEqual(second.events, ['data: {"content": "jour"}']);
  assert.equal(second.rest, "");

  const texts = [...first.events, ...second.events].map(parseChatEvent);
  assert.deepEqual(texts, [
    { kind: "text", text: "Bon" },
    { kind: "text", text: "jour" },
  ]);
});

test("les fins de ligne du réseau et les événements vides ne gênent pas le découpage", () => {
  const { events, rest } = takeSseEvents('data: {"content": "a"}\r\n\r\n\r\n\r\ndata: [DONE]\r\n\r\n');
  assert.deepEqual(events, ['data: {"content": "a"}', "data: [DONE]"]);
  assert.equal(rest, "");
});

test("un événement multi-lignes rend son contenu complet", () => {
  assert.deepEqual(parseChatEvent('data: {"content": "a"}\ndata: '), { kind: "text", text: "a" });
  assert.deepEqual(parseChatEvent(': commentaire\ndata: {"content": "b"}'), { kind: "text", text: "b" });
  assert.deepEqual(parseChatEvent("event: ping"), { kind: "ignored" });
});

test("la fin du flux, les erreurs et les fragments illisibles sont reconnus", () => {
  assert.deepEqual(parseChatEvent("data: [DONE]"), { kind: "done" });
  assert.deepEqual(parseChatEvent('data: {"error": "Le service IA est temporairement indisponible."}'), {
    kind: "error",
    message: "Le service IA est temporairement indisponible.",
  });
  // Un fragment de JSON tronqué n'est jamais affiché tel quel.
  assert.deepEqual(parseChatEvent('data: {"content": "tron'), { kind: "ignored" });
  assert.deepEqual(parseChatEvent("data: pas du json"), { kind: "ignored" });
  assert.deepEqual(parseChatEvent('data: {"autre": 1}'), { kind: "ignored" });
});

test("le tampon rend les événements interprétés et ce qu'il reste", () => {
  const { events, rest } = takeChatEvents('data: {"content": "x"}\n\ndata: [DONE]\n\ndata: {"con');
  assert.deepEqual(events, [{ kind: "text", text: "x" }, { kind: "done" }]);
  assert.equal(rest, 'data: {"con');
});

/* ------------------------------------------------------------------ */
/* Proposition vers graphe                                             */
/* ------------------------------------------------------------------ */

function node(overrides: Partial<ArchitectureNode> = {}): ArchitectureNode {
  return {
    id: "n1",
    title: "Base principale",
    tech: "PostgreSQL",
    version: "16.4",
    shape: "cylinder",
    moduleGroup: "Données",
    description: "",
    status: "Actif",
    metricLabel: "Débit",
    metricValue: "1.2k",
    baseLatencyMs: 4,
    maxRpsCapacity: 12000,
    replicas: 2,
    port: 5432,
    role: "database",
    x: 10,
    y: 20,
    envVars: [],
    dependencies: [],
    ...overrides,
  };
}

test("une proposition garde les champs propres au front des blocs qui existent déjà", () => {
  const snapshot = {
    schemaVersion: 1,
    nodes: [
      { id: "n1", type: "database", position: { x: 100, y: 200 }, data: { name: "base", label: "Base répliquée", tech: "PostgreSQL 16", engine: "postgresql", entities: [] } },
      { id: "n2", type: "service", position: { x: 300, y: 200 }, data: { name: "api", label: "API", tech: "" } },
    ],
    edges: [
      { id: "e1", source: "n2", target: "n1", kind: "data" },
      { id: "e2", source: "n2", target: "absent", kind: "http" },
    ],
  };
  const { nodes, edges } = graphFromSnapshot(snapshot, [node()]);

  assert.deepEqual(
    nodes.map((n) => n.id),
    ["n1", "n2"],
  );
  const base = nodes[0];
  assert.ok(base);
  // Le contrat vient de la proposition…
  assert.equal(base.title, "Base répliquée");
  assert.equal(base.tech, "PostgreSQL 16");
  assert.equal(base.x, 100);
  assert.equal(base.y, 200);
  // …et les champs du front restent ceux du bloc existant (aucune métrique inventée).
  assert.equal(base.version, "16.4");
  assert.equal(base.replicas, 2);
  assert.equal(base.metricValue, "1.2k");

  // Un lien vers un bloc absent est écarté.
  assert.deepEqual(
    edges.map((e) => e.id),
    ["e1"],
  );
});

test("un instantané absent ou illisible ne donne aucun bloc", () => {
  assert.deepEqual(graphFromSnapshot(null), { nodes: [], edges: [] });
  assert.deepEqual(graphFromSnapshot({ nodes: [{ type: "service" }, { id: "x" }] }), { nodes: [], edges: [] });
});
