import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import * as Y from 'yjs';
import { WebSocket } from 'ws';

import { createCanvasServer } from '../src/index.js';
import { applySeed, yjsToSnapshot } from '../src/canvasCodec.js';
import {
  CANVAS_ID,
  SERVICE_TOKEN,
  TICKET_SECRET,
  bearer,
  createFakeBackend,
  internalCall,
  makeProvider,
  signTicket,
  waitFor,
  waitForSync,
} from './helpers.js';

const seed = {
  schemaVersion: 1,
  meta: { name: 'Canvas test' },
  nodes: [
    { id: 'n1', type: 'webapp', position: { x: 0, y: 0 }, data: { name: 'boutique' } },
    { id: 'n2', type: 'service', position: { x: 10, y: 10 }, data: { name: 'api' } },
  ],
  edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
};

const SNAPSHOT_PATH = `/internal/canvases/${CANVAS_ID}/snapshot`;
const RESTORE_PATH = `/internal/canvases/${CANVAS_ID}/restore`;

/** Démarre un faux backend et un serveur temps réel, exécute `body`, puis arrête tout. */
async function withServer(backendOptions, body, serverOptions = {}) {
  const backend = createFakeBackend(backendOptions);
  await backend.start();
  const server = createCanvasServer({
    backendUrl: backend.url(),
    serviceToken: SERVICE_TOKEN,
    ticketSecret: TICKET_SECRET,
    port: 0,
    storeDebounceMs: 50,
    storeMaxDebounceMs: 200,
    ...serverOptions,
  });
  const { port } = await server.start();
  try {
    await body({ backend, server, port, wsUrl: `ws://127.0.0.1:${port}` });
  } finally {
    await server.stop();
    await backend.stop();
  }
}

test('les routes internes exigent le jeton de service', async () => {
  await withServer({ seed }, async ({ port }) => {
    const sansJeton = await internalCall(port, SNAPSHOT_PATH, { token: null });
    assert.equal(sansJeton.status, 401);
    assert.equal(sansJeton.headers.get('www-authenticate'), 'Bearer');

    for (const token of [bearer('mauvais-jeton'), 'Bearer ', 'Basic dGVzdA==', SERVICE_TOKEN]) {
      assert.equal((await internalCall(port, SNAPSHOT_PATH, { token })).status, 401, `jeton : ${token}`);
    }

    // Un restore anonyme n'efface rien.
    const restore = await internalCall(port, RESTORE_PATH, { method: 'POST', token: null, body: { nodes: [], edges: [] } });
    assert.equal(restore.status, 401);
    const snapshot = await internalCall(port, SNAPSHOT_PATH, { token: bearer() });
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.json.nodes.length, 2);
  });
});

test("l'instantané d'un canvas jamais ouvert est son seed, au format du contrat", async () => {
  await withServer({ seed }, async ({ port }) => {
    const { status, json } = await internalCall(port, SNAPSHOT_PATH, { token: bearer() });
    assert.equal(status, 200);
    assert.deepEqual(json, seed);
  });
});

test("un canvas sans état ni seed donne un instantané vide", async () => {
  await withServer({}, async ({ port }) => {
    const { status, json } = await internalCall(port, SNAPSHOT_PATH, { token: bearer() });
    assert.equal(status, 200);
    assert.deepEqual(json, { schemaVersion: 1, nodes: [], edges: [] });
  });
});

test('le serveur temps réel présente le jeton de service au backend', async () => {
  await withServer({ seed }, async ({ backend, port }) => {
    await internalCall(port, SNAPSHOT_PATH, { token: bearer() });
    assert.equal(backend.lastAuthorization(), bearer());
  });
});

test('la restauration remplace le contenu et un client connecté voit le changement', async () => {
  await withServer({ seed }, async ({ port, wsUrl }) => {
    const { provider, doc } = makeProvider(wsUrl, await signTicket());
    await waitForSync(provider);
    assert.equal(yjsToSnapshot(doc).nodes.length, 2);

    const replacement = {
      schemaVersion: 1,
      nodes: [{ id: 'z1', type: 'auth', position: { x: 5, y: 5 }, data: { name: 'connexion', method: 'github' } }],
      edges: [],
    };
    const restore = await internalCall(port, RESTORE_PATH, { method: 'POST', token: bearer(), body: replacement });
    assert.equal(restore.status, 204);

    await waitFor(() => yjsToSnapshot(doc).nodes.length === 1);
    assert.deepEqual(yjsToSnapshot(doc).nodes.map((n) => n.id), ['z1']);
    assert.deepEqual((await internalCall(port, SNAPSHOT_PATH, { token: bearer() })).json, replacement);
    provider.destroy();
  });
});

