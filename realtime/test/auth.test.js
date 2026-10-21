import test from 'node:test';
import assert from 'node:assert/strict';

import { SignJWT } from 'jose';
import { createServiceTokenVerifier, createTicketVerifier } from '../src/auth.js';

const secret = 'test-ticket-secret-0123456789abcdef0123456789abcdef';
const key = new TextEncoder().encode(secret);

async function signTicket(claims) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('lonkoo-backend')
    .setAudience('lonkoo-realtime')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

test('un ticket valide est vérifié et expose son payload', async () => {
  const token = await signTicket({
    sub: 'user-123',
    cid: 'canvas-abc',
    role: 'WRITE',
    name: 'Aminata',
    color: '#1265DD',
  });

  const verify = createTicketVerifier(secret);
  const payload = await verify(token, 'canvas-abc');
  assert.equal(payload.sub, 'user-123');
  assert.equal(payload.role, 'WRITE');
});

test('un ticket pour un autre canvas est refusé', async () => {
  const token = await signTicket({ sub: 'user-1', cid: 'canvas-A' });
  const verify = createTicketVerifier(secret);
  await assert.rejects(() => verify(token, 'canvas-B'), /autre canvas/);
});

test('un ticket falsifié est refusé', async () => {
  const token = await signTicket({ sub: 'user-1', cid: 'canvas-A', role: 'READ' });
  const verify = createTicketVerifier(secret);
  // On casse le token (modifie le payload).
  const [header, payload] = token.split('.');
  const forged = `${header}.${Buffer.from('{"cid":"canvas-A"}').toString('base64url')}.${payload}`;
  await assert.rejects(() => verify(forged, 'canvas-A'));
});
test('le jeton de service est reconnu, tout le reste est refusé', () => {
  const hasServiceToken = createServiceTokenVerifier('un-jeton-de-service');
  assert.equal(hasServiceToken('Bearer un-jeton-de-service'), true);
  assert.equal(hasServiceToken('Bearer un-autre-jeton'), false);
  assert.equal(hasServiceToken('Bearer un-jeton-de-service-plus-long'), false);
  assert.equal(hasServiceToken('Bearer '), false);
  assert.equal(hasServiceToken('Basic un-jeton-de-service'), false);
  assert.equal(hasServiceToken('un-jeton-de-service'), false);
  assert.equal(hasServiceToken(undefined), false);
  assert.equal(hasServiceToken(null), false);
});

test('un jeton de service vide empêche le démarrage', () => {
  assert.throws(() => createServiceTokenVerifier(''), /ne doit pas être vide/);
  assert.throws(() => createServiceTokenVerifier('   '), /ne doit pas être vide/);
  assert.throws(() => createServiceTokenVerifier(undefined), /ne doit pas être vide/);
});
