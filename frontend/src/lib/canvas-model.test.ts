import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import * as Y from "yjs";
import type { ArchitectureEdge, ArchitectureNode } from "./lonkoo-data";
import { STENCIL_ITEMS } from "../components/studio/whiteboard/stencils.ts";
import { applyEdges, applyNodes, readGraph, type Graph } from "./canvas-yjs.ts";
import {
  canonNode,
  identOf,
  nodeFromEntry,
  uniqueIdent,
  type NodeEntry,
} from "./canvas-model.ts";

const docs = (name: string) => fileURLToPath(new URL(`../../../docs/${name}`, import.meta.url));
const schema = JSON.parse(readFileSync(docs("canvas.schema.json"), "utf-8"));
const example = JSON.parse(readFileSync(docs("exemples/marketplace-mobile.canvas.json"), "utf-8"));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

/** Un bloc tel que le tableau blanc le crée quand on le dépose depuis la boîte à outils. */
function blank(shape: ArchitectureNode["shape"], id: string, title: string): ArchitectureNode {
  const item = STENCIL_ITEMS.find((s) => s.shape === shape);
  assert.ok(item, `forme ${shape} absente de la boîte à outils`);
  return {
    id,
    title,
    tech: "",
    version: "",
    shape,
    moduleGroup: item.group,
    description: "Composant logique d'architecture.",
    status: "Actif",
    metricLabel: "Capacité",
    metricValue: "Standard",
    baseLatencyMs: 3,
    maxRpsCapacity: 10000,
    replicas: 1,
    port: 0,
    role: item.role,
    x: 40,
    y: 80,
    envVars: [],
    dependencies: [],
  };
}

/** L'instantané que le serveur temps réel tirerait du document : contrat seul, sans la clé `ui`. */
function snapshotOf(doc: Y.Doc) {
  const nodes = Object.entries(doc.getMap("nodes").toJSON() as Record<string, NodeEntry>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, { type, position, data }]) => ({ id, type, position, data }));
  const edges = Object.entries(doc.getMap("edges").toJSON() as Record<string, Record<string, unknown>>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, { source, target, kind, label }]) => ({ id, source, target, kind, label }));
  return { schemaVersion: 1, nodes, edges };
}

function assertValid(snapshot: unknown) {
  assert.ok(validate(snapshot), JSON.stringify(validate.errors, null, 1));
}

function docFrom(example: unknown): Y.Doc {
  const doc = new Y.Doc();
  const { nodes, edges } = example as { nodes: (NodeEntry & { id: string })[]; edges: Record<string, unknown>[] };
  for (const { id, ...entry } of nodes) doc.getMap("nodes").set(id, new Y.Map(Object.entries(entry)));
  for (const { id, ...edge } of edges) doc.getMap("edges").set(id as string, new Y.Map(Object.entries(edge)));
  return doc;
}

// ------------------------------------------------------------------ Identifiants techniques

test("l'identifiant technique se déduit du titre : minuscules, sans accent, _ entre les mots", () => {
  assert.equal(identOf("Passerelle API"), "passerelle_api");
  assert.equal(identOf("Base de données"), "base_de_donnees");
  assert.equal(identOf("Éléphant d'Afrique"), "elephant_d_afrique");
  assert.equal(identOf("1er bloc"), "b_1er_bloc");
  assert.equal(identOf("!!!"), "bloc");
  assert.equal(identOf("a".repeat(60)).length, 31);
});

test("un mot réservé Java, SQL ou YAML ne devient jamais un identifiant, un doublon reçoit un suffixe", () => {
  assert.equal(uniqueIdent("Database", new Set()), "database_bloc");
  assert.equal(uniqueIdent("User", new Set()), "user_bloc");
  assert.equal(uniqueIdent("Class", new Set()), "class_bloc");
  assert.equal(uniqueIdent("Service", new Set(["service"])), "service_2");
  assert.equal(uniqueIdent("Service", new Set(["service", "service_2"])), "service_3");
  const long = "x".repeat(40);
  const used = new Set([identOf(long)]);
  const next = uniqueIdent(long, used);
  assert.ok(next.length <= 31 && !used.has(next) && /^[a-z][a-z0-9_]{0,30}$/.test(next), next);
});

// ------------------------------------------------------------------ Contrat

test("chaque forme de la boîte à outils donne un bloc valide pour le schéma du contrat", () => {
  const nodes = STENCIL_ITEMS.map((item, i) => blank(item.shape, `n${i}`, `${item.label} 1`));
  const doc = new Y.Doc();
  applyNodes(doc, nodes);

  const snapshot = snapshotOf(doc);
  assert.equal(snapshot.nodes.length, STENCIL_ITEMS.length);
  assertValid(snapshot);
});

