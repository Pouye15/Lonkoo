/**
 * Comparaison de deux instantanés du contrat (cahier des charges, « comparateur visuel des modifications » :
 * blocs ajoutés en vert, supprimés en rouge, modifiés en orange). Module pur, testé avec le lanceur de Node.
 *
 * Un bloc simplement déplacé n'est pas « modifié » : il n'a pas changé de nature, et colorer tous les blocs
 * qu'on a poussés d'un cran noierait les vrais changements. Il est compté à part.
 */
import type { ArchitectureEdge, ArchitectureNode } from "./lonkoo-data";
import { entitiesOf, endpointsOf, listOf, type Entity, type Field } from "./canvas-contract.ts";
import { asEdgeEntry, asNodeEntry, edgeFromEntry, nodeFromEntry, type EdgeEntry, type NodeEntry } from "./canvas-model.ts";
import type { ChangeStatus } from "./canvas-export.ts";

export type ChangeKind = ChangeStatus;

export interface NodeChange {
  id: string;
  kind: ChangeKind;
  title: string;
  /** Type du contrat après le changement (avant, pour un bloc supprimé). */
  type: string;
  /** Ce qui a changé, une phrase par changement (vide pour un bloc ajouté ou supprimé). */
  details: string[];
}

export interface EdgeChange {
  id: string;
  kind: ChangeKind;
  from: string;
  to: string;
  details: string[];
}

export interface SnapshotDiff {
  nodes: NodeChange[];
  edges: EdgeChange[];
  /** Blocs déplacés sans autre changement (identifiants). */
  moved: string[];
  counts: { added: number; removed: number; modified: number; moved: number };
  /** Aucun changement de contenu, ni de position. */
  identical: boolean;
  /** Le graphe à dessiner : les blocs des deux versions, avec la couleur de chacun. */
  graph: {
    nodes: ArchitectureNode[];
    edges: ArchitectureEdge[];
    nodeStatus: Map<string, ChangeKind>;
    edgeStatus: Map<string, ChangeKind>;
  };
}

type SnapshotInput = { nodes?: unknown; edges?: unknown } | null | undefined;

