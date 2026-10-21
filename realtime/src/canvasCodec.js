/**
 * Conversion entre le JSON du contrat (seed, instantané) et le document Yjs.
 *
 * Représentation Yjs : celle de `docs/schema-canvas.md` (« Correspondance avec Yjs »).
 * Trois cartes de premier niveau :
 *   - `nodes` : Y.Map indexée par l'identifiant du bloc  -> Y.Map { type, position, data }
 *   - `edges` : Y.Map indexée par l'identifiant du lien  -> Y.Map { source, target, kind?, label? }
 *   - `meta`  : Y.Map { name?, description? }
 *
 * Les valeurs d'une entrée (`position`, `data`…) sont du JSON simple : on les remplace en entier
 * plutôt que de les modifier en place. L'identifiant est la clé de la carte, jamais un champ de
 * l'entrée. `schemaVersion` n'est pas stocké dans Yjs : l'instantané porte la version courante.
 *
 * Clé facultative `ui` d'une entrée (bloc ou lien) : données de présentation et de simulation propres
 * au front (forme, réplicas, débit…). Elle est partagée entre les utilisateurs mais **jamais** reprise
 * dans l'instantané, que le contrat valide champ par champ ; une restauration la conserve pour les
 * identifiants qui survivent.
 *
 * Des cartes (et non des tableaux) pour que deux personnes qui modifient des blocs différents ne
 * se gênent pas : c'est la raison donnée par le contrat.
 */
import * as Y from 'yjs';

const NODES = 'nodes';
const EDGES = 'edges';
const META = 'meta';
/** Ancienne disposition (tableaux dans une carte « canvas »), lue seulement pour migrer. */
const LEGACY_ROOT = 'canvas';

/** Clé d'entrée réservée au front : absente de l'instantané. */
const UI_KEY = 'ui';

/** Version du contrat produite par ce serveur. */
export const SCHEMA_VERSION = 1;

/** Erreur de données reçues : le serveur répond 400. */
export class InvalidSnapshotError extends Error {}

/** Convertit une valeur Yjs (ou un JSON simple) en JSON simple. */
export function yjsToJson(value) {
  return value instanceof Y.AbstractType ? value.toJSON() : value;
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Lit une carte indexée par identifiant et la rend sous forme de tableau trié par `id`
 * (ordre stable d'un appel à l'autre, quel que soit l'ordre d'arrivée des modifications).
 * Une entrée illisible donne un objet réduit à son `id` : la validation du backend la refusera.
 */
function readCollection(map) {
  const items = [];
  map.forEach((value, id) => {
    const plain = yjsToJson(value);
    const { id: _ignored, [UI_KEY]: _ui, ...fields } = isPlainObject(plain) ? plain : {};
    items.push({ id, ...fields });
  });
  return items.sort(byId);
}

function writeCollection(map, items) {
  for (const { id, ...fields } of items) {
    const entry = new Y.Map();
    for (const [key, value] of Object.entries(fields)) {
      entry.set(key, value);
    }
    map.set(id, entry);
  }
}

/** Valeurs `ui` des entrées actuelles, par identifiant. */
function collectUi(map) {
  const ui = new Map();
  map.forEach((value, id) => {
    const plain = yjsToJson(value);
    if (isPlainObject(plain) && plain[UI_KEY] !== undefined) ui.set(id, plain[UI_KEY]);
  });
  return ui;
}

/** Remet la clé `ui` sur les entrées qui existent encore après une réécriture. */
function restoreUi(map, ui) {
  ui.forEach((value, id) => {
    const entry = map.get(id);
    if (entry instanceof Y.Map) entry.set(UI_KEY, value);
  });
}

function writeSnapshot(doc, snapshot) {
  const nodes = doc.getMap(NODES);
  const edges = doc.getMap(EDGES);
  const meta = doc.getMap(META);
  const nodesUi = collectUi(nodes);
  const edgesUi = collectUi(edges);
  nodes.clear();
  edges.clear();
  meta.clear();
  writeCollection(nodes, snapshot.nodes ?? []);
  writeCollection(edges, snapshot.edges ?? []);
  restoreUi(nodes, nodesUi);
  restoreUi(edges, edgesUi);
  for (const [key, value] of Object.entries(snapshot.meta ?? {})) {
    meta.set(key, value);
  }
}

function assertCollection(name, items) {
  if (!Array.isArray(items)) {
    throw new InvalidSnapshotError(`« ${name} » doit être un tableau`);
  }
  const seen = new Set();
  for (const item of items) {
    if (!isPlainObject(item) || typeof item.id !== 'string' || item.id === '') {
      throw new InvalidSnapshotError(`« ${name} » : chaque entrée doit être un objet avec un « id » texte`);
    }
    if (seen.has(item.id)) {
      throw new InvalidSnapshotError(`« ${name} » : identifiant dupliqué « ${item.id} »`);
    }
    seen.add(item.id);
  }
}

/** Vérifie la forme minimale d'un instantané avant de remplacer un document en direct. */
export function assertSnapshotShape(snapshot) {
  if (!isPlainObject(snapshot)) {
    throw new InvalidSnapshotError("l'instantané doit être un objet JSON");
  }
  assertCollection('nodes', snapshot.nodes);
  assertCollection('edges', snapshot.edges);
  if (snapshot.meta !== undefined && !isPlainObject(snapshot.meta)) {
    throw new InvalidSnapshotError('« meta » doit être un objet');
  }
}

/** Initialise le document Yjs depuis le seed JSON (dans une transaction). */
export function applySeed(doc, seed) {
  doc.transact(() => writeSnapshot(doc, seed));
}

/**
 * Remplace le contenu du document par l'instantané, en une seule transaction : les clients
 * connectés reçoivent le changement sans se reconnecter.
 */
export function replaceWithSnapshot(document, snapshot) {
  assertSnapshotShape(snapshot);
  document.transact(() => writeSnapshot(document, snapshot));
}

/** Produit l'instantané JSON du contrat à partir du document Yjs. */
export function yjsToSnapshot(doc) {
  const snapshot = { schemaVersion: SCHEMA_VERSION };
  const meta = yjsToJson(doc.getMap(META));
  if (Object.keys(meta).length > 0) {
    snapshot.meta = meta;
  }
  snapshot.nodes = readCollection(doc.getMap(NODES));
  snapshot.edges = readCollection(doc.getMap(EDGES));
  return snapshot;
}

/**
 * Migre un document écrit avec l'ancienne disposition (une carte « canvas » contenant des
 * tableaux) vers les trois cartes du contrat. Sans effet sur un document déjà au bon format.
 *
 * @returns {boolean} vrai si une migration a eu lieu
 */
export function migrateLegacyCanvas(doc) {
  const legacy = doc.getMap(LEGACY_ROOT);
  if (legacy.size === 0) return false;
  if (doc.getMap(NODES).size > 0 || doc.getMap(EDGES).size > 0) return false;

  const old = yjsToJson(legacy);
  const items = (value) => (Array.isArray(value) ? value.filter((v) => isPlainObject(v) && typeof v.id === 'string') : []);
  doc.transact(() => {
    writeSnapshot(doc, {
      nodes: items(old.nodes),
      edges: items(old.edges),
      meta: isPlainObject(old.meta) ? old.meta : {},
    });
    legacy.clear();
  });
  return true;
}