test('une restauration invalide est refusée en 400 et ne change rien', async () => {
  await withServer({ seed }, async ({ port }) => {
    const bodies = [
      '{pas du json',
      JSON.stringify({ nodes: {}, edges: [] }),
      JSON.stringify({ nodes: [{ id: 'x' }, { id: 'x' }], edges: [] }),
      JSON.stringify([]),
    ];
    for (const body of bodies) {
      const { status } = await internalCall(port, RESTORE_PATH, { method: 'POST', token: bearer(), body });
      assert.equal(status, 400, body);
    }
    assert.deepEqual((await internalCall(port, SNAPSHOT_PATH, { token: bearer() })).json, seed);
  });
});

test("identifiant de canvas qui n'est pas un UUID : 404 ; mauvaise méthode : 405", async () => {
  await withServer({ seed }, async ({ port }) => {
    assert.equal((await internalCall(port, '/internal/canvases/pas-un-uuid/snapshot', { token: bearer() })).status, 404);
    assert.equal((await internalCall(port, '/internal/canvases/../snapshot', { token: bearer() })).status, 404);
    assert.equal((await internalCall(port, SNAPSHOT_PATH, { method: 'POST', token: bearer(), body: {} })).status, 405);
    assert.equal((await internalCall(port, RESTORE_PATH, { method: 'GET', token: bearer() })).status, 405);
    assert.equal((await internalCall(port, '/autre-chose', { token: bearer() })).status, 404);
  });
});

