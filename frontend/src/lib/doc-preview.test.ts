import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ArchitectureNode } from "./lonkoo-data";
import { edgeFromEntry, nodeFromEntry, type JsonObject } from "./canvas-model.ts";
import { GENERATED_DOC_FILES, buildDocSections } from "./doc-preview.ts";

/** Un bloc construit comme le Studio le lit dans le document : type et données du contrat. */
function block(id: string, type: string, data: JsonObject = {}, ui?: JsonObject): ArchitectureNode {
  return nodeFromEntry(id, { type, position: { x: 0, y: 0 }, data: { name: id, label: id, ...data }, ...(ui ? { ui } : {}) });
}

test("un schéma vide donne trois sections qui disent quoi faire, sans aucune ligne", () => {
  const [components, links, contract] = buildDocSections([], []);
  assert.deepEqual([components.id, links.id, contract.id], ["components", "links", "contract"]);
  assert.match(components.summary, /vide/);
  assert.match(links.summary, /^Aucun lien/);
  assert.match(contract.summary, /^Aucune table ni route/);
  for (const section of [components, links, contract]) assert.deepEqual(section.items, []);
});

test("les composants sont nommés comme dans le Studio, avec leur stack quand elle est renseignée", () => {
  const db = block("db", "database", { tech: "PostgreSQL" }, { version: "16" });
  const api = block("api", "service");
  assert.deepEqual(buildDocSections([db, api], [])[0].items, ["db (PostgreSQL 16)", "api"]);
  assert.equal(buildDocSections([db, api], [])[0].summary, "2 composants dans le schéma.");
  // En français, le pluriel commence à deux.
  assert.equal(buildDocSections([api], [])[0].summary, "1 composant dans le schéma.");
});

test("les liens nomment leurs deux blocs et leur protocole ; un bloc inconnu garde son identifiant", () => {
  const nodes = [block("web", "service"), block("api", "service")];
  const edges = [
    edgeFromEntry("e1", { source: "web", target: "api", kind: "http" }),
    edgeFromEntry("e2", { source: "api", target: "fantome", kind: "event" }),
  ];
  const [, links] = buildDocSections(nodes, edges);
  assert.equal(links.summary, "2 liens entre composants.");
  assert.deepEqual(links.items, ["web → api · REST / HTTP3", "api → fantome · Kafka / Events"]);
});

test("les tables et les routes viennent du contrat des blocs : les tables d'abord, puis les routes", () => {
  const db = block("db", "database", {
    engine: "postgresql",
    entities: [
      { name: "produit", fields: [{ name: "nom", type: "string" }, { name: "prix", type: "decimal" }] },
      { name: "client", fields: [] },
    ],
  });
  const api = block("api", "service", { endpoints: [{ method: "GET", path: "/produits", summary: "Liste" }, { method: "POST", path: "/produits" }] });
  const [, , contract] = buildDocSections([api, db], []);
  assert.equal(contract.summary, "2 tables et 2 routes déclarées.");
  assert.deepEqual(contract.items, [
    "db : table produit (2 champs)",
    "db : table client (0 champ)",
    "api : GET /produits : Liste",
    "api : POST /produits",
  ]);
});

test("une table ou une route illisible dans le contrat est écartée, pas inventée", () => {
  const db = block("db", "database", { entities: [{ fields: [] }, { name: "ok", fields: [{ name: "x", type: "inconnu" }] }] });
  const api = block("api", "service", { endpoints: [{ method: "FETCH", path: "/x" }, { method: "GET" }] });
  const [, , contract] = buildDocSections([db, api], []);
  assert.deepEqual(contract.items, ["db : table ok (0 champ)"]);
});

test("sur les cinq modèles de départ, les décomptes sont ceux du fichier et rien d'autre ne s'ajoute", () => {
  const dir = fileURLToPath(new URL("../../../docs/exemples/", import.meta.url));
  const files = readdirSync(dir).filter((file) => file.endsWith(".canvas.json"));
  assert.equal(files.length, 5);
  for (const file of files) {
    const canvas = JSON.parse(readFileSync(dir + file, "utf-8"));
    const nodes = canvas.nodes.map((n: { id: string; type: string; position: { x: number; y: number }; data: JsonObject }) =>
      nodeFromEntry(n.id, { type: n.type, position: n.position, data: n.data }),
    );
    const edges = canvas.edges.map((e: { id: string; source: string; target: string; kind?: string; label?: string }) =>
      edgeFromEntry(e.id, { source: e.source, target: e.target, kind: e.kind, label: e.label }),
    );
    const [components, links, contract] = buildDocSections(nodes, edges);
    // Les attendus sont comptés dans le fichier, sans passer par le code testé.
    const entities = canvas.nodes.reduce((sum: number, n: { data: { entities?: unknown[] } }) => sum + (n.data.entities?.length ?? 0), 0);
    const endpoints = canvas.nodes.reduce((sum: number, n: { data: { endpoints?: unknown[] } }) => sum + (n.data.endpoints?.length ?? 0), 0);
    assert.equal(components.items.length, canvas.nodes.length, file);
    assert.equal(links.items.length, canvas.edges.length, file);
    assert.equal(contract.items.length, entities + endpoints, file);
    for (const line of [...components.items, ...links.items, ...contract.items]) {
      assert.ok(!/undefined|\[object|NaN/.test(line), `${file} : ${line}`);
    }
  }
});

test("la liste des fichiers de documentation générés reste celle que le générateur écrit", () => {
  const writers = ["DocsWriter", "OpenApiWriter"]
    .map((name) => readFileSync(fileURLToPath(new URL(`../../../backend/src/main/java/com/lonkoo/backend/generation/${name}.java`, import.meta.url)), "utf-8"))
    .join("\n");
  const written = [...writers.matchAll(/files\.put\("([^"]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(GENERATED_DOC_FILES.map((file) => file.path).sort(), written);
});
