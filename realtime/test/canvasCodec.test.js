import test from 'node:test';
import assert from 'node:assert/strict';

import * as Y from 'yjs';
import {
  applySeed,
  assertSnapshotShape,
  InvalidSnapshotError,
  migrateLegacyCanvas,
  replaceWithSnapshot,
  yjsToSnapshot,
} from '../src/canvasCodec.js';

const seed = {
  schemaVersion: 1,
  meta: { name: 'Démo', description: 'Marketplace mobile' },
  nodes: [
    {
      id: 'n1',
      type: 'webapp',
      position: { x: 0, y: 120 },
      data: { name: 'boutique_web', label: 'Boutique', pages: ['accueil', 'panier'] },
    },
    {
      id: 'n2',
      type: 'database',
      position: { x: 540, y: 240 },
      data: {
        name: 'marketplace_db',
        engine: 'postgresql',
        entities: [
          {
            name: 'produit',
            fields: [
              { name: 'nom', type: 'string', required: true },
              { name: 'prix', type: 'decimal', required: true },
            ],
          },
        ],
      },
    },
  ],
  edges: [{ id: 'e1', source: 'n1', target: 'n2', kind: 'data' }],
};

/** Échange les modifications de deux documents, dans les deux sens. */
function sync(a, b) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

test('seed -> Yjs -> instantané : aucune perte, tableaux triés par id', () => {
  const doc = new Y.Doc();
  applySeed(doc, seed);
  assert.deepEqual(yjsToSnapshot(doc), seed);
});

test("la disposition Yjs est celle du contrat : cartes nodes, edges, meta indexées par id", () => {
  const doc = new Y.Doc();
  applySeed(doc, seed);

  const nodes = doc.getMap('nodes');
  assert.deepEqual([...nodes.keys()].sort(), ['n1', 'n2']);
  const entry = nodes.get('n1');
  assert.ok(entry instanceof Y.Map, "une entrée de bloc est une Y.Map");
  assert.deepEqual([...entry.keys()].sort(), ['data', 'position', 'type'], "l'id n'est pas un champ de l'entrée");
  assert.deepEqual(entry.get('position'), { x: 0, y: 120 });

  assert.deepEqual([...doc.getMap('edges').keys()], ['e1']);
  assert.deepEqual(doc.getMap('edges').get('e1').toJSON(), { source: 'n1', target: 'n2', kind: 'data' });
  assert.deepEqual(doc.getMap('meta').toJSON(), seed.meta);
  assert.equal(doc.getMap('canvas').size, 0, "plus de carte « canvas »");
});

test("un document écrit comme le fait un client du contrat donne un instantané valide", () => {
  const doc = new Y.Doc();
  const nodes = doc.getMap('nodes');

  // Entrée en Y.Map avec des valeurs simples.
  const api = new Y.Map();
  api.set('type', 'service');
  api.set('position', { x: 10, y: 20 });
  api.set('data', { name: 'api' });
  nodes.set('n-api', api);

  // Entrée en Y.Map avec des valeurs imbriquées en types Yjs.
  const db = new Y.Map();
  db.set('type', 'database');
  db.set('position', new Y.Map([['x', 1], ['y', 2]]));
  db.set('data', new Y.Map([['name', 'base'], ['entities', new Y.Array()]]));
  nodes.set('n-db', db);

  // Entrée sous forme d'objet JSON simple, avec un « id » parasite : la clé fait foi.
  nodes.set('n-web', { id: 'autre', type: 'webapp', position: { x: 0, y: 0 }, data: { name: 'web' } });

  doc.getMap('edges').set('e1', new Y.Map([['source', 'n-web'], ['target', 'n-api']]));

  const snapshot = yjsToSnapshot(doc);
  assert.equal(snapshot.schemaVersion, 1);
  assert.ok(Array.isArray(snapshot.nodes) && Array.isArray(snapshot.edges));
  assert.deepEqual(snapshot.nodes.map((n) => n.id), ['n-api', 'n-db', 'n-web']);
  assert.deepEqual(snapshot.nodes[1], {
    id: 'n-db',
    type: 'database',
    position: { x: 1, y: 2 },
    data: { name: 'base', entities: [] },
  });
  assert.equal(snapshot.nodes[2].id, 'n-web');
  assert.deepEqual(snapshot.edges, [{ id: 'e1', source: 'n-web', target: 'n-api' }]);
  assert.equal('meta' in snapshot, false, "pas de meta quand la carte est vide");
});

test("l'instantané est identique quel que soit l'ordre d'insertion", () => {
  const forward = new Y.Doc();
  applySeed(forward, seed);
  const backward = new Y.Doc();
  applySeed(backward, { ...seed, nodes: [...seed.nodes].reverse() });
  assert.deepEqual(yjsToSnapshot(backward), yjsToSnapshot(forward));
});

