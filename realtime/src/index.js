/**
 * Serveur de collaboration temps réel Lonkoo (Hocuspocus + Yjs).
 *
 * Un seul serveur HTTP (même port) gère :
 *   - l'upgrade WebSocket (`/`, ou `/ws` si un proxy ne retire pas le préfixe) pour l'édition
 *     collaborative ;
 *   - les routes HTTP internes backend -> realtime, protégées par le jeton de service
 *     (`Authorization: Bearer <REALTIME_SERVICE_TOKEN>`) :
 *       GET  /internal/canvases/{id}/snapshot  -> instantané JSON du contrat
 *       POST /internal/canvases/{id}/restore   -> remplace le contenu en transaction
 *       POST /internal/canvases/{id}/close     -> ferme les connexions ouvertes sur ce canvas ;
 *                                                 avec `{"userId": "..."}`, seulement celles de cette personne
 *                                                 (socket comprise), dont les tickets déjà émis sont refusés ;
 *                                                 avec `{"exceptUserIds": [...]}`, celles de tous sauf ces membres
 *   - GET /health (sans jeton) : 200 en service, 503 pendant l'arrêt.
 *
 * Arrêt propre (SIGTERM, SIGINT) : plus de nouvelle connexion, connexions fermées, tous les
 * documents ouverts enregistrés auprès du backend avant la sortie.
 *
 * Hooks :
 *   - onAuthenticate : vérifie le ticket JWT (signature, expiration, audience,
 *     cid == documentName), refuse celui d'une personne dont l'accès a été retiré depuis son émission,
 *     et active la lecture seule pour les rôles lecture.
 *   - onLoadDocument : charge l'état depuis le backend ; sinon initialise depuis
 *     le seed (modèle d'exemple).
 *   - onStoreDocument : réécrit l'état Yjs (base64) vers le backend, avec debounce.
 *   - beforeHandleMessage : refuse l'écriture qui ferait dépasser la taille maximale du document (limites.js).
 *
 * Limites (A-18, voir limits.js) : débit par connexion (fermeture 4429) et taille du document (fermeture 4413).
 */
import http from 'node:http';

import { Hocuspocus } from '@hocuspocus/server';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';

import { createBackendClient, isRetryable } from './backendClient.js';
import { createServiceTokenVerifier, createTicketVerifier } from './auth.js';
import {
  applySeed,
  assertSnapshotShape,
  InvalidSnapshotError,
  migrateLegacyCanvas,
  replaceWithSnapshot,
  yjsToSnapshot,
} from './canvasCodec.js';
import {
  CLOSE_CANVAS_TOO_LARGE,
  CLOSE_TOO_MANY_MESSAGES,
  createDocumentSizeGuard,
  createMessageBudget,
  isDocumentWrite,
  limitsFromEnv,
  resolveLimits,
} from './limits.js';

const READ_ONLY_ROLES = new Set(['READ', 'TRIAGE']);

/** Chemins acceptés pour le WebSocket : la racine, ou `/ws` si le proxy ne retire pas le préfixe. */
const WEBSOCKET_PATHS = new Set(['/', '/ws']);

/** Les canvas sont identifiés par un UUID (celui du backend) ; tout autre identifiant est refusé en 404. */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const INTERNAL_SNAPSHOT_PATH = new RegExp(`^/internal/canvases/(${UUID})/snapshot$`, 'i');
const INTERNAL_RESTORE_PATH = new RegExp(`^/internal/canvases/(${UUID})/restore$`, 'i');
const INTERNAL_CLOSE_PATH = new RegExp(`^/internal/canvases/(${UUID})/close$`, 'i');

/** Identifiant de personne accepté dans une demande de fermeture (un UUID du backend en production). */
const USER_ID = /^[0-9A-Za-z_-]{1,64}$/;

/** Nombre maximal de membres dans une demande « tous sauf ceux-ci » (un projet n'en a que quelques-uns). */
const MAX_KEPT_USERS = 1000;

/** Fermeture « accès refusé » (code 4403, comme `Forbidden` de Hocuspocus). */
const FORBIDDEN = { code: 4403, reason: 'Forbidden' };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Rejoue `action` après chaque attente de `delaysMs` tant que l'erreur peut passer (backend injoignable ou en 5xx). */
async function withRetry(action, delaysMs) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await action();
    } catch (err) {
      if (!isRetryable(err) || attempt >= delaysMs.length) throw err;
      await sleep(delaysMs[attempt]);
    }
  }
}

