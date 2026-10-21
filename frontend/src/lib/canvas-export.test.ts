import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import type { ArchitectureEdge, ArchitectureNode } from "./lonkoo-data";
import { STENCIL_ITEMS } from "../components/studio/whiteboard/stencils.ts";
import { escapeXml, snapshotFromGraph, toMermaid, toSvg } from "./canvas-export.ts";
import { nodeFromEntry } from "./canvas-model.ts";

const docs = (name: string) => fileURLToPath(new URL(`../../../docs/${name}`, import.meta.url));
const schema = JSON.parse(readFileSync(docs("canvas.schema.json"), "utf-8"));
const example = JSON.parse(readFileSync(docs("exemples/marketplace-mobile.canvas.json"), "utf-8"));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

function blank(shape: ArchitectureNode["shape"], id: string, title: string, extra: Partial<ArchitectureNode> = {}): ArchitectureNode {
  const item = STENCIL_ITEMS.find((s) => s.shape === shape);
  assert.ok(item, shape);
  return {
    id, title, tech: "", version: "", shape, moduleGroup: item.group, description: "", status: "Actif",
    metricLabel: "", metricValue: "", baseLatencyMs: 3, maxRpsCapacity: 10000, replicas: 1, port: 0,
    role: item.role, x: 0, y: 0, envVars: [], dependencies: [], ...extra,
  };
}

const edge = (id: string, from: string, to: string, protocol: ArchitectureEdge["protocol"] = "REST / HTTP3"): ArchitectureEdge => ({
  id, from, to, protocol, throughput: "",
});

/** Une vérification de « bonne formation » XML : balises équilibrées, attributs entre guillemets, aucun caractère interdit. */
function assertWellFormed(xml: string) {
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml), "caractère de contrôle interdit en XML");
  assert.ok(!/&(?!(amp|lt|gt|quot|apos);)/.test(xml), "esperluette non échappée");
  const stack: string[] = [];
  for (const match of xml.matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g)) {
    const [, closing, name, , selfClosing] = match;
    if (selfClosing) continue;
    if (closing) assert.equal(stack.pop(), name, `balise fermante inattendue </${name}>`);
    else stack.push(name as string);
  }
  assert.deepEqual(stack, [], "balises non fermées");
  // Tout « < » du contenu appartient à une balise reconnue ci-dessus.
  const withoutTags = xml.replace(/<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g, "").replace(/<\?[^>]*\?>/g, "");
  assert.ok(!withoutTags.includes("<"), "« < » hors d'une balise");
}

// ------------------------------------------------------------------ JSON

test("l'instantané tiré du graphe est valide pour le schéma du contrat, avec toutes les formes", () => {
  const nodes = STENCIL_ITEMS.map((item, i) => blank(item.shape, `n${i}`, `${item.label} ${i}`, { tech: i % 2 ? "Redis 7" : "" }));
  const edges = [edge("e1", "n0", "n1"), edge("e2", "n2", "n3", "Kafka / Events"), edge("fantome", "n0", "absent")];
  const snapshot = snapshotFromGraph(nodes, edges, { name: "Essai" });

  assert.ok(validate(snapshot), JSON.stringify(validate.errors));
  assert.equal(snapshot.edges.length, 2, "le lien vers un bloc absent est écarté");
  assert.equal(new Set(snapshot.nodes.map((n) => n.data.name)).size, nodes.length, "identifiants techniques uniques");
  assert.ok(!JSON.stringify(snapshot).includes('"ui"'), "pas de clé ui dans un instantané");
});

test("l'instantané est trié par identifiant et identique quel que soit l'ordre d'entrée", () => {
  const a = blank("service", "b", "B");
  const b = blank("service", "a", "A");
  assert.deepEqual(snapshotFromGraph([a, b], []), snapshotFromGraph([b, a], []));
  assert.deepEqual(snapshotFromGraph([a, b], []).nodes.map((n) => n.id), ["a", "b"]);
});

test("le modèle d'exemple, ouvert dans le tableau puis réexporté, reste valide et garde ses tables", () => {
  const nodes = example.nodes.map((entry: { id: string }) => nodeFromEntry(entry.id, entry as never));
  const edges = example.edges.map((e: { id: string; source: string; target: string }) => edge(e.id, e.source, e.target));
  const snapshot = snapshotFromGraph(nodes, edges);

  assert.ok(validate(snapshot), JSON.stringify(validate.errors));
  assert.equal(snapshot.nodes.length, example.nodes.length);
  const base = snapshot.nodes.find((n) => n.type === "database");
  assert.equal((base?.data.entities as unknown[]).length, 2, "les tables survivent à l'export");
});

// ------------------------------------------------------------------ Mermaid

