import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { diffSnapshots } from "./canvas-diff.ts";

const example = JSON.parse(readFileSync(fileURLToPath(new URL("../../../docs/exemples/marketplace-mobile.canvas.json", import.meta.url)), "utf-8"));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const node = (id: string, type: string, data: Record<string, unknown>, x = 0, y = 0) => ({ id, type, position: { x, y }, data });
const edge = (id: string, source: string, target: string, extra: Record<string, unknown> = {}) => ({ id, source, target, ...extra });
const snap = (nodes: unknown[], edges: unknown[] = []) => ({ schemaVersion: 1, nodes, edges });

test("deux instantanés identiques : aucune différence", () => {
  const diff = diffSnapshots(example, clone(example));
  assert.equal(diff.identical, true);
  assert.deepEqual(diff.counts, { added: 0, removed: 0, modified: 0, moved: 0 });
  assert.equal(diff.nodes.length + diff.edges.length, 0);
  assert.equal(diff.graph.nodes.length, example.nodes.length);
});

test("un bloc ajouté, un bloc supprimé, un bloc inchangé", () => {
  const before = snap([node("a", "service", { name: "api", label: "API" }), node("b", "queue", { name: "bus", label: "Bus" })]);
  const after = snap([node("a", "service", { name: "api", label: "API" }), node("c", "auth", { name: "connexion", label: "Connexion", method: "github" })]);
  const diff = diffSnapshots(before, after);

  assert.deepEqual(diff.nodes.map((n) => [n.id, n.kind, n.title]).sort(), [["b", "removed", "Bus"], ["c", "added", "Connexion"]]);
  assert.equal(diff.graph.nodeStatus.get("a"), undefined, "inchangé : pas de couleur");
  assert.equal(diff.graph.nodeStatus.get("b"), "removed");
  assert.equal(diff.graph.nodeStatus.get("c"), "added");
  assert.deepEqual(diff.graph.nodes.map((n) => n.id).sort(), ["a", "b", "c"], "le bloc supprimé reste dessiné");
});

test("un bloc modifié : titre, stack, type, méthode d'authentification", () => {
  const before = snap([node("a", "service", { name: "api", label: "API", tech: "Express" }), node("m", "auth", { name: "connexion", method: "password" })]);
  const after = snap([node("a", "generic", { name: "api", label: "Passerelle", tech: "Kong" }), node("m", "auth", { name: "connexion", method: "github" })]);
  const diff = diffSnapshots(before, after);
  const byId = Object.fromEntries(diff.nodes.map((n) => [n.id, n]));

  assert.equal(byId.a?.kind, "modified");
  assert.ok(byId.a?.details.includes("Type : Service → Bloc libre"));
  assert.ok(byId.a?.details.includes("Titre : « API » → « Passerelle »"));
  assert.ok(byId.a?.details.includes("Stack : « Express » → « Kong »"));
  assert.ok(byId.m?.details.includes("Méthode d'authentification : « password » → « github »"));
});

test("une stack ajoutée ou retirée est dite comme telle", () => {
  const d1 = diffSnapshots(snap([node("a", "service", { name: "api" })]), snap([node("a", "service", { name: "api", tech: "Go" })]));
  assert.deepEqual(d1.nodes[0]?.details, ["Stack ajoutée : « Go »"]);
  const d2 = diffSnapshots(snap([node("a", "service", { name: "api", tech: "Go" })]), snap([node("a", "service", { name: "api" })]));
  assert.deepEqual(d2.nodes[0]?.details, ["Stack retirée (« Go »)"]);
});

test("base de données : table ajoutée, table supprimée, champ ajouté, supprimé, changé", () => {
  const db = (entities: unknown[]) => snap([node("d", "database", { name: "base", engine: "postgresql", entities })]);
  const before = db([
    { name: "produit", fields: [{ name: "nom", type: "string" }, { name: "stock", type: "integer" }, { name: "ancien", type: "string" }] },
    { name: "obsolete", fields: [] },
  ]);
  const after = db([
    { name: "produit", fields: [{ name: "nom", type: "text", required: true, unique: true }, { name: "stock", type: "integer" }, { name: "prix", type: "decimal", required: true }] },
    { name: "client", fields: [{ name: "email", type: "string" }, { name: "age", type: "integer" }] },
  ]);
  const details = diffSnapshots(before, after).nodes[0]?.details ?? [];

  assert.ok(details.includes("Table « client » ajoutée (2 champs)"));
  assert.ok(details.includes("Table « obsolete » supprimée"));
  assert.ok(details.includes("Champ « produit.prix (decimal, obligatoire) » ajouté"));
  assert.ok(details.includes("Champ « produit.ancien » supprimé"));
  assert.ok(details.includes("Champ « produit.nom » : type string → text ; devient obligatoire ; devient unique"));
  assert.ok(!details.some((d) => d.includes("stock")), "un champ inchangé n'apparaît pas");
});

test("service : endpoint ajouté, supprimé, résumé modifié", () => {
  const svc = (endpoints: unknown[]) => snap([node("s", "service", { name: "api", endpoints })]);
  const before = svc([{ method: "GET", path: "/a", summary: "Lire" }, { method: "POST", path: "/b" }]);
  const after = svc([{ method: "GET", path: "/a", summary: "Lister" }, { method: "DELETE", path: "/c" }]);
  const details = diffSnapshots(before, after).nodes[0]?.details ?? [];

  assert.deepEqual([...details].sort(), ["Endpoint DELETE /c ajouté", "Endpoint GET /a : résumé modifié", "Endpoint POST /b supprimé"]);
});