/** Erreur qui se traduit en un statut HTTP précis. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Convertit le payload « message » de ws en Uint8Array. */
function toUint8Array(data) {
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(data);
}

/** Lit le corps d'une requête HTTP (au plus `maxBytes` octets) et le décode en JSON. */
function readJsonBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const tooBig = () => new HttpError(413, `corps trop gros (maximum ${maxBytes} octets)`);
    if (Number(request.headers['content-length']) > maxBytes) {
      reject(tooBig());
      return;
    }
    const chunks = [];
    let size = 0;
    let rejected = false;
    request.on('data', (chunk) => {
      if (rejected) return;
      size += chunk.length;
      if (size > maxBytes) {
        rejected = true;
        chunks.length = 0;
        reject(tooBig());
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (rejected) return;
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new HttpError(400, 'corps JSON invalide'));
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

/** Refuse une demande d'upgrade avec une vraie réponse HTTP, puis ferme la connexion. */
function rejectUpgrade(socket, status, message) {
  const body = JSON.stringify({ error: message });
  // Le socket remis à l'évènement « upgrade » n'a pas de gestionnaire d'erreur : un client qui coupe
  // avant la fin (ECONNRESET) ferait tomber tout le processus.
  socket.on('error', () => {});
  socket.end(
    `HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  );
}

/**
 * Construit le serveur temps réel.
 *
 * @param {object} options
 * @param {string} options.backendUrl    Adresse du backend vue depuis realtime.
 * @param {string} options.serviceToken  Jeton de service (routes /internal, dans les deux sens).
 * @param {string} options.ticketSecret  Secret de signature des tickets.
 * @param {number} [options.port]        Port d'écoute (défaut 1234).
 * @param {number} [options.storeDebounceMs]     Attente avant d'enregistrer après une modification (3 s).
 * @param {number} [options.storeMaxDebounceMs]  Attente maximale sous modifications continues (15 s).
 * @param {number} [options.maxMessageBytes]     Taille maximale d'un message WebSocket et d'un corps HTTP (2 Mio).
 * @param {number[]} [options.storeRetryDelaysMs]    Attentes entre les tentatives d'enregistrement (1 s, 2 s, 4 s).
 * @param {number[]} [options.shutdownRetryDelaysMs] Idem pendant l'arrêt, plus court : Docker laisse 10 s (0,5 s).
 * @param {number} [options.backendTimeoutMs]        Délai maximal d'un appel au backend (5 s).
 * @param {number} [options.revocationMemoryMs]      Durée pendant laquelle un accès retiré est retenu (10 min :
 *                                                   un ticket vit 5 min, il n'a plus d'effet après).
 * @param {number} [options.accessCheckIntervalMs]   Intervalle de revérification des accès des personnes connectées
 *                                                   auprès du backend (30 s ; 0 pour ne pas le faire).
 * @param {object} [options.limits]                  Limites du canvas en direct (voir `DEFAULT_LIMITS` dans limits.js) :
 *                                                   mode `enforce`, `log` ou `off`, débit par connexion, taille du document.
 */
export function createCanvasServer({
  backendUrl,
  serviceToken,
  ticketSecret,
  port = 1234,
  storeDebounceMs = 3000,
  storeMaxDebounceMs = 15000,
  maxMessageBytes = 2 * 1024 * 1024,
  storeRetryDelaysMs = [1000, 2000, 4000],
  shutdownRetryDelaysMs = [500],
  backendTimeoutMs = 5000,
  revocationMemoryMs = 10 * 60 * 1000,
  accessCheckIntervalMs = 30 * 1000,
  limits: limitOverrides = {},
}) {
  const limits = resolveLimits(limitOverrides);
  const documentSizeGuard = createDocumentSizeGuard(limits);
  const backend = createBackendClient(backendUrl, serviceToken, { timeoutMs: backendTimeoutMs });
  const verifyTicket = createTicketVerifier(ticketSecret);
  const hasServiceToken = createServiceTokenVerifier(serviceToken);
  let shuttingDown = false;
  let shutdownPromise = null;

  /**
   * Accès retirés : clé `canvas:personne` (cette personne) ou `canvas:*` (tout le monde sauf `keep`, quand un projet
   * public repasse en privé), valeur : instant du retrait. Un ticket est un JWT valable 5 minutes que le serveur ne
   * revérifie pas auprès du backend : sans cette mémoire, qui a perdu l'accès pourrait se reconnecter avec le ticket
   * qu'il détient déjà. Elle est perdue à l'arrêt du serveur, ce qui est sans conséquence : toutes les connexions
   * tombent aussi, et au retour un ticket neuf est exigé du backend.
   */
  const revocations = new Map();

  function remember(key, keep) {
    const now = Date.now();
    for (const [other, entry] of revocations) {
      if (now - entry.at > revocationMemoryMs) revocations.delete(other);
    }
    revocations.set(key, { at: now, keep });
  }

  function revokeAccess(documentName, userId) {
    remember(`${documentName}:${userId}`, null);
  }

  function revokeAllExcept(documentName, keepUserIds) {
    remember(`${documentName}:*`, new Set(keepUserIds));
  }

  /** Vrai si ce ticket a été émis (à la seconde près) avant ou pendant le retrait de l'accès. */
  function isRevoked(documentName, userId, issuedAtSeconds) {
    const now = Date.now();
    for (const entry of [revocations.get(`${documentName}:${userId}`), revocations.get(`${documentName}:*`)]) {
      if (!entry || now - entry.at > revocationMemoryMs || entry.keep?.has(userId)) continue;
      if (!Number.isFinite(issuedAtSeconds) || issuedAtSeconds <= Math.floor(entry.at / 1000)) return true;
    }
    return false;
  }

  /**
   * Ferme les connexions à un document de toute personne pour qui `shouldClose(identifiant)` est vrai, socket
   * comprise : fermer seulement la connexion au document laisserait la socket ouverte, et un client mal
   * intentionné pourrait continuer d'y écrire.
   */
  function disconnectWhere(documentName, shouldClose) {
    const document = hocuspocus.documents.get(documentName);
    if (!document) return;
    for (const connection of [...document.connections.keys()]) {
      if (!shouldClose(connection.context?.user?.id)) continue;
      connection.close(FORBIDDEN);
      connection.webSocket.close(FORBIDDEN.code, FORBIDDEN.reason);
    }
  }

  /**
   * Revérifie auprès du backend l'accès de toutes les personnes connectées et coupe celles qui l'ont perdu. C'est le
   * filet de sécurité de la fermeture demandée par le backend (retrait d'un membre, projet repassé en privé) : si cette
   * demande ne nous a pas atteints, la connexion ouverte ne reste pas valable au-delà d'un intervalle. Une panne du
   * backend ne coupe personne : on réessaie à l'intervalle suivant.
   */
  let checkingAccess = false;
  async function checkAccess() {
    if (checkingAccess || shuttingDown) return;
    checkingAccess = true;
    try {
      for (const [documentName, document] of [...hocuspocus.documents]) {
        const userIds = [...new Set([...document.connections.keys()].map((c) => c.context?.user?.id).filter(Boolean))];
        if (userIds.length === 0) continue;
        try {
          const roles = await backend.getAccess(documentName, userIds);
          disconnectWhere(documentName, (id) => id !== undefined && !Object.hasOwn(roles, id));
        } catch (err) {
          console.warn(`[realtime] accès du canvas ${documentName} non revérifiés : ${err.message}`);
        }
      }
    } finally {
      checkingAccess = false;
    }
  }
  const accessTimer = accessCheckIntervalMs > 0 ? setInterval(checkAccess, accessCheckIntervalMs) : null;
  accessTimer?.unref();

  /**
   * Journalise une limite dépassée, au plus une fois par minute et par clé : un client qui inonde le serveur ne doit pas
   * aussi inonder les journaux.
   */
  const lastLimitWarning = new Map();
  function warnLimit(key, message) {
    const now = Date.now();
    for (const [other, at] of lastLimitWarning) {
      if (now - at > 60_000) lastLimitWarning.delete(other);
    }
    if (lastLimitWarning.has(key)) return;
    lastLimitWarning.set(key, now);
    const prefix = limits.mode === 'log' ? 'limite dépassée (mode log, rien n\'est refusé)' : 'limite appliquée';
    console.warn(`[realtime] ${prefix} : ${message}`);
  }

  /** Si le client ne répond pas à la fermeture qu'on lui demande, la socket est coupée au bout de 5 s. */
  function terminateLater(webSocket) {
    setTimeout(() => webSocket.terminate(), 5000).unref();
  }

  /** Enregistre l'état Yjs d'un document auprès du backend, avec de nouvelles tentatives si besoin. */
  async function persist(documentName, document, retryDelaysMs) {
    const base64 = Buffer.from(Y.encodeStateAsUpdate(document)).toString('base64');
    await withRetry(() => backend.putState(documentName, base64), retryDelaysMs);
  }

  const hocuspocus = new Hocuspocus({
    name: 'lonkoo-realtime',
    quiet: true,
    debounce: storeDebounceMs,
    maxDebounce: storeMaxDebounceMs,
    timeout: 20000,
    async onLoadDocument({ document, documentName }) {
      // Un canvas inconnu du backend (supprimé) lève une erreur : la connexion est refusée.
      const state = await backend.getState(documentName);
      if (state?.state) {
        Y.applyUpdate(document, Buffer.from(state.state, 'base64'));
        // Un état enregistré avec l'ancienne disposition (tableaux) passe au format du contrat.
        migrateLegacyCanvas(document);
      } else if (state?.seed) {
        applySeed(document, state.seed);
      }
      // Canvas sans état ni seed : document vide.
    },
    async onStoreDocument({ document, documentName }) {
      try {
        await persist(documentName, document, storeRetryDelaysMs);
      } catch (err) {
        console.error(`[realtime] échec de persistance du canvas ${documentName}:`, err.message);
      }
    },
    async beforeHandleMessage({ connection, document, documentName, update }) {
      // Une connexion en lecture seule n'écrit rien : Hocuspocus ignore ses modifications.
      if (limits.mode === 'off' || connection.readOnly || !isDocumentWrite(update)) return;
      if (!documentSizeGuard.refuses(document, update.length)) return;
      warnLimit(
        `taille:${documentName}`,
        `canvas ${documentName} trop volumineux, modification de ${update.length} octets refusée (plafond ${limits.maxDocumentBytes} octets)`,
      );
      if (limits.mode === 'log') return;
      // Lever l'erreur empêche d'appliquer la modification ; fermer la socket empêche d'insister (Hocuspocus ne ferme
      // que la connexion au document, pas la socket). L'erreur est un simple objet {code, reason}, comme `Forbidden` de
      // Hocuspocus : Hocuspocus le lit pour fermer la connexion, et ne journalise pas de pile d'appels.
      connection.webSocket.close(CLOSE_CANVAS_TOO_LARGE.code, CLOSE_CANVAS_TOO_LARGE.reason);
      terminateLater(connection.webSocket);
      throw { ...CLOSE_CANVAS_TOO_LARGE };
    },
    async onAuthenticate({ token, documentName, connectionConfig }) {
      const payload = await verifyTicket(token, documentName);
      if (isRevoked(documentName, payload.sub, payload.iat)) {
        throw new Error('accès retiré');
      }
      if (payload.role && READ_ONLY_ROLES.has(payload.role)) {
        connectionConfig.readOnly = true;
      }
      return {
        user: {
          id: payload.sub,
          name: payload.name,
          color: payload.color,
          role: payload.role,
        },
      };
    },
  });

  /** Routes internes : instantané, restauration et fermeture des connexions, réservées au backend. */
  async function handleInternal(request, response, snapshotMatch, restoreMatch, closeMatch) {
    if (!hasServiceToken(request.headers.authorization)) {
      sendJson(response, 401, { error: 'jeton de service manquant ou invalide' }, { 'WWW-Authenticate': 'Bearer' });
      return;
    }
    const isSnapshot = Boolean(snapshotMatch) && request.method === 'GET';
    const isRestore = Boolean(restoreMatch) && request.method === 'POST';
    const isClose = Boolean(closeMatch) && request.method === 'POST';
    if (!isSnapshot && !isRestore && !isClose) {
      sendJson(response, 405, { error: 'méthode non autorisée' });
      return;
    }
    if (isClose) {
      // Canvas supprimé : tous les clients sont déconnectés. Accès d'une personne retiré (`userId`) : seulement les
      // siens. Projet repassé en privé (`exceptUserIds`) : tous sauf les membres listés. Dans les deux cas, les
      // tickets déjà émis aux personnes sorties ne rouvrent plus rien.
      const documentName = closeMatch[1];
      const body = await readJsonBody(request, maxMessageBytes);
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new HttpError(400, 'corps JSON invalide');
      }
      if (body.userId !== undefined && body.exceptUserIds !== undefined) {
        throw new HttpError(400, 'userId et exceptUserIds sont exclusifs');
      }
      if (body.exceptUserIds !== undefined) {
        const keep = body.exceptUserIds;
        if (!Array.isArray(keep) || keep.length > MAX_KEPT_USERS || !keep.every((id) => typeof id === 'string' && USER_ID.test(id))) {
          throw new HttpError(400, 'exceptUserIds invalide');
        }
        revokeAllExcept(documentName, keep);
        const kept = new Set(keep);
        disconnectWhere(documentName, (id) => !kept.has(id));
      } else if (body.userId !== undefined) {
        if (typeof body.userId !== 'string' || !USER_ID.test(body.userId)) {
          throw new HttpError(400, 'userId invalide');
        }
        revokeAccess(documentName, body.userId);
        disconnectWhere(documentName, (id) => id === body.userId);
      } else {
        hocuspocus.closeConnections(documentName);
      }
      response.writeHead(204);
      response.end();
      return;
    }

    // Le corps est lu et vérifié avant d'ouvrir le document : un corps invalide ne charge rien.
    const snapshot = isRestore ? await readJsonBody(request, maxMessageBytes) : undefined;
    if (isRestore) {
      assertSnapshotShape(snapshot);
    }
    const direct = await hocuspocus.openDirectConnection((snapshotMatch ?? restoreMatch)[1]);
    try {
      if (isSnapshot) {
        sendJson(response, 200, yjsToSnapshot(direct.document));
      } else {
        await direct.transact(() => replaceWithSnapshot(direct.document, snapshot));
        response.writeHead(204);
        response.end();
      }
    } finally {
      await direct.disconnect();
    }
  }

  const httpServer = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const snapshotMatch = url.pathname.match(INTERNAL_SNAPSHOT_PATH);
      const restoreMatch = url.pathname.match(INTERNAL_RESTORE_PATH);
      const closeMatch = url.pathname.match(INTERNAL_CLOSE_PATH);
      if (url.pathname === '/health' && request.method === 'GET') {
        sendJson(response, shuttingDown ? 503 : 200, { status: shuttingDown ? 'STOPPING' : 'UP' });
        return;
      }
      if (!snapshotMatch && !restoreMatch && !closeMatch) {
        sendJson(response, 404, { error: 'not found' });
        return;
      }
      await handleInternal(request, response, snapshotMatch, restoreMatch, closeMatch);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : err instanceof InvalidSnapshotError ? 400 : 500;
      if (status === 500) {
        console.error('[realtime] erreur sur une route interne:', err);
      }
      if (!response.headersSent) {
        // Après un 413, le reste du corps n'est pas lu : on ferme la connexion.
        const headers = status === 413 ? { Connection: 'close' } : {};
        sendJson(response, status, { error: status === 500 ? 'erreur interne' : err.message }, headers);
      } else {
        response.end();
      }
    }
  });

  // `ws` accepte 100 Mio par message par défaut : un client muni d'un ticket valide pourrait épuiser la
  // mémoire. Au-delà de la limite, la connexion est fermée (code 1009).
  const wss = new WebSocketServer({ noServer: true, maxPayload: maxMessageBytes });

  httpServer.on('upgrade', (request, socket, head) => {
    if (shuttingDown) {
      rejectUpgrade(socket, 503, 'arrêt en cours');
      return;
    }
    // Une autre montée en protocole que WebSocket (par exemple HTTP/2 en clair, que le client HTTP de
    // Java tente par défaut) reçoit un refus net plutôt qu'une connexion coupée.
    if (String(request.headers.upgrade ?? '').toLowerCase() !== 'websocket') {
      rejectUpgrade(socket, 400, 'seul le protocole WebSocket est accepté');
      return;
    }
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!WEBSOCKET_PATHS.has(pathname)) {
      rejectUpgrade(socket, 404, 'not found');
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, request) => {
    const url = `http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`;
    const fetchRequest = new Request(url, { headers: request.headers });
    const clientConnection = hocuspocus.handleConnection(ws, fetchRequest);

    // Trame invalide, message trop gros… `ws` ferme déjà la connexion, mais sans écouteur d'erreur
    // l'exception ferait tomber tout le processus : un seul client pourrait couper tous les canvas.
    ws.on('error', (err) => {
      console.warn(`[realtime] connexion fermée sur erreur : ${err.message}`);
    });
    // Budget de débit : contrôlé avant que le message n'entre dans la file de Hocuspocus, pour qu'un flot de messages ne
    // s'y accumule pas. Une fois la connexion coupée, ce qui arrive encore est ignoré.
    const budget = limits.mode === 'off' ? null : createMessageBudget(limits);
    let cut = false;
    ws.on('message', (data) => {
      if (cut) return;
      const message = toUint8Array(data);
      const exceeded = budget?.take(message.length);
      if (exceeded) {
        warnLimit(
          'debit',
          exceeded === 'messages'
            ? `une connexion dépasse ${limits.messagesPerSecond} messages par seconde`
            : `une connexion dépasse ${limits.bytesPerWindow} octets par ${limits.windowMs / 1000} s`,
        );
        if (limits.mode === 'enforce') {
          cut = true;
          clientConnection.terminate(CLOSE_TOO_MANY_MESSAGES);
          terminateLater(ws);
          return;
        }
      }
      clientConnection.handleMessage(message);
    });
    ws.on('close', (code, reason) => {
      clientConnection.handleClose({ code, reason: reason?.toString() ?? '' });
    });
    ws.on('pong', () => {
      clientConnection.touch();
    });
  });

  function stop() {
    clearInterval(accessTimer);
    return new Promise((resolve) => {
      // Les connexions encore ouvertes (client qui n'a pas répondu à la fermeture) ne doivent pas bloquer l'arrêt.
      wss.clients.forEach((client) => client.terminate());
      wss.close(() => {
        httpServer.close(() => resolve());
      });
    });
  }

  /**
   * Arrêt propre : refuse les nouvelles connexions, ferme les existantes et enregistre tous les documents
   * ouverts (y compris ceux dont l'enregistrement différé n'avait pas encore eu lieu) avant de rendre la main.
   */
  function shutdown() {
    if (!shutdownPromise) {
      shuttingDown = true;
      shutdownPromise = (async () => {
        const open = [...hocuspocus.documents];
        hocuspocus.closeConnections();
        await Promise.allSettled(
          open.map(([name, document]) =>
            persist(name, document, shutdownRetryDelaysMs).catch((err) => {
              console.error(`[realtime] canvas ${name} non enregistré à l'arrêt:`, err.message);
            }),
          ),
        );
        await stop();
      })();
    }
    return shutdownPromise;
  }

  return {
    hocuspocus,
    shutdown,
    start() {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, () => {
          httpServer.removeListener('error', reject);
          resolve({ port: httpServer.address().port, hocuspocus });
        });
      });
    },
    stop,
  };
}

