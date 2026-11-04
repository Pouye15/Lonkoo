import test from 'node:test';
import assert from 'node:assert/strict';

import { WebSocket } from 'ws';

import { CANVAS_ID, makeProvider, signTicket, waitFor, waitForSync, withServer } from './helpers.js';

const seed = { schemaVersion: 1, meta: { name: 'Canvas test' }, nodes: [], edges: [] };
const FAST = { accessCheckIntervalMs: 60 };

/** Branche un client et note si sa socket est fermée, et avec quel code. */
async function connect(wsUrl, userId) {
  const seen = { socketCloseCodes: [] };
  class SpySocket extends WebSocket {
    constructor(...args) {
      super(...args);
      this.on('close', (code) => seen.socketCloseCodes.push(code));
    }
  }
  const client = makeProvider(wsUrl, await signTicket({ userId }), CANVAS_ID, SpySocket);
  await waitForSync(client.provider);
  return { ...client, seen };
}

test("une personne qui a perdu l'accès est coupée même si la fermeture demandée par le backend ne l'a pas atteinte", async () => {
  await withServer(
    { seed },
    async ({ backend, wsUrl }) => {
      const staying = await connect(wsUrl, 'membre-reste');
      const removed = await connect(wsUrl, 'membre-retire');

      // Le backend a retiré la personne en base, mais aucune demande /close n'est arrivée : seule la revérification agit.
      backend.access.revoked.add('membre-retire');

      await waitFor(() => removed.seen.socketCloseCodes.includes(4403), 3000);
      assert.deepEqual(staying.seen.socketCloseCodes, [], 'les autres membres ne sont pas touchés');
      assert.equal(staying.provider.isSynced, true);

      removed.provider.destroy();
      staying.provider.destroy();
    },
    FAST,
  );
});

test("une panne du backend ne coupe personne, et la revérification reprend quand il revient", async () => {
  await withServer(
    { seed },
    async ({ backend, wsUrl }) => {
      const removed = await connect(wsUrl, 'membre-retire');
      backend.access.revoked.add('membre-retire');
      backend.access.status = 503;

      const callsBefore = backend.access.calls;
      await waitFor(() => backend.access.calls >= callsBefore + 3, 3000);
      assert.deepEqual(removed.seen.socketCloseCodes, [], 'pendant la panne la connexion reste ouverte');

      backend.access.status = 200;
      await waitFor(() => removed.seen.socketCloseCodes.includes(4403), 3000);

      removed.provider.destroy();
    },
    FAST,
  );
});

test("sans revérification demandée, le serveur n'interroge jamais le backend sur les accès", async () => {
  await withServer(
    { seed },
    async ({ backend, wsUrl }) => {
      const client = await connect(wsUrl, 'membre');
      backend.access.revoked.add('membre');
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(backend.access.calls, 0);
      assert.deepEqual(client.seen.socketCloseCodes, []);
      client.provider.destroy();
    },
    { accessCheckIntervalMs: 0 },
  );
});
