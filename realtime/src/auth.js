/**
 * Vérification des tickets temps réel (JWT HS256 signés par le backend) et du jeton de service
 * exigé par les routes HTTP internes.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import { jwtVerify } from 'jose';

const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest();

/**
 * Retourne une fonction qui dit si un en-tête `Authorization` porte le jeton de service attendu
 * (`Bearer <jeton>`). Les deux jetons sont réduits à leur empreinte avant d'être comparés : la
 * comparaison se fait en temps constant, quelle que soit leur longueur.
 *
 * @param {string} expected Jeton de service (REALTIME_SERVICE_TOKEN).
 */
export function createServiceTokenVerifier(expected) {
  if (typeof expected !== 'string' || expected.trim() === '') {
    throw new Error('REALTIME_SERVICE_TOKEN ne doit pas être vide');
  }
  const expectedHash = sha256(expected);
  return function hasServiceToken(authorization) {
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      return false;
    }
    return timingSafeEqual(sha256(authorization.slice('Bearer '.length)), expectedHash);
  };
}

/**
 * Retourne une fonction qui vérifie un ticket JWT pour un canvas donné.
 *
 * @param {string} secret Secret de signature (REALTIME_TICKET_SECRET).
 */
export function createTicketVerifier(secret) {
  const key = new TextEncoder().encode(secret);
  return async function verifyTicket(token, documentName) {
    if (!token) {
      throw new Error('ticket manquant');
    }
    // L'algorithme est imposé : celui que signe le backend (RealtimeTicketService), aucun autre.
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      audience: 'lonkoo-realtime',
      issuer: 'lonkoo-backend',
    });
    if (payload.cid !== documentName) {
      throw new Error('ticket pour un autre canvas');
    }
    return payload;
  };
}