const isMain = process.argv[1] && process.argv[1].endsWith('index.js');
if (isMain) {
  const port = Number(process.env.REALTIME_PORT || process.env.PORT || 1234);
  const backendUrl = process.env.BACKEND_INTERNAL_URL || 'http://localhost:8080';
  const serviceToken = process.env.REALTIME_SERVICE_TOKEN;
  const ticketSecret = process.env.REALTIME_TICKET_SECRET;
  const storeDebounceMs = Number(process.env.REALTIME_STORE_DEBOUNCE_MS || 3000);
  const maxMessageBytes = Number(process.env.REALTIME_MAX_MESSAGE_BYTES || 2 * 1024 * 1024);

  if (!serviceToken || !ticketSecret) {
    console.error('REALTIME_SERVICE_TOKEN et REALTIME_TICKET_SECRET sont requis.');
    process.exit(1);
  }

  const limits = limitsFromEnv(process.env);

  const server = createCanvasServer({ backendUrl, serviceToken, ticketSecret, port, storeDebounceMs, maxMessageBytes, limits });
  server.start().then(() => {
    console.log(`[realtime] écoute sur ws://localhost:${port} (backend ${backendUrl})`);
  });

  // Docker laisse 10 s entre SIGTERM et SIGKILL : on enregistre les documents, puis on sort.
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      console.log(`[realtime] ${signal} reçu : arrêt propre`);
      const deadline = setTimeout(() => process.exit(1), 9000);
      server.shutdown().then(() => {
        clearTimeout(deadline);
        process.exit(0);
      });
    });
  }
}