test("les formes sans équivalent exact deviennent des blocs « generic », avec la forme gardée dans ui", () => {
  const doc = new Y.Doc();
  applyNodes(doc, [blank("gateway", "g", "Passerelle"), blank("cache", "c", "Cache"), blank("ai", "a", "Module IA"), blank("user", "u", "Client")]);

  const entries = doc.getMap("nodes").toJSON() as Record<string, NodeEntry>;
  for (const [id, shape] of [["g", "gateway"], ["c", "cache"], ["a", "ai"], ["u", "user"]] as const) {
    assert.equal(entries[id]?.type, "generic", id);
    assert.equal(entries[id]?.ui?.shape, shape, id);
  }
  assert.deepEqual(
    readGraph(doc).nodes.map((n) => n.shape),
    ["ai", "cache", "gateway", "user"],
    "la forme dessinée revient telle quelle",
  );
});

test("la stack va dans data.tech et disparaît quand elle est vidée ; le titre va dans data.label", () => {
  const doc = new Y.Doc();
  const node = { ...blank("service", "s1", "API commandes"), tech: "Spring Boot" };
  applyNodes(doc, [node]);
  let data = (doc.getMap("nodes").toJSON() as Record<string, NodeEntry>).s1?.data;
  assert.equal(data?.label, "API commandes");
  assert.equal(data?.tech, "Spring Boot");
  assert.equal(data?.name, "api_commandes");

  applyNodes(doc, [{ ...node, tech: "" }]);
  data = (doc.getMap("nodes").toJSON() as Record<string, NodeEntry>).s1?.data;
  assert.ok(!("tech" in (data ?? {})), "pas de stack imposée");
});

test("l'identifiant reste le même quand le titre change, et deux blocs de même titre ont deux identifiants", () => {
  const doc = new Y.Doc();
  applyNodes(doc, [blank("service", "a", "Service"), blank("service", "b", "Service")]);
  const names = () =>
    Object.fromEntries(Object.entries(doc.getMap("nodes").toJSON() as Record<string, NodeEntry>).map(([id, e]) => [id, e.data.name]));
  assert.deepEqual(names(), { a: "service", b: "service_2" });

  applyNodes(doc, [{ ...blank("service", "a", "Renommé"), title: "Renommé" }, blank("service", "b", "Service")]);
  assert.deepEqual(names(), { a: "service", b: "service_2" });
  assert.equal(readGraph(doc).nodes.find((n) => n.id === "a")?.title, "Renommé");
});

test("changer de forme change le type du contrat sans perdre l'identifiant", () => {
  const doc = new Y.Doc();
  applyNodes(doc, [blank("service", "x", "Stock")]);
  applyNodes(doc, [{ ...blank("cylinder", "x", "Stock"), shape: "cylinder" }]);

  const entry = (doc.getMap("nodes").toJSON() as Record<string, NodeEntry>).x;
  assert.equal(entry?.type, "database");
  assert.equal(entry?.data.name, "stock");
  assert.equal(entry?.data.engine, "postgresql");
  assertValid(snapshotOf(doc));
});

// ------------------------------------------------------------------ Lecture et écriture

test("le modèle d'exemple s'ouvre dans le tableau blanc, et l'ouvrir sans le modifier n'écrit rien", () => {
  const doc = docFrom(example);
  const graph = readGraph(doc);
  assert.equal(graph.nodes.length, example.nodes.length);
  assert.equal(graph.edges.length, example.edges.length);
  for (const node of graph.nodes) assert.ok(node.title.length > 0 && node.shape, node.id);

  const before = JSON.stringify(doc.getMap("nodes").toJSON()) + JSON.stringify(doc.getMap("edges").toJSON());
  let updates = 0;
  doc.on("update", () => updates++);
  applyNodes(doc, graph.nodes);
  applyEdges(doc, graph.edges);

  assert.equal(updates, 0, "aucune écriture");
  assert.equal(JSON.stringify(doc.getMap("nodes").toJSON()) + JSON.stringify(doc.getMap("edges").toJSON()), before);
});

test("modifier un bloc du modèle d'exemple garde ses champs du contrat (entités, pages, endpoints)", () => {
  const doc = docFrom(example);
  const graph = readGraph(doc);
  const base = graph.nodes.find((n) => n.id === "n4");
  assert.ok(base);
  applyNodes(doc, graph.nodes.map((n) => (n.id === "n4" ? { ...n, title: "Base clients", x: n.x + 100 } : n)));

  const data = (doc.getMap("nodes").toJSON() as Record<string, NodeEntry>).n4?.data as Record<string, unknown>;
  assert.equal(data.label, "Base clients");
  assert.equal(data.name, "marketplace_db", "identifiant inchangé");
  assert.equal((data.entities as unknown[]).length, 2, "les entités survivent");
  assertValid(snapshotOf(doc));
});

test("aller-retour : ce que le tableau écrit, il le relit à l'identique", () => {
  const nodes = STENCIL_ITEMS.map((item, i) => ({ ...blank(item.shape, `n${i}`, `${item.label} ${i}`), tech: i % 2 ? "Redis 7" : "", x: i * 10, y: -i * 5 }));
  const doc = new Y.Doc();
  applyNodes(doc, nodes);

  const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(readGraph(doc).nodes.map(canonNode), sorted.map(canonNode));
});

