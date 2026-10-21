import test from 'node:test';
import assert from 'node:assert/strict';

import * as Y from 'yjs';

import { yjsToSnapshot } from '../src/canvasCodec.js';
import {
  CANVAS_ID,
  bearer,
  internalCall,
  makeProvider,
  signTicket,
  waitFor,
  waitForSync,
  withServer,
} from './helpers.js';

const seed = {
  schemaVersion: 1,
  nodes: [{ id: 'n1', type: 'webapp', position: { x: 0, y: 0 }, data: { name: 'boutique' } }],
  edges: [],
};
const SNAPSHOT_PATH = `/internal/canvases/${CANVAS_ID}/snapshot`;
const CLOSE_PATH = `/internal/canvases/${CANVAS_ID}/close`;

const newNode = () =>
  new Y.Map([
    ['type', 'service'],
    ['position', { x: 1, y: 1 }],
    ['data', { name: 'api' }],
  ]);

test('la route de santé répond sans jeton', async () => {
  await withServer({ seed }, async ({ port }) => {
    const { status, json } = await internalCall(port, '/health', { token: null });
    assert.equal(status, 200);
    assert.deepEqual(json, { status: 'UP' });
  });
});

test("la fermeture des connexions d'un canvas exige le jeton et déconnecte les clients", async () => {
  await withServer({ seed }, async ({ port, wsUrl }) => {
    const client = makeProvider(wsUrl, await signTicket());
    await waitForSync(client.provider);
    let disconnected = false;
    client.provider.on('close', () => {
      disconnected = true;
    });

    assert.equal((await internalCall(port, CLOSE_PATH, { method: 'POST', token: null })).status, 401);
    assert.equal((await internalCall(port, CLOSE_PATH, { method: 'GET', token: bearer() })).status, 405);
    assert.equal(disconnected, false, 'un appel refusé ne déconnecte personne');

    assert.equal((await internalCall(port, CLOSE_PATH, { method: 'POST', token: bearer() })).status, 204);
    await waitFor(() => disconnected);
    client.provider.destroy();
  });
});

test('un canvas inconnu du backend (supprimé) refuse la connexion au lieu de rouvrir un document vide', async () => {
  await withServer({ seed }, async ({ backend, port, wsUrl }) => {
    backend.behaviour.stateStatus = 404;

    const client = makeProvider(wsUrl, await signTicket());
    await assert.rejects(() => waitForSync(client.provider, 1500), /timeout/);
    client.provider.destroy();

    assert.equal((await internalCall(port, SNAPSHOT_PATH, { token: bearer() })).status, 500);
  });
});

test("l'enregistrement est rejoué quand le backend est en panne passagère", async () => {
  await withServer({ seed }, async ({ backend, wsUrl }) => {
    backend.behaviour.putFailuresLeft = 2;
    const client = makeProvider(wsUrl, await signTicket());
    await waitForSync(client.provider);

    client.doc.getMap('nodes').set('n2', newNode());

    await waitFor(() => backend.stored() !== null);
    assert.equal(backend.putCount(), 3, 'deux échecs, puis un succès');
    client.provider.destroy();
  });
});

test("un refus du backend (4xx) n'est pas rejoué", async () => {
  await withServer({ seed }, async ({ backend, wsUrl }) => {
    backend.behaviour.putFailuresLeft = 10;
    backend.behaviour.putFailureStatus = 404;
    const client = makeProvider(wsUrl, await signTicket());
    await waitForSync(client.provider);

    client.doc.getMap('nodes').set('n2', newNode());

    await waitFor(() => backend.putCount() >= 1);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(backend.putCount(), 1);
    assert.equal(backend.stored(), null);
    client.provider.destroy();
  });
});

test("l'arrêt propre enregistre les modifications que le délai d'enregistrement n'avait pas encore écrites", async () => {
  await withServer(
    { seed },
    async ({ backend, port, wsUrl, server }) => {
      const client = makeProvider(wsUrl, await signTicket());
      await waitForSync(client.provider);
      client.doc.getMap('nodes').set('n2', newNode());
      await waitFor(async () => (await internalCall(port, SNAPSHOT_PATH, { token: bearer() })).json.nodes.length === 2);
      assert.equal(backend.stored(), null, 'rien de enregistré : le délai est de 60 s');
      // Une écriture lente : sans attente de l'arrêt, le serveur s'éteindrait avant qu'elle n'aboutisse.
      backend.behaviour.putDelayMs = 400;

      await server.shutdown();

      assert.notEqual(backend.stored(), null, 'enregistré pendant l’arrêt');
      const reloaded = new Y.Doc();
      Y.applyUpdate(reloaded, Buffer.from(backend.stored(), 'base64'));
      assert.deepEqual(yjsToSnapshot(reloaded).nodes.map((n) => n.id), ['n1', 'n2']);
      client.provider.destroy();
    },
    { storeDebounceMs: 60000, storeMaxDebounceMs: 60000 },
  );
});