test("une montée en protocole autre que WebSocket (h2c d'un client HTTP/2) reçoit un 400 net", async () => {
  await withServer({ seed }, async ({ port }) => {
    const status = await new Promise((resolve, reject) => {
      const request = http.request(
        {
          host: '127.0.0.1',
          port,
          path: SNAPSHOT_PATH,
          headers: {
            Connection: 'Upgrade, HTTP2-Settings',
            Upgrade: 'h2c',
            'HTTP2-Settings': 'AAMAAABkAAQCAAAAAAIAAAAA',
            Authorization: bearer(),
          },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      request.on('error', reject);
      request.end();
    });
    assert.equal(status, 400);
  });
});

test('le WebSocket est accepté sur / et sur /ws, refusé en 404 ailleurs', async () => {
  await withServer({ seed }, async ({ wsUrl }) => {
    for (const path of ['', '/ws']) {
      const { provider, doc } = makeProvider(`${wsUrl}${path}`, await signTicket());
      await waitForSync(provider);
      assert.equal(yjsToSnapshot(doc).nodes.length, 2, `chemin « ${path} »`);
      provider.destroy();
    }

    const status = await new Promise((resolve, reject) => {
      const socket = new WebSocket(`${wsUrl}/ailleurs`);
      socket.on('unexpected-response', (_request, response) => {
        response.resume();
        resolve(response.statusCode);
      });
      socket.on('open', () => reject(new Error('connexion acceptée')));
      socket.on('error', () => {});
    });
    assert.equal(status, 404);
  });
});

test('un membre en lecture seule ne modifie rien ; une écriture, elle, passe', async () => {
  await withServer({ seed }, async ({ port, wsUrl }) => {
    const reader = makeProvider(wsUrl, await signTicket({ role: 'READ', userId: 'lecteur' }));
    const writer = makeProvider(wsUrl, await signTicket({ role: 'WRITE', userId: 'auteur' }));
    await Promise.all([waitForSync(reader.provider), waitForSync(writer.provider)]);

    const intrus = new Y.Map([['type', 'service'], ['position', { x: 1, y: 1 }], ['data', { name: 'intrus' }]]);
    reader.doc.getMap('nodes').set('intrus', intrus);
    await new Promise((resolve) => setTimeout(resolve, 300));
    let ids = (await internalCall(port, SNAPSHOT_PATH, { token: bearer() })).json.nodes.map((n) => n.id);
    assert.deepEqual(ids, ['n1', 'n2'], 'la modification du lecteur est ignorée par le serveur');

    const auteur = new Y.Map([['type', 'service'], ['position', { x: 2, y: 2 }], ['data', { name: 'auteur' }]]);
    writer.doc.getMap('nodes').set('auteur', auteur);
    await waitFor(async () => (await internalCall(port, SNAPSHOT_PATH, { token: bearer() })).json.nodes.length === 3);
    ids = (await internalCall(port, SNAPSHOT_PATH, { token: bearer() })).json.nodes.map((n) => n.id);
    assert.deepEqual(ids, ['auteur', 'n1', 'n2']);

    reader.provider.destroy();
    writer.provider.destroy();
  });
});

test("l'état enregistré est rechargé par un serveur neuf, au format du contrat", async () => {
  const backend = createFakeBackend({ seed });
  await backend.start();
  const options = {
    backendUrl: backend.url(),
    serviceToken: SERVICE_TOKEN,
    ticketSecret: TICKET_SECRET,
    port: 0,
    storeDebounceMs: 50,
    storeMaxDebounceMs: 200,
  };
  try {
    const first = createCanvasServer(options);
    const { port: firstPort } = await first.start();
    const client = makeProvider(`ws://127.0.0.1:${firstPort}`, await signTicket());
    await waitForSync(client.provider);
    client.doc.getMap('nodes').set('n3', new Y.Map([['type', 'queue'], ['position', { x: 3, y: 3 }], ['data', { name: 'bus' }]]));
    await waitFor(() => backend.stored() !== null);
    client.provider.destroy();
    await first.stop();

    const second = createCanvasServer(options);
    const { port } = await second.start();
    try {
      const { json } = await internalCall(port, SNAPSHOT_PATH, { token: bearer() });
      assert.deepEqual(json.nodes.map((n) => n.id), ['n1', 'n2', 'n3']);
      assert.deepEqual(json.nodes[2], { id: 'n3', type: 'queue', position: { x: 3, y: 3 }, data: { name: 'bus' } });
    } finally {
      await second.stop();
    }
  } finally {
    await backend.stop();
  }
});

test("un état enregistré à l'ancienne disposition est migré au chargement", async () => {
  // État tel que l'ancien codec l'écrivait : une carte « canvas » avec des tableaux.
  const legacy = new Y.Doc();
  const root = legacy.getMap('canvas');
  const nodes = new Y.Array();
  nodes.push([new Y.Map([['id', 'n1'], ['type', 'webapp'], ['position', new Y.Map([['x', 4], ['y', 5]])], ['data', new Y.Map([['name', 'ancien']])]])]);
  root.set('nodes', nodes);
  root.set('edges', new Y.Array());
  const state = Buffer.from(Y.encodeStateAsUpdate(legacy)).toString('base64');

  await withServer({ state }, async ({ port }) => {
    const { json } = await internalCall(port, SNAPSHOT_PATH, { token: bearer() });
    assert.deepEqual(json, {
      schemaVersion: 1,
      nodes: [{ id: 'n1', type: 'webapp', position: { x: 4, y: 5 }, data: { name: 'ancien' } }],
      edges: [],
    });
  });
});

test('applySeed ne dépend pas du serveur : même résultat côté client', () => {
  const doc = new Y.Doc();
  applySeed(doc, seed);
  assert.deepEqual(yjsToSnapshot(doc), seed);
});

test('un corps de restauration trop gros est refusé en 413 et ne change rien', async () => {
  await withServer(
    { seed },
    async ({ port }) => {
      const big = {
        schemaVersion: 1,
        nodes: [{ id: 'x', type: 'service', position: { x: 0, y: 0 }, data: { name: 'a'.repeat(5000) } }],
        edges: [],
      };
      const { status } = await internalCall(port, RESTORE_PATH, { method: 'POST', token: bearer(), body: big });
      assert.equal(status, 413);
      assert.deepEqual((await internalCall(port, SNAPSHOT_PATH, { token: bearer() })).json, seed);
    },
    { maxMessageBytes: 2048 },
  );
});

test('un message WebSocket au-delà de la limite ferme la connexion (code 1009)', async () => {
  await withServer(
    { seed },
    async ({ wsUrl, port }) => {
      const code = await new Promise((resolve, reject) => {
        const socket = new WebSocket(wsUrl);
        const timeout = setTimeout(() => reject(new Error('la connexion est restée ouverte')), 3000);
        socket.on('open', () => socket.send(Buffer.alloc(4096)));
        socket.on('close', (closeCode) => {
          clearTimeout(timeout);
          resolve(closeCode);
        });
        socket.on('error', () => {});
      });
      assert.equal(code, 1009);
      // Le serveur a survécu : un client mal élevé ne coupe pas les autres canvas.
      assert.equal((await internalCall(port, SNAPSHOT_PATH, { token: bearer() })).status, 200);
    },
    { maxMessageBytes: 1024 },
  );
});