test("supprimer un bloc supprime ses liens ; un lien vers un bloc absent n'est jamais écrit", () => {
  const doc = new Y.Doc();
  const nodes = [blank("service", "a", "A"), blank("cylinder", "b", "B"), blank("queue", "c", "C")];
  const edges: ArchitectureEdge[] = [
    { id: "e1", from: "a", to: "b", protocol: "TCP / TLS", throughput: "" },
    { id: "e2", from: "a", to: "c", protocol: "Kafka / Events", throughput: "2k/s" },
    { id: "e3", from: "c", to: "zzz", protocol: "gRPC", throughput: "" },
  ];
  applyNodes(doc, nodes);
  applyEdges(doc, edges);
  assert.deepEqual([...doc.getMap("edges").keys()].sort(), ["e1", "e2"], "e3 mène à un bloc absent");

  applyNodes(doc, nodes.filter((n) => n.id !== "b"));
  assert.deepEqual([...doc.getMap("edges").keys()], ["e2"]);
  assertValid(snapshotOf(doc));
});

test("le protocole d'un lien devient son type et son libellé dans le contrat, et se relit", () => {
  const doc = new Y.Doc();
  applyNodes(doc, [blank("service", "a", "A"), blank("queue", "b", "B")]);
  applyEdges(doc, [{ id: "e", from: "a", to: "b", protocol: "Redis PubSub", throughput: "800/s" }]);

  const entry = doc.getMap("edges").toJSON().e as Record<string, unknown>;
  assert.equal(entry.kind, "event");
  assert.equal(entry.label, "Redis PubSub");
  assert.deepEqual(readGraph(doc).edges, [{ id: "e", from: "a", to: "b", protocol: "Redis PubSub", throughput: "800/s" }]);
});

test("readGraph réutilise les objets inchangés, pour que l'interface ne redessine que ce qui a bougé", () => {
  const doc = new Y.Doc();
  applyNodes(doc, [blank("service", "a", "A"), blank("service", "b", "B")]);
  const first = readGraph(doc);
  applyNodes(doc, first.nodes.map((n) => (n.id === "b" ? { ...n, x: 500 } : n)));
  const second = readGraph(doc, first);

  assert.equal(second.nodes[0], first.nodes[0], "A inchangé : même objet");
  assert.notEqual(second.nodes[1], first.nodes[1]);
  assert.equal(second.nodes[1]?.x, 500);
});

test("une entrée mal formée ou d'un type inconnu, écrite par un autre client, ne casse pas le tableau", () => {
  const doc = new Y.Doc();
  doc.getMap("nodes").set("ok", new Y.Map(Object.entries({ type: "service", position: { x: 1, y: 2 }, data: { name: "ok" } })));
  doc.getMap("nodes").set("inconnu", new Y.Map(Object.entries({ type: "hologramme", position: { x: 3, y: 4 }, data: { name: "holo" } })));
  doc.getMap("nodes").set("cassé", new Y.Map(Object.entries({ type: "service" })));
  doc.getMap("nodes").set("texte", "pas une entrée");
  doc.getMap("edges").set("orphelin", new Y.Map(Object.entries({ source: "ok", target: "absent" })));

  const graph = readGraph(doc);
  assert.deepEqual(graph.nodes.map((n) => [n.id, n.shape]), [["inconnu", "generic"], ["ok", "service"]]);
  assert.deepEqual(graph.edges, []);
});

test("une forme dessinée incompatible avec le type du contrat est ignorée", () => {
  const node = nodeFromEntry("x", { type: "database", position: { x: 0, y: 0 }, data: { name: "base" }, ui: { shape: "gateway" } });
  assert.equal(node.shape, "cylinder");
});

test("deux personnes qui modifient des blocs différents se fusionnent sans perte", () => {
  const a = new Y.Doc();
  applyNodes(a, [blank("service", "n1", "Un"), blank("service", "n2", "Deux")]);
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

  applyNodes(a, readGraph(a).nodes.map((n) => (n.id === "n1" ? { ...n, x: 300 } : n)));
  applyNodes(b, readGraph(b).nodes.map((n) => (n.id === "n2" ? { ...n, title: "Deux bis", tech: "Go" } : n)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

  const merged = (doc: Y.Doc): Graph => readGraph(doc);
  assert.deepEqual(merged(a).nodes.map(canonNode), merged(b).nodes.map(canonNode));
  const [n1, n2] = merged(a).nodes;
  assert.equal(n1?.x, 300);
  assert.equal(n2?.title, "Deux bis");
  assert.equal(n2?.tech, "Go");
});

test("les écritures locales portent l'origine « lonkoo-local » (le tableau ne relit pas ses propres écritures)", () => {
  const doc = new Y.Doc();
  const origins: unknown[] = [];
  doc.on("update", (_update: Uint8Array, origin: unknown) => origins.push(origin));
  applyNodes(doc, [blank("service", "a", "A")]);

  assert.deepEqual(origins, ["lonkoo-local"]);
});