test("Mermaid : un flowchart, un nœud par bloc, un lien par liaison, formes et pointillés", () => {
  const nodes = [
    blank("user", "u", "Client"),
    blank("gateway", "g", "Passerelle", { tech: "Kong" }),
    blank("cylinder", "d", "Base"),
    blank("queue", "q", "Bus"),
  ];
  const code = toMermaid(nodes, [edge("e1", "u", "g"), edge("e2", "g", "d", "TCP / TLS"), edge("e3", "g", "q", "Kafka / Events"), edge("e4", "g", "absent")]);
  const lines = code.trim().split("\n");

  assert.equal(lines[0], "flowchart LR");
  assert.ok(lines.includes('  n1(["Client"])'));
  assert.ok(lines.includes('  n2{{"Passerelle<br/>Kong"}}'));
  assert.ok(lines.includes('  n3[("Base")]'));
  assert.ok(lines.includes('  n4[["Bus"]]'));
  assert.ok(lines.includes('  n1 -->|"REST / HTTP3"| n2'));
  assert.ok(lines.includes('  n2 -.->|"Kafka / Events"| n4'), "événements en pointillés");
  assert.equal(lines.filter((l) => l.includes("-->") || l.includes("-.->")).length, 3, "le lien vers un bloc absent est écarté");
  assert.ok(code.endsWith("\n"));
});

test("Mermaid : guillemets, chevrons, esperluette et retours à la ligne d'un titre ne cassent pas la syntaxe", () => {
  const code = toMermaid([blank("service", "s", 'API "v2" <beta> & co\nligne 2', { tech: "Go <1.23>" })], []);
  const label = /n1\["(.*)"\]/.exec(code)?.[1] ?? "";

  assert.ok(!/["<>&]/.test(label.replace(/<br\/>/g, "")), label);
  assert.ok(label.includes("#quot;v2#quot;") && label.includes("#lt;beta#gt;") && label.includes("#amp;"));
  assert.ok(!label.includes("\n"));
});

test("Mermaid : le « # » et l'accent grave sont remplacés (un titre ne fabrique jamais un code ni une chaîne Markdown)", () => {
  const code = toMermaid([blank("service", "s", "#quot; `code` # x")], []);
  assert.ok(code.includes('n1["#35;quot; #96;code#96; #35; x"]'), code);
});

test("Mermaid : un graphe vide donne un diagramme valide", () => {
  assert.equal(toMermaid([], []), "flowchart LR\n  %% Architecture vide\n");
});

// ------------------------------------------------------------------ SVG

test("SVG : bien formé, dimensions cohérentes, un groupe par bloc et par lien", () => {
  const nodes = STENCIL_ITEMS.map((item, i) => blank(item.shape, `n${i}`, `${item.label} ${i}`, { x: (i % 4) * 260, y: Math.floor(i / 4) * 160, tech: i % 2 ? "Postgres" : "" }));
  const edges = [edge("e1", "n0", "n1"), edge("e2", "n1", "n5"), edge("e3", "n2", "n9")];
  const { svg, width, height } = toSvg(nodes, edges, { title: "Architecture de test" });

  assertWellFormed(svg);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(width > 0 && height > 0 && Number.isFinite(width + height));
  assert.ok(!/NaN|undefined|Infinity/.test(svg), "valeur numérique invalide");
  assert.equal((svg.match(/data-node-id=/g) ?? []).length, nodes.length);
  assert.equal((svg.match(/data-edge-id=/g) ?? []).length, edges.length);
  assert.ok(svg.includes("<title>Architecture de test</title>"));
});

test("SVG : le texte saisi par l'utilisateur est échappé, jamais interprété", () => {
  const { svg } = toSvg([blank("service", "s", '<script>alert("x")</script> & \u0001 "a"', { tech: "<img onerror=1>" })], []);

  assertWellFormed(svg);
  assert.ok(!svg.includes("<script"), "balise script");
  assert.ok(!svg.includes("<img"), "balise img");
  assert.ok(svg.includes("&lt;script&gt;") || svg.includes("&lt;scri"), "le texte est échappé (éventuellement coupé)");
  assert.equal(escapeXml('a<b>&"\'\u0001'), "a&lt;b&gt;&amp;&quot;&apos;");
});

test("SVG : un graphe vide donne une image minimale lisible", () => {
  const { svg, width, height } = toSvg([], []);
  assertWellFormed(svg);
  assert.ok(svg.includes("Architecture vide"));
  assert.ok(width > 0 && height > 0);
});

test("SVG : les changements d'une comparaison sont colorés (ajouté vert, supprimé rouge pointillé, modifié orange)", () => {
  const nodes = [blank("service", "a", "A", { x: 0 }), blank("service", "b", "B", { x: 300 }), blank("service", "c", "C", { x: 600 }), blank("service", "d", "D", { x: 900 })];
  const { svg } = toSvg(nodes, [edge("e", "a", "b")], {
    status: {
      nodes: new Map([["a", "added"], ["b", "removed"], ["c", "modified"]] as const),
      edges: new Map([["e", "removed"]] as const),
    },
  });
  assertWellFormed(svg);
  const group = (id: string) => new RegExp(`<g data-node-id="${id}">.*?</g>`).exec(svg)?.[0] ?? "";
  assert.ok(group("a").includes("#16A34A"), "ajouté : vert");
  assert.ok(group("b").includes("#DC2626") && group("b").includes("stroke-dasharray"), "supprimé : rouge pointillé");
  assert.ok(group("c").includes("#EA580C"), "modifié : orange");
  assert.ok(!group("d").includes("#16A34A") && !group("d").includes("#DC2626") && !group("d").includes("#EA580C"), "inchangé : neutre");
  assert.ok(/<g data-edge-id="e">.*#DC2626/.test(svg), "lien supprimé en rouge");
});
