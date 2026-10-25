/**
 * Outils communs aux tests du serveur temps réel : faux backend HTTP, tickets, clients Hocuspocus.
 * (Ce fichier ne contient aucun test ; `npm test` ne lance que les fichiers `*.test.js`.)
 */
import http from 'node:http';

import { HocuspocusProvider } from '@hocuspocus/provider';
import { createCanvasServer } from '../src/index.js';
import { SignJWT } from 'jose';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { WebSocket } from 'ws';

export const TICKET_SECRET = 'test-ticket-secret-0123456789abcdef0123456789abcdef';
export const SERVICE_TOKEN = 'test-service-token';
/** Les routes internes n'acceptent que des UUID. */
export const CANVAS_ID = '2f0e3c1a-5d6b-4c7e-8f90-a1b2c3d4e5f6';

/**
 * Faux backend : sert `state` (base64) ou `seed`, enregistre l'état écrit par le serveur temps réel
 * et retient l'en-tête `Authorization` reçu.
 */
export function createFakeBackend({ seed = null, state = null } = {}) {
  let stored = state;
  let lastAuthorization = null;
  let putCount = 0;
  /** Comportements modifiables par un test : pannes d'écriture et réponse à la lecture de l'état. */
  const behaviour = { putFailuresLeft: 0, putFailureStatus: 503, stateStatus: 200, putDelayMs: 0 };
  /**
   * Revérification des accès (`POST .../access`) : par défaut tout le monde garde l'accès en écriture ; un test peut
   * retirer des personnes (`access.revoked`) ou faire échouer la route (`access.status`).
   */
  const access = { status: 200, revoked: new Set(), calls: 0 };
  const server = http.createServer((req, res) => {
    lastAuthorization = req.headers.authorization ?? null;
    if (req.method === 'POST' && /^\/internal\/canvases\/[^/]+\/access$/.test(req.url)) {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        access.calls += 1;
        if (access.status !== 200) {
          res.writeHead(access.status).end();
          return;
        }
        const roles = {};
        for (const id of JSON.parse(body).userIds) if (!access.revoked.has(id)) roles[id] = 'WRITE';
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ roles }));
      });
      return;
    }
    if (!/^\/internal\/canvases\/[^/]+\/state$/.test(req.url)) {
      res.writeHead(404).end();
      return;
    }
    if (req.method === 'GET') {
      if (behaviour.stateStatus !== 200) {
        res.writeHead(behaviour.stateStatus).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ state: stored, seed }));
    } else if (req.method === 'PUT') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        putCount += 1;
        const payload = JSON.parse(body).state;
        setTimeout(() => {
          if (behaviour.putFailuresLeft > 0) {
            behaviour.putFailuresLeft -= 1;
            res.writeHead(behaviour.putFailureStatus).end();
            return;
          }
          stored = payload;
          res.writeHead(204).end();
        }, behaviour.putDelayMs);
      });
    } else {
      res.writeHead(405).end();
    }
  });

  return {
    start: () => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)),
    url: () => `http://127.0.0.1:${server.address().port}`,
    stored: () => stored,
    putCount: () => putCount,
    behaviour,
    access,
    lastAuthorization: () => lastAuthorization,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

export async function signTicket({ canvasId = CANVAS_ID, role = 'WRITE', userId = 'user-1' } = {}) {
  const key = new TextEncoder().encode(TICKET_SECRET);
  return new SignJWT({ sub: userId, cid: canvasId, role, name: 'Utilisateur', color: '#1265DD' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('lonkoo-backend')
    .setAudience('lonkoo-realtime')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

export function makeProvider(url, token, canvasId = CANVAS_ID, WebSocketPolyfill = WebSocket) {
  const doc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url,
    name: canvasId,
    document: doc,
    token,
    awareness: new Awareness(doc),
    WebSocketPolyfill,
  });
  return { provider, doc };
}

export function waitForSync(provider, ms = 5000) {
  if (provider.isSynced) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout de synchronisation')), ms);
    provider.on('synced', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

/** Attend qu'une condition devienne vraie (testée toutes les 25 ms). */
export async function waitFor(condition, ms = 5000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('condition non atteinte à temps');
}

/** Appel HTTP vers une route interne du serveur temps réel. */
export async function internalCall(port, path, { method = 'GET', token = SERVICE_TOKEN, body } = {}) {
  const headers = {};
  if (token !== null) headers.Authorization = token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // corps non JSON : on garde le texte
  }
  return { status: response.status, headers: response.headers, json, text };
}

export const bearer = (token = SERVICE_TOKEN) => `Bearer ${token}`;

/** Démarre un faux backend et un serveur temps réel, exécute `body`, puis arrête tout. */
export async function withServer(backendOptions, body, serverOptions = {}) {
  const backend = createFakeBackend(backendOptions);
  await backend.start();
  const server = createCanvasServer({
    backendUrl: backend.url(),
    serviceToken: SERVICE_TOKEN,
    ticketSecret: TICKET_SECRET,
    port: 0,
    storeDebounceMs: 50,
    storeMaxDebounceMs: 200,
    storeRetryDelaysMs: [10, 10, 10],
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