test("deux personnes qui modifient des blocs différents, ou deux champs d'un même bloc, ne se gênent pas", () => {
  const a = new Y.Doc();
  applySeed(a, seed);
  const b = new Y.Doc();
  sync(a, b);

  // A déplace n1, B renomme n2 et déplace... le même n2 (champs différents de l'entrée).
  a.getMap('nodes').get('n1').set('position', { x: 99, y: 99 });
  b.getMap('nodes').get('n2').set('data', { name: 'autre_base' });
  a.getMap('nodes').get('n2').set('position', { x: 7, y: 7 });
  sync(a, b);

  for (const doc of [a, b]) {
    const snapshot = yjsToSnapshot(doc);
    assert.deepEqual(snapshot.nodes[0].position, { x: 99, y: 99 });
    assert.deepEqual(snapshot.nodes[1].position, { x: 7, y: 7 });
    assert.equal(snapshot.nodes[1].data.name, 'autre_base');
  }
});

test('replaceWithSnapshot remplace tout le contenu, meta comprise', () => {
  const doc = new Y.Doc();
  applySeed(doc, seed);

  const replacement = {
    schemaVersion: 1,
    nodes: [{ id: 'a', type: 'auth', position: { x: 1, y: 2 }, data: { name: 'connexion', method: 'otp-sms' } }],
    edges: [],
  };

  replaceWithSnapshot(doc, replacement);
  assert.deepEqual(yjsToSnapshot(doc), replacement);
  assert.equal(doc.getMap('meta').size, 0);
});

test('un instantané mal formé est refusé et le document reste intact', () => {
  const doc = new Y.Doc();
  applySeed(doc, seed);

  const invalid = [
    null,
    [],
    { nodes: {}, edges: [] },
    { nodes: [], edges: 'non' },
    { nodes: [{ type: 'service' }], edges: [] },
    { nodes: [{ id: 'x' }, { id: 'x' }], edges: [] },
    { nodes: [], edges: [{ id: 3 }] },
    { nodes: [], edges: [], meta: 'non' },
  ];
  for (const snapshot of invalid) {
    assert.throws(() => replaceWithSnapshot(doc, snapshot), InvalidSnapshotError, JSON.stringify(snapshot));
  }
  assert.deepEqual(yjsToSnapshot(doc), seed);
  assert.doesNotThrow(() => assertSnapshotShape({ nodes: [], edges: [] }));
});

test('un document vide donne un instantané vide valide', () => {
  assert.deepEqual(yjsToSnapshot(new Y.Doc()), { schemaVersion: 1, nodes: [], edges: [] });
});

/** Reproduit l'ancienne disposition : une carte « canvas » avec des tableaux de Y.Map. */
function writeLegacy(doc, snapshot) {
  const toYjs = (value) => {
    if (Array.isArray(value)) {
      const array = new Y.Array();
      array.push(value.map(toYjs));
      return array;
    }
    if (value !== null && typeof value === 'object') {
      const map = new Y.Map();
      for (const [key, item] of Object.entries(value)) map.set(key, toYjs(item));
      return map;
    }
    return value;
  };
  const root = doc.getMap('canvas');
  root.set('schemaVersion', snapshot.schemaVersion);
  root.set('meta', toYjs(snapshot.meta));
  root.set('nodes', toYjs(snapshot.nodes));
  root.set('edges', toYjs(snapshot.edges));
}

test("un état à l'ancienne disposition (tableaux) est migré vers le contrat", () => {
  const legacy = new Y.Doc();
  writeLegacy(legacy, seed);

  // Ce que le serveur recharge : l'état binaire enregistré.
  const loaded = new Y.Doc();
  Y.applyUpdate(loaded, Y.encodeStateAsUpdate(legacy));

  assert.equal(migrateLegacyCanvas(loaded), true);
  assert.deepEqual(yjsToSnapshot(loaded), seed);
  assert.equal(loaded.getMap('canvas').size, 0);
  assert.equal(migrateLegacyCanvas(loaded), false, 'idempotent');
});

test("la migration ne touche pas un document déjà au format du contrat", () => {
  const doc = new Y.Doc();
  applySeed(doc, seed);
  assert.equal(migrateLegacyCanvas(doc), false);
  assert.deepEqual(yjsToSnapshot(doc), seed);
});

test("la clé « ui » (présentation du front) est partagée mais jamais reprise dans l'instantané", () => {
  const doc = new Y.Doc();
  applySeed(doc, seed);
  doc.getMap('nodes').get('n1').set('ui', { shape: 'gateway', replicas: 3 });
  doc.getMap('edges').get('e1').set('ui', { throughput: '2 000 req/s' });

  assert.deepEqual(yjsToSnapshot(doc), seed, "l'instantané reste conforme au contrat");
  assert.deepEqual(doc.getMap('nodes').get('n1').get('ui'), { shape: 'gateway', replicas: 3 });
});

test("une restauration garde « ui » pour les identifiants qui survivent et l'oublie pour les autres", () => {
  const doc = new Y.Doc();
  applySeed(doc, seed);
  doc.getMap('nodes').get('n1').set('ui', { replicas: 3 });
  doc.getMap('nodes').get('n2').set('ui', { replicas: 5 });

  const restored = { ...seed, nodes: [seed.nodes[0]], edges: [] };
  replaceWithSnapshot(doc, restored);

  assert.deepEqual(yjsToSnapshot(doc), restored);
  assert.deepEqual(doc.getMap('nodes').get('n1').get('ui'), { replicas: 3 });
  assert.equal(doc.getMap('nodes').has('n2'), false);
});
