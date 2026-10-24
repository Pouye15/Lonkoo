import test from 'node:test';
import assert from 'node:assert/strict';

import { WebSocket } from 'ws';

import { CANVAS_ID, bearer, internalCall, makeProvider, signTicket, waitFor, waitForSync, withServer } from './helpers.js';

const seed = { schemaVersion: 1, meta: { name: 'Canvas test' }, nodes: [], edges: [] };
const CLOSE_PATH = `/internal/canvases/${CANVAS_ID}/close`;
const close = (port, body) => internalCall(port, CLOSE_PATH, { method: 'POST', token: bearer(), body });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Branche un client avec un ticket donné et note ce qui lui arrive. */
async function connect(wsUrl, ticket, canvasId = CANVAS_ID) {
  const seen = { closed: 0, authFailures: 0, socketCloseCodes: [] };
  // Les sockets ouvertes par ce client, pour voir si le serveur les ferme vraiment (et avec quel code).
  class SpySocket extends WebSocket {
    constructor(...args) {
      super(...args);
      this.on('close', (code) => seen.socketCloseCodes.push(code));
    }
  }
  const client = makeProvider(wsUrl, ticket, canvasId, SpySocket);
  client.provider.on('close', () => {
    seen.closed += 1;
  });
  client.provider.on('authenticationFailed', () => {
    seen.authFailures += 1;
  });
  return { ...client, seen };
}

test("retirer un membre coupe seulement ses connexions et lui refuse son ancien ticket", async () => {
  await withServer({ seed }, async ({ port, wsUrl }) => {
    const removedTicket = await signTicket({ userId: 'membre-retire' });
    const staying = await connect(wsUrl, await signTicket({ userId: 'membre-reste' }));
    const removed = await connect(wsUrl, removedTicket);
    await waitForSync(staying.provider);
    await waitForSync(removed.provider);

    assert.equal((await close(port, { userId: 'membre-retire' })).status, 204);

    await waitFor(() => removed.seen.closed > 0);
    await waitFor(() => removed.seen.socketCloseCodes.includes(4403));
    assert.deepEqual(staying.seen.socketCloseCodes, [], "la socket d'un autre membre reste ouverte");
    await waitFor(() => removed.seen.authFailures > 0, 8000);
    assert.ok(removed.seen.authFailures > 0, "le même ticket ne rouvre pas l'accès");
    assert.equal(staying.seen.closed, 0, 'les autres membres ne sont pas déconnectés');
    assert.equal(staying.provider.isSynced, true);

    // Un client qui rejoue l'ancien ticket depuis zéro est refusé aussi.
    const replay = await connect(wsUrl, removedTicket);
    await waitFor(() => replay.seen.authFailures > 0, 8000);
    assert.equal(replay.provider.isSynced, false);

    removed.provider.destroy();
    replay.provider.destroy();
    staying.provider.destroy();
  });
});

test('un ticket émis après le retrait (la personne est revenue) est accepté', async () => {
  await withServer({ seed }, async ({ port, wsUrl }) => {
    assert.equal((await close(port, { userId: 'revenant' })).status, 204);
    // Les tickets datent de la seconde : un ticket de la même seconde que le retrait est refusé.
    await sleep(1100);

    const back = await connect(wsUrl, await signTicket({ userId: 'revenant' }));
    await waitForSync(back.provider);
    assert.equal(back.seen.authFailures, 0);
    back.provider.destroy();
  });
});

test("la révocation d'un membre ne touche ni un autre canvas ni un autre membre", async () => {
  await withServer({ seed }, async ({ port, wsUrl }) => {
    const OTHER_CANVAS = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
    assert.equal((await close(port, { userId: 'membre-retire' })).status, 204);

    const elsewhere = await connect(wsUrl, await signTicket({ userId: 'membre-retire', canvasId: OTHER_CANVAS }), OTHER_CANVAS);
    const another = await connect(wsUrl, await signTicket({ userId: 'autre-membre' }));
    await waitForSync(another.provider);
    assert.equal(another.seen.authFailures, 0);
    await waitForSync(elsewhere.provider);
    assert.equal(elsewhere.seen.authFailures, 0, 'un autre canvas reste accessible à cette personne');
    elsewhere.provider.destroy();
    another.provider.destroy();
  });
});

test("une fermeture sans identifiant déconnecte tout le monde, comme avant", async () => {
  await withServer({ seed }, async ({ port, wsUrl }) => {
    const ticketA = await signTicket({ userId: 'a' });
    const first = await connect(wsUrl, ticketA);
    const second = await connect(wsUrl, await signTicket({ userId: 'b' }));
    await waitForSync(first.provider);
    await waitForSync(second.provider);

    assert.equal((await internalCall(port, CLOSE_PATH, { method: 'POST', token: bearer() })).status, 204);
    await waitFor(() => first.seen.closed > 0 && second.seen.closed > 0);

    // Sans identifiant, rien n'est révoqué : les mêmes tickets servent à rouvrir une session.
    const again = await connect(wsUrl, ticketA);
    await waitForSync(again.provider);
    assert.equal(again.seen.authFailures, 0);
    first.provider.destroy();
    second.provider.destroy();
    again.provider.destroy();
  });
});

test("une demande de fermeture mal formée est refusée sans rien fermer", async () => {
  await withServer({ seed }, async ({ port, wsUrl }) => {
    const client = await connect(wsUrl, await signTicket({ userId: 'a' }));
    await waitForSync(client.provider);

    for (const body of [{ userId: 42 }, { userId: '' }, { userId: 'a'.repeat(65) }, { userId: 'a b' }, [], 'null', '{pas du json']) {
      const { status } = await close(port, body);
      assert.equal(status, 400, JSON.stringify(body));
    }
    assert.equal(client.seen.closed, 0, 'une demande refusée ne déconnecte personne');
    client.provider.destroy();
  });
});
