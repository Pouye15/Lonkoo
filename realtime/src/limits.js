/**
 * Limites du canvas en direct (A-18) : ce qu'une connexion peut envoyer, et la taille que peut prendre un document.
 *
 * Deux protections, qui ne se recouvrent pas :
 *   1. Le débit d'une connexion (`createMessageBudget`) : trop de messages ou trop d'octets en peu de temps ferme la
 *      connexion (code 4429). Un navigateur normal reste très en dessous : les curseurs partent au plus 20 fois par
 *      seconde, et les modifications du document une fois par geste.
 *   2. La taille du document (`createDocumentSizeGuard`) : une modification qui ferait dépasser le plafond est refusée et
 *      la connexion qui l'a envoyée est fermée (code 4413). Déplacer un bloc ne fait pas grossir le document (mesuré :
 *      un million de déplacements, état inchangé) ; seuls l'ajout de contenu et les cycles ajout/suppression le font.
 *
 * Mode : `enforce` applique, `log` journalise sans rien refuser (sert à calibrer sur le vrai trafic), `off` désactive.
 * Une valeur numérique à 0 désactive la limite correspondante.
 */
import * as Y from 'yjs';

/** Fermeture « trop de messages » : la connexion dépasse son budget de débit. */
export const CLOSE_TOO_MANY_MESSAGES = { code: 4429, reason: 'Trop de modifications' };

/** Fermeture « canvas trop volumineux » : la modification ferait dépasser le plafond du document. */
export const CLOSE_CANVAS_TOO_LARGE = { code: 4413, reason: 'Canvas trop volumineux' };

export const LIMIT_MODES = ['enforce', 'log', 'off'];

const MIB = 1024 * 1024;

export const DEFAULT_LIMITS = Object.freeze({
  mode: 'enforce',
  /** Débit moyen toléré par connexion (messages par seconde) ; la rafale admise vaut le triple. */
  messagesPerSecond: 100,
  /** Octets reçus par connexion et par fenêtre de `windowMs`. Un message seul peut en faire 2 Mio au plus. */
  bytesPerWindow: 4 * MIB,
  windowMs: 10_000,
  /**
   * Plafond « souple » de l'état Yjs d'un document (octets). Au-dessus, seules les petites modifications (déplacer,
   * supprimer, renommer) passent, pour qu'un canvas trop plein puisse encore être allégé ; au-dessus du double, plus rien.
   * Mesure de référence : un canvas de 200 blocs et 500 liens pèse bien moins de 1 Mio.
   */
  maxDocumentBytes: 4 * MIB,
  /** Une modification au plus de cette taille passe tant que le plafond dur n'est pas atteint. */
  smallUpdateBytes: 4096,
  /** La taille du document est remesurée après autant d'octets reçus, ou de millisecondes écoulées. */
  remeasureBytes: 256 * 1024,
  remeasureMs: 2000,
});

/** Complète les valeurs données avec celles par défaut et refuse ce qui n'a pas de sens (démarrage impossible). */
export function resolveLimits(overrides = {}) {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  if (!LIMIT_MODES.includes(limits.mode)) {
    throw new Error(`mode de limites inconnu « ${limits.mode} » (attendu : ${LIMIT_MODES.join(', ')})`);
  }
  for (const key of Object.keys(DEFAULT_LIMITS)) {
    if (key === 'mode') continue;
    if (!Number.isFinite(limits[key]) || limits[key] < 0) {
      throw new Error(`limite « ${key} » invalide : ${limits[key]} (attendu : un nombre positif ou nul)`);
    }
  }
  return limits;
}