test("application web et file : pages et topics ajoutés ou supprimés", () => {
  const diff = diffSnapshots(
    snap([node("w", "webapp", { name: "site", pages: ["accueil", "panier"] }), node("q", "queue", { name: "bus", topics: ["a"] })]),
    snap([node("w", "webapp", { name: "site", pages: ["accueil", "profil"] }), node("q", "queue", { name: "bus", topics: ["a", "b"] })]),
  );
  const byId = Object.fromEntries(diff.nodes.map((n) => [n.id, n.details]));
  assert.deepEqual([...(byId.w ?? [])].sort(), ["Page « panier » supprimée", "Page « profil » ajoutée"]);
  assert.deepEqual(byId.q, ["Topic « b » ajouté"]);
});

test("un bloc seulement déplacé n'est pas « modifié » : il est compté à part, sans couleur", () => {
  const before = snap([node("a", "service", { name: "api" }, 0, 0), node("b", "service", { name: "b" }, 300, 0)]);
  const after = snap([node("a", "service", { name: "api" }, 40, 0), node("b", "service", { name: "b" }, 300.2, 0)]);
  const diff = diffSnapshots(before, after);

  assert.deepEqual(diff.moved, ["a"], "0,2 d'écart n'est pas un déplacement");
  assert.equal(diff.nodes.length, 0);
  assert.deepEqual(diff.counts, { added: 0, removed: 0, modified: 0, moved: 1 });
  assert.equal(diff.identical, false);
  assert.equal(diff.graph.nodeStatus.size, 0);
});

test("liens : ajouté, supprimé, modifié, avec le titre des blocs", () => {
  const nodes = [node("a", "service", { name: "api", label: "API" }), node("b", "database", { name: "base", label: "Base" }), node("c", "queue", { name: "bus", label: "Bus" })];
  const before = snap(nodes, [edge("e1", "a", "b", { kind: "data" }), edge("e2", "a", "c"), edge("e3", "b", "c", { label: "x" })]);
  const after = snap(nodes, [edge("e1", "a", "b", { kind: "http" }), edge("e3", "b", "c", { label: "x" }), edge("e4", "c", "a")]);
  const diff = diffSnapshots(before, after);
  const byId = Object.fromEntries(diff.edges.map((e) => [e.id, e]));

  assert.equal(byId.e1?.kind, "modified");
  assert.deepEqual(byId.e1?.details, ["Nature : data → http"]);
  assert.equal(byId.e2?.kind, "removed");
  assert.deepEqual([byId.e2?.from, byId.e2?.to], ["API", "Bus"]);
  assert.equal(byId.e4?.kind, "added");
  assert.equal(byId.e3, undefined, "un lien inchangé n'apparaît pas");
  assert.equal(diff.graph.edgeStatus.get("e2"), "removed");
  assert.equal(diff.graph.edges.length, 4, "les liens des deux versions sont dessinés");
});

test("un lien supprimé avec son bloc reste dessiné ; un lien vers un bloc inconnu est écarté", () => {
  const before = snap([node("a", "service", { name: "api" }), node("b", "service", { name: "b" })], [edge("e", "a", "b")]);
  const after = snap([node("a", "service", { name: "api" })], []);
  const diff = diffSnapshots(before, after);
  assert.equal(diff.graph.edges.length, 1);
  assert.equal(diff.counts.removed, 2, "un bloc et un lien");

  const broken = diffSnapshots(snap([]), snap([node("a", "service", { name: "api" })], [edge("e", "a", "fantome")]));
  assert.equal(broken.graph.edges.length, 0);
});

test("des instantanés absents, vides ou mal formés ne font pas planter la comparaison", () => {
  for (const [a, b] of [[null, null], [undefined, example], [{}, {}], [{ nodes: "x", edges: 3 }, example], [snap([null, 5, { id: 1 }, { id: "z" }]), snap([])]] as const) {
    const diff = diffSnapshots(a as never, b as never);
    assert.ok(Array.isArray(diff.nodes) && Array.isArray(diff.edges) && typeof diff.identical === "boolean");
  }
  assert.equal(diffSnapshots(null, example).counts.added, example.nodes.length + example.edges.length);
  assert.equal(diffSnapshots(example, null).counts.removed, example.nodes.length + example.edges.length);
});

test("cas réaliste : le modèle d'exemple, modifié comme le fait l'éditeur", () => {
  const edited = clone(example);
  const base = edited.nodes.find((n: { type: string }) => n.type === "database");
  base.data.entities.push({ name: "client", fields: [{ name: "email", type: "string", required: true }] });
  const api = edited.nodes.find((n: { type: string }) => n.type === "service");
  api.data.endpoints.push({ method: "POST", path: "/clients", summary: "Créer un client" });
  edited.nodes.push(node("n9", "generic", { name: "passerelle", label: "Passerelle" }, 700, 0));
  edited.nodes = edited.nodes.filter((n: { type: string }) => n.type !== "billing");
  edited.edges = edited.edges.filter((e: { source: string; target: string }) => edited.nodes.some((n: { id: string }) => n.id === e.source) && edited.nodes.some((n: { id: string }) => n.id === e.target));

  const diff = diffSnapshots(example, edited);
  assert.deepEqual(diff.counts.added, 1);
  assert.ok(diff.counts.removed >= 1, "le bloc de facturation (et ses liens)");
  assert.equal(diff.counts.modified, 2, "la base et le service");
  assert.ok(diff.nodes.find((n) => n.type === "database")?.details.includes("Table « client » ajoutée (1 champ)"));
  assert.ok(diff.nodes.find((n) => n.type === "service")?.details.includes("Endpoint POST /clients ajouté"));
});
