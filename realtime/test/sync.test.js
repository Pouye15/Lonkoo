import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { HocuspocusProvider } from '@hocuspocus/provider';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { SignJWT } from 'jose';
import { WebSocket } from 'ws';

import { createCanvasServer } from '../src/index.js';
import { applySeed, yjsToSnapshot } from '../src/canvasCodec.js';

const TICKET_SECRET = 'test-ticket-secret-0123456789abcdef0123456789abcdef';
const SERVICE_TOKEN = 'test-service-token';
const CANVAS_ID = 'canvas-test-sync';

/** Faux backend : sert le seed et enregistre l'état (base64). */
function createFakeBackend(seed) {
  let storedBase64 = null;
  const server = http.createServer((req, res) => {
    const match = req.url.match(/^\/internal\/canvases\/([^/]+)\/state$/);
    if (!match) {
      res.writeHead(404).end();
      return;
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        state: storedBase64,
        seed,
      }));
    } else if (req.method === 'PUT') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        storedBase64 = JSON.parse(body).state;
        res.writeHead(204).end();
      });
    } else {
      res.writeHead(405).end();
    }
  });

  return {
    server,
    start: () => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)),
    port: () => server.address().port,
    stored: () => storedBase64,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function signTicket(userId = 'user-1') {
  const key = new TextEncoder().encode(TICKET_SECRET);
  return new SignJWT({ sub: userId, cid: CANVAS_ID, role: 'WRITE', name: 'User', color: '#1265DD' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('lonkoo-backend')
    .setAudience('lonkoo-realtime')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

function makeProvider(url, token) {
  const doc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url,
    name: CANVAS_ID,
    document: doc,
    token,
    awareness: new Awareness(doc),
    WebSocketPolyfill: WebSocket,
  });
  return { provider, doc };
}

function waitForSync(provider) {
  if (provider.isSynced) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout synchronisation')), 5000);
    provider.on('synced', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function waitForRejection(provider) {
  return new Promise((resolve) => {
    provider.on('authenticationFailed', resolve);
  });
}

test('deux providers synchronisent, un mauvais ticket est refusé, l’état est persisté', async () => {
  const seed = {
    schemaVersion: 1,
    meta: { name: 'Canvas test' },
    nodes: [],
    edges: [],
  };

  const backend = createFakeBackend(seed);
  await backend.start();

  const canvasServer = createCanvasServer({
    backendUrl: `http://127.0.0.1:${backend.port()}`,
    serviceToken: SERVICE_TOKEN,
    ticketSecret: TICKET_SECRET,
    port: 0,
  });
  const started = await canvasServer.start();
  const url = `ws://127.0.0.1:${started.port}`;

  const token = await signTicket();
  const clientA = makeProvider(url, token);
  const clientB = makeProvider(url, token);

  await Promise.all([waitForSync(clientA.provider), waitForSync(clientB.provider)]);

  // La modification de A (transaction Yjs) se propage à B.
  applySeed(clientA.doc, {
    schemaVersion: 1,
    nodes: [{ id: 'n1', type: 'auth', position: { x: 1, y: 2 }, data: { name: 'connexion', method: 'otp-sms' } }],
    edges: [],
  });
  await new Promise((resolve) => setTimeout(resolve, 200));

  const snapshotB = yjsToSnapshot(clientB.doc);
  assert.equal(snapshotB.nodes.length, 1);
  assert.equal(snapshotB.nodes[0].id, 'n1');

  // L'état est persisté vers le faux backend (debounce 3 s).
  await new Promise((resolve) => setTimeout(resolve, 3500));
  assert.ok(backend.stored(), 'l’état Yjs doit être persisté côté backend');

  // Un mauvais ticket est refusé.
  const clientC = makeProvider(url, 'not-a-valid-token');
  await waitForRejection(clientC.provider);

  clientA.provider.destroy();
  clientB.provider.destroy();
  clientC.provider.destroy();

  await canvasServer.stop();
  await backend.stop();
});