/** Lit les limites dans l'environnement (REALTIME_LIMITS_MODE, REALTIME_MAX_*). Une valeur absente garde le défaut. */
export function limitsFromEnv(env) {
  const number = (name) => {
    const raw = env[name];
    if (raw === undefined || raw === '') return undefined;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${name} doit être un entier positif ou nul (reçu : « ${raw} »)`);
    }
    return value;
  };
  const overrides = {
    mode: env.REALTIME_LIMITS_MODE || undefined,
    messagesPerSecond: number('REALTIME_MAX_MESSAGES_PER_SECOND'),
    bytesPerWindow: number('REALTIME_MAX_BYTES_PER_10S'),
    maxDocumentBytes: number('REALTIME_MAX_STATE_BYTES'),
  };
  for (const key of Object.keys(overrides)) {
    if (overrides[key] === undefined) delete overrides[key];
  }
  return resolveLimits(overrides);
}

/**
 * Budget de débit d'une connexion : deux seaux à jetons (messages, octets) qui se remplissent en continu.
 * `take(octets)` retire un message ; il rend `null` s'il passe, sinon `'messages'` ou `'bytes'` (le seau vide).
 * Un seau à jetons laisse passer une rafale (ouverture du canvas, collage) mais plus un débit soutenu.
 */
export function createMessageBudget(limits, now = Date.now) {
  const messageBurst = limits.messagesPerSecond * 3;
  const bytesPerSecond = limits.bytesPerWindow / (limits.windowMs / 1000);
  let messages = messageBurst;
  let bytes = limits.bytesPerWindow;
  let last = now();
  return {
    take(size) {
      const current = now();
      const elapsedSeconds = Math.max(0, current - last) / 1000;
      last = current;
      messages = Math.min(messageBurst, messages + elapsedSeconds * limits.messagesPerSecond);
      bytes = Math.min(limits.bytesPerWindow, bytes + elapsedSeconds * bytesPerSecond);
      // Un message refusé ne consomme rien : sans cela, un flot qui continue creuserait une dette que le calme qui suit
      // mettrait aussi longtemps à combler (visible en mode « log », où la connexion n'est pas coupée).
      if (limits.messagesPerSecond > 0 && messages < 1) return 'messages';
      if (limits.bytesPerWindow > 0 && bytes < size) return 'bytes';
      messages -= 1;
      bytes -= size;
      return null;
    },
  };
}

// --- Lecture du début d'un message du protocole Hocuspocus : [nom du document][type][sous-type de synchronisation] ---

const MESSAGE_SYNC = 0;
const MESSAGE_SYNC_REPLY = 4;
const SYNC_STEP_2 = 1;
const SYNC_UPDATE = 2;

/** Entier de longueur variable (lib0) lu à `offset` ; `null` si le message est tronqué ou absurde. */
function readVarUint(bytes, offset) {
  let value = 0;
  for (let index = offset, shift = 0; index < bytes.length && shift < 35; index++, shift += 7) {
    const byte = bytes[index];
    value += (byte & 0x7f) * 2 ** shift;
    if (byte < 0x80) return { value, next: index + 1 };
  }
  return null;
}

/**
 * Vrai si ce message brut (tel que reçu sur la socket) porte une écriture dans le document : synchronisation de type
 * « étape 2 » ou « mise à jour ». Les curseurs (awareness), les demandes de présence et les premières étapes de
 * synchronisation (un vecteur d'état, tout petit) n'y grossissent rien. Le type « réponse de synchronisation » (4) est
 * traité par Hocuspocus comme une synchronisation ordinaire : il compte lui aussi, sans quoi il servirait à contourner.
 * Un message illisible rend faux : Hocuspocus le rejette lui-même.
 */
export function isDocumentWrite(message) {
  const name = readVarUint(message, 0);
  if (!name) return false;
  const type = readVarUint(message, name.next + name.value);
  if (!type || (type.value !== MESSAGE_SYNC && type.value !== MESSAGE_SYNC_REPLY)) return false;
  const subtype = readVarUint(message, type.next);
  return subtype !== null && (subtype.value === SYNC_STEP_2 || subtype.value === SYNC_UPDATE);
}

/**
 * Garde de taille des documents. La taille de l'état est mesurée (encodage Yjs, la même que celle enregistrée) à la
 * première écriture, puis tous les `remeasureBytes` octets reçus ou `remeasureMs` millisecondes : mesurer à chaque
 * message coûterait de l'ordre de 10 ms pour 640 Kio. Entre deux mesures, la taille connue peut être en retard
 * d'au plus `remeasureBytes` plus une modification, ce que le plafond dur (le double du plafond) absorbe largement.
 *
 * `refuses(document, octets)` dit si une écriture de cette taille doit être refusée :
 *   - une grosse modification est refusée si l'état connu, augmenté de sa taille, dépasserait le plafond ;
 *   - une petite modification (≤ `smallUpdateBytes`) passe tant que l'état n'atteint pas le double du plafond.
 * Un refus s'appuie toujours sur une mesure fraîche : après avoir allégé un canvas, on ne refuse pas à tort sur une taille
 * périmée. La mesure coûte quelques millisecondes et ne se fait qu'au moment de refuser, donc une fois par connexion coupée.
 */
export function createDocumentSizeGuard(limits, { now = Date.now, measure = (document) => Y.encodeStateAsUpdate(document).length } = {}) {
  const entries = new WeakMap();
  return {
    refuses(document, updateBytes) {
      if (!(limits.maxDocumentBytes > 0)) return false;
      let entry = entries.get(document);
      if (!entry) {
        entry = { size: 0, measuredAt: Number.NEGATIVE_INFINITY, received: 0 };
        entries.set(document, entry);
      }
      const remeasure = () => {
        entry.size = measure(document);
        entry.measuredAt = now();
        entry.received = 0;
      };
      const tooBig = () =>
        updateBytes <= limits.smallUpdateBytes
          ? entry.size >= 2 * limits.maxDocumentBytes
          : entry.size + updateBytes > limits.maxDocumentBytes;

      entry.received += updateBytes;
      const measuredNow = entry.received >= limits.remeasureBytes || now() - entry.measuredAt >= limits.remeasureMs;
      if (measuredNow) remeasure();
      if (!tooBig()) return false;
      if (!measuredNow) {
        remeasure();
        return tooBig();
      }
      return true;
    },
  };
}
