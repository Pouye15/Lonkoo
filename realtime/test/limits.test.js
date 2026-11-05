import test from 'node:test';
import assert from 'node:assert/strict';

import * as Y from 'yjs';
import { WebSocket } from 'ws';

import {
  CLOSE_CANVAS_TOO_LARGE,
  CLOSE_TOO_MANY_MESSAGES,
  DEFAULT_LIMITS,
  createDocumentSizeGuard,
  createMessageBudget,
  isDocumentWrite,
  limitsFromEnv,
  resolveLimits,
} from '../src/limits.js';
import { CANVAS_ID, bearer, internalCall, makeProvider, signTicket, waitFor, waitForSync, withServer } from './helpers.js';

const SNAPSHOT_PATH = `/internal/canvases/${CANVAS_ID}/snapshot`;
const seed = { schemaVersion: 1, nodes: [{ id: 'n1', type: 'webapp', position: { x: 0, y: 0 }, data: { name: 'boutique' } }], edges: [] };

// --- Unités ---------------------------------------------------------------------------------------------------------

/** Entier de longueur variable (lib0), pour construire des messages comme le fait le protocole. */
function varUint(value) {
  const bytes = [];
  let rest = value;
  while (rest > 0x7f) {
    bytes.push(0x80 | (rest & 0x7f));
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
  return bytes;
}

/** [nom du document][type][sous-type][charge], comme les messages reçus sur la socket. */
function message({ name = CANVAS_ID, type, subtype, payload = [1, 2, 3] }) {
  const nameBytes = [...Buffer.from(name)];
  return Uint8Array.from([...varUint(nameBytes.length), ...nameBytes, ...varUint(type), ...(subtype === undefined ? [] : varUint(subtype)), ...payload]);
}

test("isDocumentWrite : seules la deuxième étape et les mises à jour de synchronisation écrivent dans le document", () => {
  assert.equal(isDocumentWrite(message({ type: 0, subtype: 2 })), true, 'mise à jour');
  assert.equal(isDocumentWrite(message({ type: 0, subtype: 1 })), true, 'étape 2 (état complet du client)');
  assert.equal(isDocumentWrite(message({ type: 0, subtype: 0 })), false, 'étape 1 : un vecteur d’état, rien à écrire');
  assert.equal(isDocumentWrite(message({ type: 1 })), false, 'curseurs (awareness)');
  assert.equal(isDocumentWrite(message({ type: 3 })), false, 'demande de présence');
  assert.equal(isDocumentWrite(message({ type: 5 })), false, 'message sans état (stateless)');
});

test('isDocumentWrite : le type « réponse de synchronisation » compte aussi, il ne sert pas à contourner la limite', () => {
  assert.equal(isDocumentWrite(message({ type: 4, subtype: 2 })), true);
  assert.equal(isDocumentWrite(message({ type: 4, subtype: 0 })), false);
});

test("isDocumentWrite : l'adresse « document\\0session » et les messages tronqués ou vides sont gérés", () => {
  assert.equal(isDocumentWrite(message({ name: `${CANVAS_ID}\u0000session-1`, type: 0, subtype: 2 })), true);
  assert.equal(isDocumentWrite(new Uint8Array(0)), false);
  assert.equal(isDocumentWrite(Uint8Array.from([200])), false, 'longueur de nom jamais terminée');
  assert.equal(isDocumentWrite(Uint8Array.from([5, 97])), false, 'nom plus long que le message');
  assert.equal(isDocumentWrite(message({ type: 0, payload: [] })), false, 'sans sous-type');
});

test('le budget de débit laisse passer une rafale, puis coupe un débit soutenu', () => {
  let clock = 0;
  const budget = createMessageBudget({ ...DEFAULT_LIMITS, messagesPerSecond: 10, bytesPerWindow: 0 }, () => clock);
  for (let i = 0; i < 30; i++) assert.equal(budget.take(10), null, `message ${i + 1} dans la rafale (3 × 10)`);
  assert.equal(budget.take(10), 'messages', 'le 31e message dans la même milliseconde est refusé');
  clock += 1000;
  for (let i = 0; i < 10; i++) assert.equal(budget.take(10), null, 'une seconde plus tard, 10 messages sont à nouveau permis');
  assert.equal(budget.take(10), 'messages');
});

test("le budget de débit tient compte des octets, pas seulement du nombre de messages", () => {
  let clock = 0;
  const budget = createMessageBudget({ ...DEFAULT_LIMITS, messagesPerSecond: 0, bytesPerWindow: 1000, windowMs: 10_000 }, () => clock);
  assert.equal(budget.take(600), null);
  assert.equal(budget.take(400), null);
  assert.equal(budget.take(1), 'bytes');
  clock += 5000; // la moitié de la fenêtre : 500 octets reviennent
  assert.equal(budget.take(500), null);
  assert.equal(budget.take(100), 'bytes');
});

test('un budget à 0 est désactivé', () => {
  const budget = createMessageBudget({ ...DEFAULT_LIMITS, messagesPerSecond: 0, bytesPerWindow: 0 }, () => 0);
  for (let i = 0; i < 100_000; i++) assert.equal(budget.take(1_000_000), null);
});

/** Document factice et mesure contrôlée : on fixe la taille « mesurée » sans fabriquer de gros documents. */
function guardWith(overrides, size) {
  const state = { size, measures: 0, clock: 0 };
  const guard = createDocumentSizeGuard(
    { ...DEFAULT_LIMITS, maxDocumentBytes: 1000, smallUpdateBytes: 50, remeasureBytes: 300, remeasureMs: 2000, ...overrides },
    {
      now: () => state.clock,
      measure: () => {
        state.measures += 1;
        return state.size;
      },
    },
  );
  return { guard, state, document: {} };
}

test('la garde de taille laisse passer ce qui tient sous le plafond et refuse ce qui le ferait dépasser', () => {
  const { guard, document } = guardWith({}, 800);
  assert.equal(guard.refuses(document, 100), false, '800 + 100 ≤ 1000');
  assert.equal(guard.refuses(document, 201), true, '800 + 201 > 1000');
});

test('au-dessus du plafond, seules les petites modifications passent, jusqu’au double du plafond', () => {
  const over = guardWith({}, 1500);
  assert.equal(over.guard.refuses(over.document, 40), false, 'on peut encore déplacer ou supprimer pour alléger le canvas');
  assert.equal(over.guard.refuses(over.document, 51), true, 'mais pas ajouter du contenu');

  const hard = guardWith({}, 2000);
  assert.equal(hard.guard.refuses(hard.document, 1), true, 'au double du plafond, plus rien ne passe');
});

test('la taille est remesurée tous les 300 octets reçus ou toutes les 2 s, pas à chaque message', () => {
  const { guard, state, document } = guardWith({}, 100);
  guard.refuses(document, 10);
  assert.equal(state.measures, 1, 'première écriture : mesure');
  for (let i = 0; i < 20; i++) guard.refuses(document, 10);
  assert.equal(state.measures, 1, '210 octets reçus : pas de nouvelle mesure');
  for (let i = 0; i < 10; i++) guard.refuses(document, 10);
  assert.equal(state.measures, 2, 'après 300 octets reçus : nouvelle mesure');

  state.clock += 2000;
  guard.refuses(document, 1);
  assert.equal(state.measures, 3, 'après 2 s : nouvelle mesure');
});

test("un refus s'appuie sur une mesure fraîche : alléger un canvas ne laisse pas de refus à tort pendant 2 s", () => {
  const { guard, state, document } = guardWith({}, 900);
  assert.equal(guard.refuses(document, 10), false, 'première mesure : 900');
  state.size = 1100; // le canvas a grossi sans que la prochaine mesure périodique soit due
  assert.equal(guard.refuses(document, 150), true, '900 + 150 > 1000 : refus décidé sur une mesure fraîche (1100)');
  state.size = 100; // quelqu’un a allégé le canvas
  assert.equal(guard.refuses(document, 150), false, 'la taille connue (1100) est périmée : la mesure fraîche (100) l’emporte');
});

test('la garde de taille mesure vraiment un document Yjs (même encodage que celui enregistré)', () => {
  const document = new Y.Doc();
  const guard = createDocumentSizeGuard({ ...DEFAULT_LIMITS, maxDocumentBytes: 5000, smallUpdateBytes: 0 });
  assert.equal(guard.refuses(document, 100), false, 'document vide');

  const full = new Y.Doc();
  full.getMap('nodes').set('n1', 'x'.repeat(6000));
  assert.equal(createDocumentSizeGuard({ ...DEFAULT_LIMITS, maxDocumentBytes: 5000, smallUpdateBytes: 0 }).refuses(full, 100), true);
});

test('une garde à 0 est désactivée', () => {
  const { guard, document } = guardWith({ maxDocumentBytes: 0 }, 10_000_000);
  assert.equal(guard.refuses(document, 5_000_000), false);
});

test("resolveLimits complète les valeurs par défaut et refuse un mode ou un nombre absurde", () => {
  assert.deepEqual(resolveLimits(), DEFAULT_LIMITS);
  assert.equal(resolveLimits({ mode: 'log' }).mode, 'log');
  assert.throws(() => resolveLimits({ mode: 'strict' }), /mode de limites inconnu/);
  assert.throws(() => resolveLimits({ messagesPerSecond: -1 }), /invalide/);
  assert.throws(() => resolveLimits({ maxDocumentBytes: Number.NaN }), /invalide/);
});

test("limitsFromEnv lit l'environnement et refuse ce qui n'est pas un entier positif ou nul", () => {
  assert.deepEqual(limitsFromEnv({}), DEFAULT_LIMITS);
  const custom = limitsFromEnv({
    REALTIME_LIMITS_MODE: 'log',
    REALTIME_MAX_MESSAGES_PER_SECOND: '50',
    REALTIME_MAX_BYTES_PER_10S: '0',
    REALTIME_MAX_STATE_BYTES: '1048576',
  });
  assert.equal(custom.mode, 'log');
  assert.equal(custom.messagesPerSecond, 50);
  assert.equal(custom.bytesPerWindow, 0);
  assert.equal(custom.maxDocumentBytes, 1048576);
  assert.throws(() => limitsFromEnv({ REALTIME_MAX_STATE_BYTES: 'beaucoup' }), /REALTIME_MAX_STATE_BYTES/);
  assert.throws(() => limitsFromEnv({ REALTIME_MAX_MESSAGES_PER_SECOND: '-5' }), /REALTIME_MAX_MESSAGES_PER_SECOND/);
  assert.throws(() => limitsFromEnv({ REALTIME_LIMITS_MODE: 'strict' }), /mode de limites inconnu/);
});

// --- Serveur complet ------------------------------------------------------------------------------------------------

const node = (data) =>
  new Y.Map([
    ['type', 'generic'],
    ['position', { x: 1, y: 1 }],
    ['data', data],
  ]);

/** Branche un client et note les codes de fermeture des sockets qu'il ouvre. */
async function connect(wsUrl, userId = 'user-1') {
  const closeCodes = [];
  class SpySocket extends WebSocket {
    constructor(...args) {
      super(...args);
      this.on('close', (code) => closeCodes.push(code));
    }
  }
  const client = makeProvider(wsUrl, await signTicket({ userId }), CANVAS_ID, SpySocket);
  // Pas de reconnexion automatique : une fermeture voulue par le serveur doit rester visible dans le test.
  client.provider.configuration.websocketProvider.configuration.maxAttempts = 1;
  return { ...client, closeCodes };
}

/** Une série de modifications, chacune dans sa propre transaction, donc dans son propre message. */
function sendManyEdits(doc, count, prefix = 'flood') {
  for (let i = 0; i < count; i++) doc.getMap('nodes').set(`${prefix}-${i}`, node({ name: 'bloc' }));
}

test('débit : une connexion qui inonde le serveur est fermée avec le code 4429', async () => {
  await withServer({ seed }, async ({ wsUrl }) => {
    const client = await connect(wsUrl);
    await waitForSync(client.provider);
    sendManyEdits(client.doc, 200);
    await waitFor(() => client.closeCodes.includes(CLOSE_TOO_MANY_MESSAGES.code));
    client.provider.destroy();
  }, { limits: { messagesPerSecond: 5 } }); // rafale de 15 messages
});

test("débit : l'usage normal d'une personne qui travaille vite n'est pas touché (limites par défaut)", async () => {
  await withServer({ seed }, async ({ wsUrl, port }) => {
    const client = await connect(wsUrl);
    await waitForSync(client.provider);
    // 60 gestes d'affilée (déplacements, ajouts) et des curseurs : bien au-delà d'un usage humain.
    for (let i = 0; i < 60; i++) {
      client.doc.getMap('nodes').set(`b${i}`, node({ name: 'bloc' }));
      client.provider.awareness.setLocalStateField('cursor', { x: i, y: i });
    }
    await waitFor(async () => (await internalCall(port, SNAPSHOT_PATH, { token: bearer() })).json.nodes.length === 61);
    assert.deepEqual(client.closeCodes, [], 'la socket est restée ouverte');
    client.provider.destroy();
  });
});

test("débit : sans la règle (mode off ou log) le même flot passe, ce qui prouve que le test détecte la règle", async () => {
  for (const mode of ['off', 'log']) {
    await withServer({ seed }, async ({ wsUrl, port }) => {
      const client = await connect(wsUrl);
      await waitForSync(client.provider);
      sendManyEdits(client.doc, 200);
      await waitFor(async () => (await internalCall(port, SNAPSHOT_PATH, { token: bearer() })).json.nodes.length === 201);
      assert.deepEqual(client.closeCodes, [], `mode ${mode} : rien n'est refusé`);
      client.provider.destroy();
    }, { limits: { mode, messagesPerSecond: 5 } });
  }
});

test("débit : l'inondation d'une personne ne coupe pas les autres", async () => {
  await withServer({ seed }, async ({ wsUrl }) => {
    const calm = await connect(wsUrl, 'calme');
    const noisy = await connect(wsUrl, 'bruyant');
    await waitForSync(calm.provider);
    await waitForSync(noisy.provider);
    sendManyEdits(noisy.doc, 200);
    await waitFor(() => noisy.closeCodes.includes(CLOSE_TOO_MANY_MESSAGES.code));
    assert.deepEqual(calm.closeCodes, []);
    assert.equal(calm.provider.isSynced, true);
    calm.provider.destroy();
    noisy.provider.destroy();
  }, { limits: { messagesPerSecond: 5 } });
});

const bigText = (length) => 'x'.repeat(length);

test('taille : une modification qui ferait dépasser le plafond est refusée, le document reste intact, la connexion est fermée (4413)', async () => {
  await withServer({ seed }, async ({ wsUrl, port }) => {
    const client = await connect(wsUrl);
    await waitForSync(client.provider);

    client.doc.getMap('nodes').set('gros', node({ name: 'gros', description: bigText(30_000) }));

    await waitFor(() => client.closeCodes.includes(CLOSE_CANVAS_TOO_LARGE.code));
    const { json } = await internalCall(port, SNAPSHOT_PATH, { token: bearer() });
    assert.deepEqual(json.nodes.map((n) => n.id), ['n1'], 'le gros bloc n’a pas été appliqué');
    client.provider.destroy();
  }, { limits: { maxDocumentBytes: 20_000 } });
});

test('taille : sans la règle (mode off ou log) la même modification passe', async () => {
  for (const mode of ['off', 'log']) {
    await withServer({ seed }, async ({ wsUrl, port }) => {
      const client = await connect(wsUrl);
      await waitForSync(client.provider);
      client.doc.getMap('nodes').set('gros', node({ name: 'gros', description: bigText(30_000) }));
      await waitFor(async () => (await internalCall(port, SNAPSHOT_PATH, { token: bearer() })).json.nodes.length === 2);
      assert.deepEqual(client.closeCodes, [], `mode ${mode}`);
      client.provider.destroy();
    }, { limits: { mode, maxDocumentBytes: 20_000 } });
  }
});

test('taille : une modification qui tient sous le plafond passe', async () => {
  await withServer({ seed }, async ({ wsUrl, port }) => {
    const client = await connect(wsUrl);
    await waitForSync(client.provider);
    client.doc.getMap('nodes').set('moyen', node({ name: 'moyen', description: bigText(5_000) }));
    await waitFor(async () => (await internalCall(port, SNAPSHOT_PATH, { token: bearer() })).json.nodes.length === 2);
    assert.deepEqual(client.closeCodes, []);
    client.provider.destroy();
  }, { limits: { maxDocumentBytes: 20_000 } });
});

/** Canvas déjà plein à l'ouverture : le seed n'est pas soumis à la garde, seules les modifications des clients le sont. */
const fullSeed = (length) => ({
  schemaVersion: 1,
  nodes: [
    { id: 'n1', type: 'generic', position: { x: 0, y: 0 }, data: { name: 'plein', description: bigText(length) } },
  ],
  edges: [],
});

test('taille : un canvas déjà au-dessus du plafond peut encore être allégé, puis reprend de la place', async () => {
  // État d'environ 30 Kio pour un plafond de 20 Kio : au-dessus du plafond, en dessous du double.
  await withServer({ seed: fullSeed(30_000) }, async ({ wsUrl, port }) => {
    const client = await connect(wsUrl);
    await waitForSync(client.provider);
    const nodeCount = async () => (await internalCall(port, SNAPSHOT_PATH, { token: bearer() })).json.nodes.length;

    client.doc.getMap('nodes').get('n1').set('position', { x: 50, y: 50 });
    await waitFor(async () => (await internalCall(port, SNAPSHOT_PATH, { token: bearer() })).json.nodes[0].position.x === 50);
    client.doc.getMap('nodes').delete('n1');
    await waitFor(async () => (await nodeCount()) === 0);
    assert.deepEqual(client.closeCodes, [], 'déplacer puis supprimer ne ferme rien');

    // Le canvas est allégé : la place libérée est utilisable tout de suite, sans attendre la prochaine mesure.
    client.doc.getMap('nodes').set('autre', node({ name: 'autre', description: bigText(6_000) }));
    await waitFor(async () => (await nodeCount()) === 1);
    assert.deepEqual(client.closeCodes, []);

    client.doc.getMap('nodes').set('trop', node({ name: 'trop', description: bigText(30_000) }));
    await waitFor(() => client.closeCodes.includes(CLOSE_CANVAS_TOO_LARGE.code));
    assert.equal(await nodeCount(), 1, 'le bloc trop gros n’a pas été ajouté');
    client.provider.destroy();
  }, { limits: { maxDocumentBytes: 20_000 } });
});

test('taille : au double du plafond, même une petite modification est refusée', async () => {
  await withServer({ seed: fullSeed(60_000) }, async ({ wsUrl, port }) => {
    const client = await connect(wsUrl);
    await waitForSync(client.provider);
    client.doc.getMap('nodes').get('n1').set('position', { x: 50, y: 50 });
    await waitFor(() => client.closeCodes.includes(CLOSE_CANVAS_TOO_LARGE.code));
    const { json } = await internalCall(port, SNAPSHOT_PATH, { token: bearer() });
    assert.equal(json.nodes[0].position.x, 0, 'le déplacement n’a pas été appliqué');
    client.provider.destroy();
  }, { limits: { maxDocumentBytes: 20_000 } });
});

test("taille : la restauration d'une version par le backend n'est pas soumise à la garde (issue de secours d'un canvas plein)", async () => {
  await withServer({ seed: fullSeed(60_000) }, async ({ backend, port }) => {
    const small = { schemaVersion: 1, nodes: [], edges: [] };
    const restored = await internalCall(port, `/internal/canvases/${CANVAS_ID}/restore`, { method: 'POST', token: bearer(), body: small });
    assert.equal(restored.status, 204);
    const { json } = await internalCall(port, SNAPSHOT_PATH, { token: bearer() });
    assert.deepEqual(json.nodes, []);
    // Le document est enregistré après la restauration : on l'attend pour que le faux backend ne soit pas arrêté avant.
    await waitFor(() => backend.putCount() >= 1);
  }, { limits: { maxDocumentBytes: 20_000 } });
});

test('démarrer le serveur avec des limites invalides échoue tout de suite', async () => {
  const { createCanvasServer } = await import('../src/index.js');
  assert.throws(
    () => createCanvasServer({ backendUrl: 'http://127.0.0.1:1', serviceToken: 't', ticketSecret: 's', limits: { mode: 'strict' } }),
    /mode de limites inconnu/,
  );
});
