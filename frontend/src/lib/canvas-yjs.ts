/**
 * Lecture et écriture du document Yjs du canvas, selon docs/schema-canvas.md (« Précisions pour le front ») :
 * trois cartes de premier niveau (`nodes`, `edges`, `meta`), une `Y.Map` par entrée dont les valeurs sont du
 * JSON simple remplacé en entier, l'`id` étant la clé de la carte.
 *
 * Le tableau blanc travaille sur des tableaux (`nodes`, `edges`) : `applyNodes` et `applyEdges` comparent le
 * tableau reçu à l'état du document et n'écrivent que ce qui a changé, en une transaction. Deux personnes qui
 * modifient des blocs différents ne se gênent donc pas.
 */
import * as Y from "yjs";
import type { ArchitectureEdge, ArchitectureNode } from "./lonkoo-data";
import {
  asEdgeEntry,
  asNodeEntry,
  canonEdge,
  canonNode,
  edgeFromEntry,
  edgeToEntry,
  nodeFromEntry,
  nodeToEntry,
  stable,
  type EdgeEntry,
  type NodeEntry,
} from "./canvas-model.ts";

/** Origine des transactions locales : permet de ne pas relire le document pour ses propres écritures. */
export const LOCAL_ORIGIN = "lonkoo-local";

export interface Graph {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
}

const plain = (value: unknown): unknown => (value instanceof Y.AbstractType ? value.toJSON() : value);

function nodeEntries(doc: Y.Doc): Map<string, NodeEntry> {
  const entries = new Map<string, NodeEntry>();
  doc.getMap("nodes").forEach((value, id) => {
    const entry = asNodeEntry(plain(value));
    if (entry) entries.set(id, entry);
  });
  return entries;
}

function edgeEntries(doc: Y.Doc): Map<string, EdgeEntry> {
  const entries = new Map<string, EdgeEntry>();
  doc.getMap("edges").forEach((value, id) => {
    const entry = asEdgeEntry(plain(value));
    if (entry) entries.set(id, entry);
  });
  return entries;
}

/**
 * Le graphe du document, triés par `id` (ordre stable d'un client à l'autre). Les blocs et liens inchangés
 * gardent l'objet de `previous` : l'interface ne redessine que ce qui a bougé. Un lien vers un bloc absent est écarté.
 */
export function readGraph(doc: Y.Doc, previous?: Graph): Graph {
  const before = new Map(previous?.nodes.map((node) => [node.id, node]));
  const nodes = [...nodeEntries(doc)]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, entry]) => {
      const node = nodeFromEntry(id, entry);
      const old = before.get(id);
      return old && canonNode(old) === canonNode(node) ? old : node;
    });

  const ids = new Set(nodes.map((node) => node.id));
  const oldEdges = new Map(previous?.edges.map((edge) => [edge.id, edge]));
  const edges = [...edgeEntries(doc)]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, entry]) => ids.has(entry.source) && ids.has(entry.target))
    .map(([id, entry]) => {
      const edge = edgeFromEntry(id, entry);
      const old = oldEdges.get(id);
      return old && canonEdge(old) === canonEdge(edge) ? old : edge;
    });

  return { nodes, edges };
}

/** Écrit dans une entrée existante uniquement les clés qui ont changé ; une valeur qui n'est pas une `Y.Map` est remplacée. */
function writeEntry(map: Y.Map<unknown>, id: string, current: Record<string, unknown>, next: Record<string, unknown>) {
  const existing = map.get(id);
  if (!(existing instanceof Y.Map)) {
    map.set(id, new Y.Map(Object.entries(next)));
    return;
  }
  for (const key of Object.keys(next)) {
    if (stable(current[key]) !== stable(next[key])) existing.set(key, next[key]);
  }
  for (const key of Object.keys(current)) {
    if (!(key in next) && key !== "id") existing.delete(key);
  }
}

/** Remplace l'ensemble des blocs par `next` : ajoute, modifie, supprime (avec les liens qui y menaient). */
export function applyNodes(doc: Y.Doc, next: readonly ArchitectureNode[]) {
  doc.transact(() => {
    const nodes = doc.getMap("nodes");
    const edges = doc.getMap("edges");
    const current = nodeEntries(doc);
    const wanted = new Set(next.map((node) => node.id));

    for (const id of [...nodes.keys()]) {
      if (wanted.has(id)) continue;
      nodes.delete(id);
      current.delete(id);
      // Un lien vers un bloc absent rendrait l'instantané invalide.
      for (const [edgeId, value] of [...edges.entries()]) {
        const edge = asEdgeEntry(plain(value));
        if (edge && (edge.source === id || edge.target === id)) edges.delete(edgeId);
      }
    }

    const names = new Map<string, string>();
    for (const [id, entry] of current) {
      const name = entry.data.name;
      if (typeof name === "string") names.set(id, name);
    }

    for (const node of next) {
      const before = current.get(node.id);
      if (before && canonNode(nodeFromEntry(node.id, before)) === canonNode(node)) continue;
      const used = new Set([...names].filter(([id]) => id !== node.id).map(([, name]) => name));
      const entry = nodeToEntry(node, before, used);
      const name = entry.data.name;
      if (typeof name === "string") names.set(node.id, name);
      if (before) writeEntry(nodes, node.id, before as unknown as Record<string, unknown>, entry as unknown as Record<string, unknown>);
      else nodes.set(node.id, new Y.Map(Object.entries(entry)));
    }
  }, LOCAL_ORIGIN);
}

/** Remplace l'ensemble des liens par `next`, sans jamais créer un lien vers un bloc absent. */
export function applyEdges(doc: Y.Doc, next: readonly ArchitectureEdge[]) {
  doc.transact(() => {
    const nodes = doc.getMap("nodes");
    const edges = doc.getMap("edges");
    const current = edgeEntries(doc);
    const wanted = new Set(next.map((edge) => edge.id));

    for (const id of [...edges.keys()]) {
      if (!wanted.has(id)) edges.delete(id);
    }

    for (const edge of next) {
      if (!nodes.has(edge.from) || !nodes.has(edge.to)) continue;
      const before = current.get(edge.id);
      if (before && canonEdge(edgeFromEntry(edge.id, before)) === canonEdge(edge)) continue;
      const entry = edgeToEntry(edge);
      if (before) writeEntry(edges, edge.id, before as unknown as Record<string, unknown>, entry as unknown as Record<string, unknown>);
      else edges.set(edge.id, new Y.Map(Object.entries(entry)));
    }
  }, LOCAL_ORIGIN);
}