function entriesOf<T>(list: unknown, read: (value: unknown) => T | null): Map<string, T> {
  const map = new Map<string, T>();
  if (!Array.isArray(list)) return map;
  for (const item of list) {
    const id = item && typeof item === "object" ? (item as { id?: unknown }).id : undefined;
    if (typeof id !== "string") continue;
    const entry = read(item);
    if (entry) map.set(id, entry);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Détail des changements d'un bloc                                     */
/* ------------------------------------------------------------------ */

const TYPE_LABEL: Record<string, string> = {
  webapp: "Application web",
  service: "Service",
  database: "Base de données",
  auth: "Authentification",
  queue: "File de messages",
  "mobile-payment": "Paiement mobile",
  messaging: "Messagerie",
  billing: "Facturation",
  generic: "Bloc libre",
};

const SCALAR_LABEL: Record<string, string> = {
  method: "Méthode d'authentification",
  channel: "Canal",
  currency: "Devise",
  flow: "Sens du flux",
  model: "Modèle de facturation",
  engine: "Moteur",
};

/** Clés de `data` décrites par un traitement propre (ou qui ne sont pas du contenu à comparer ici). */
const STRUCTURED = new Set(["name", "label", "tech", "entities", "endpoints", "pages", "topics", "templates"]);

const show = (value: unknown) => (typeof value === "string" ? `« ${value} »` : JSON.stringify(value ?? null));
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

function describeField(table: string, field: Field): string {
  const flags = [field.required ? "obligatoire" : "", field.unique ? "unique" : ""].filter(Boolean).join(", ");
  return `${table}.${field.name} (${field.type}${flags ? ", " + flags : ""})`;
}

function describeFields(table: string, before: Field[], after: Field[]): string[] {
  const out: string[] = [];
  const old = new Map(before.map((f) => [f.name, f]));
  const next = new Map(after.map((f) => [f.name, f]));
  for (const field of after) if (!old.has(field.name)) out.push(`Champ « ${describeField(table, field)} » ajouté`);
  for (const field of before) if (!next.has(field.name)) out.push(`Champ « ${table}.${field.name} » supprimé`);
  for (const field of after) {
    const was = old.get(field.name);
    if (!was) continue;
    const changes: string[] = [];
    if (was.type !== field.type) changes.push(`type ${was.type} → ${field.type}`);
    if (Boolean(was.required) !== Boolean(field.required)) changes.push(field.required ? "devient obligatoire" : "n'est plus obligatoire");
    if (Boolean(was.unique) !== Boolean(field.unique)) changes.push(field.unique ? "devient unique" : "n'est plus unique");
    if (changes.length) out.push(`Champ « ${table}.${field.name} » : ${changes.join(" ; ")}`);
  }
  return out;
}

function describeEntities(before: Entity[], after: Entity[]): string[] {
  const out: string[] = [];
  const old = new Map(before.map((e) => [e.name, e]));
  const next = new Map(after.map((e) => [e.name, e]));
  for (const entity of after) {
    const was = old.get(entity.name);
    if (!was) out.push(`Table « ${entity.name} » ajoutée (${plural(entity.fields.length, "champ", "champs")})`);
    else out.push(...describeFields(entity.name, was.fields, entity.fields));
  }
  for (const entity of before) if (!next.has(entity.name)) out.push(`Table « ${entity.name} » supprimée`);
  return out;
}

function describeLists(noun: string, before: string[], after: string[], feminine = true): string[] {
  const added = after.filter((item) => !before.includes(item));
  const removed = before.filter((item) => !after.includes(item));
  const ending = feminine ? "e" : "";
  return [
    ...added.map((item) => `${noun} « ${item} » ajouté${ending}`),
    ...removed.map((item) => `${noun} « ${item} » supprimé${ending}`),
  ];
}

function describeEndpoints(before: ReturnType<typeof endpointsOf>, after: ReturnType<typeof endpointsOf>): string[] {
  const key = (e: { method: string; path: string }) => `${e.method} ${e.path}`;
  const old = new Map(before.map((e) => [key(e), e]));
  const next = new Map(after.map((e) => [key(e), e]));
  const out: string[] = [];
  for (const endpoint of after) {
    const was = old.get(key(endpoint));
    if (!was) out.push(`Endpoint ${key(endpoint)} ajouté`);
    else if ((was.summary ?? "") !== (endpoint.summary ?? "")) out.push(`Endpoint ${key(endpoint)} : résumé modifié`);
  }
  for (const endpoint of before) if (!next.has(key(endpoint))) out.push(`Endpoint ${key(endpoint)} supprimé`);
  return out;
}

function templatesOf(data: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  if (Array.isArray(data.templates)) {
    for (const item of data.templates) {
      const t = item as { name?: unknown; text?: unknown };
      if (typeof t?.name === "string") map.set(t.name, typeof t.text === "string" ? t.text : "");
    }
  }
  return map;
}

function describeNode(before: NodeEntry, after: NodeEntry): string[] {
  const out: string[] = [];
  const b = before.data;
  const a = after.data;
  if (before.type !== after.type) out.push(`Type : ${TYPE_LABEL[before.type] ?? before.type} → ${TYPE_LABEL[after.type] ?? after.type}`);
  if (b.name !== a.name) out.push(`Identifiant : ${show(b.name)} → ${show(a.name)}`);
  if (b.label !== a.label) out.push(`Titre : ${show(b.label ?? b.name)} → ${show(a.label ?? a.name)}`);
  if ((b.tech ?? "") !== (a.tech ?? "")) {
    out.push(!b.tech ? `Stack ajoutée : ${show(a.tech)}` : !a.tech ? `Stack retirée (${show(b.tech)})` : `Stack : ${show(b.tech)} → ${show(a.tech)}`);
  }
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (STRUCTURED.has(key) || JSON.stringify(b[key]) === JSON.stringify(a[key])) continue;
    out.push(`${SCALAR_LABEL[key] ?? key} : ${show(b[key])} → ${show(a[key])}`);
  }
  out.push(...describeEntities(entitiesOf(b), entitiesOf(a)));
  out.push(...describeEndpoints(endpointsOf(b), endpointsOf(a)));
  out.push(...describeLists("Page", listOf(b, "pages"), listOf(a, "pages")));
  out.push(...describeLists("Topic", listOf(b, "topics"), listOf(a, "topics"), false));
  const oldTemplates = templatesOf(b);
  const newTemplates = templatesOf(a);
  out.push(...describeLists("Gabarit", [...oldTemplates.keys()], [...newTemplates.keys()], false));
  for (const [name, text] of newTemplates) if (oldTemplates.has(name) && oldTemplates.get(name) !== text) out.push(`Gabarit « ${name} » : texte modifié`);
  return out;
}

function describeEdge(before: EdgeEntry, after: EdgeEntry): string[] {
  const out: string[] = [];
  if (before.source !== after.source) out.push(`Source : ${show(before.source)} → ${show(after.source)}`);
  if (before.target !== after.target) out.push(`Cible : ${show(before.target)} → ${show(after.target)}`);
  if ((before.kind ?? "http") !== (after.kind ?? "http")) out.push(`Nature : ${before.kind ?? "http"} → ${after.kind ?? "http"}`);
  if ((before.label ?? "") !== (after.label ?? "")) out.push(`Libellé : ${show(before.label ?? "")} → ${show(after.label ?? "")}`);
  return out;
}

/* ------------------------------------------------------------------ */
/* Comparaison                                                          */
/* ------------------------------------------------------------------ */

const titleOf = (entry: NodeEntry, id: string) => {
  const label = entry.data.label;
  const name = entry.data.name;
  return typeof label === "string" && label ? label : typeof name === "string" && name ? name : id;
};

const moved = (a: NodeEntry, b: NodeEntry) => Math.abs(a.position.x - b.position.x) > 0.5 || Math.abs(a.position.y - b.position.y) > 0.5;

/** Les différences entre `before` et `after` (deux instantanés du contrat, tels que les rend l'API). */
export function diffSnapshots(before: SnapshotInput, after: SnapshotInput): SnapshotDiff {
  const oldNodes = entriesOf(before?.nodes, asNodeEntry);
  const newNodes = entriesOf(after?.nodes, asNodeEntry);
  const oldEdges = entriesOf(before?.edges, asEdgeEntry);
  const newEdges = entriesOf(after?.edges, asEdgeEntry);

  const nodes: NodeChange[] = [];
  const movedIds: string[] = [];
  const nodeStatus = new Map<string, ChangeKind>();

  for (const [id, entry] of newNodes) {
    const was = oldNodes.get(id);
    if (!was) {
      nodes.push({ id, kind: "added", title: titleOf(entry, id), type: entry.type, details: [] });
      nodeStatus.set(id, "added");
      continue;
    }
    const details = describeNode(was, entry);
    if (details.length > 0) {
      nodes.push({ id, kind: "modified", title: titleOf(entry, id), type: entry.type, details });
      nodeStatus.set(id, "modified");
    } else if (moved(was, entry)) {
      movedIds.push(id);
    }
  }
  for (const [id, entry] of oldNodes) {
    if (newNodes.has(id)) continue;
    nodes.push({ id, kind: "removed", title: titleOf(entry, id), type: entry.type, details: [] });
    nodeStatus.set(id, "removed");
  }

  const titles = new Map<string, string>([...oldNodes, ...newNodes].map(([id, entry]) => [id, titleOf(entry, id)]));
  const edges: EdgeChange[] = [];
  const edgeStatus = new Map<string, ChangeKind>();
  for (const [id, entry] of newEdges) {
    const was = oldEdges.get(id);
    const base = { id, from: titles.get(entry.source) ?? entry.source, to: titles.get(entry.target) ?? entry.target };
    if (!was) {
      edges.push({ ...base, kind: "added", details: [] });
      edgeStatus.set(id, "added");
      continue;
    }
    const details = describeEdge(was, entry);
    if (details.length > 0) {
      edges.push({ ...base, kind: "modified", details });
      edgeStatus.set(id, "modified");
    }
  }
  for (const [id, entry] of oldEdges) {
    if (newEdges.has(id)) continue;
    edges.push({ id, kind: "removed", from: titles.get(entry.source) ?? entry.source, to: titles.get(entry.target) ?? entry.target, details: [] });
    edgeStatus.set(id, "removed");
  }

  // Le graphe à dessiner : les blocs de la nouvelle version, plus ceux qui ont disparu (à leur ancienne place).
  const graphNodes: ArchitectureNode[] = [];
  for (const [id, entry] of newNodes) graphNodes.push(nodeFromEntry(id, entry));
  for (const [id, entry] of oldNodes) if (!newNodes.has(id)) graphNodes.push(nodeFromEntry(id, entry));
  const known = new Set(graphNodes.map((n) => n.id));
  const graphEdges: ArchitectureEdge[] = [];
  for (const [id, entry] of newEdges) graphEdges.push(edgeFromEntry(id, entry));
  for (const [id, entry] of oldEdges) if (!newEdges.has(id)) graphEdges.push(edgeFromEntry(id, entry));

  const count = (kind: ChangeKind) => nodes.filter((n) => n.kind === kind).length + edges.filter((e) => e.kind === kind).length;
  const counts = { added: count("added"), removed: count("removed"), modified: count("modified"), moved: movedIds.length };
  return {
    nodes,
    edges,
    moved: movedIds,
    counts,
    identical: counts.added + counts.removed + counts.modified + counts.moved === 0,
    graph: { nodes: graphNodes, edges: graphEdges.filter((e) => known.has(e.from) && known.has(e.to)), nodeStatus, edgeStatus },
  };
}
