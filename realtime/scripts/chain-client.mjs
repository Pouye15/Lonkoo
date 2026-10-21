/**
 * Client de test, lancé par `RealtimeChainIntegrationTest` (backend) : il se connecte au serveur temps
 * réel comme le fera le front et écrit dans le document selon `docs/schema-canvas.md` (cartes `nodes`
 * et `edges` indexées par id, valeurs simples). Il n'utilise donc pas le codec du serveur : si le
 * serveur et le contrat divergent, le test de chaîne le voit.
 *
 * Usage : node scripts/chain-client.mjs <url> <canvasId> <ticket> <action> [attenteMs]
 * Actions : none, add-node, add-bad-node, wipe, watch.
 * Sortie, une ligne par évènement : SYNCED nodes=N, UPDATE nodes=N, DONE nodes=N,
 * AUTH_FAILED <raison>, TIMEOUT_NO_SYNC.
 */
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { WebSocket } from 'ws';

const [url, name, token, action = 'none', holdMs = '1000'] = process.argv.slice(2);

const doc = new Y.Doc();
const provider = new HocuspocusProvider({
  url,
  name,
  document: doc,
  token,
  awareness: new Awareness(doc),
  WebSocketPolyfill: WebSocket,
});

const nodes = doc.getMap('nodes');
const edges = doc.getMap('edges');

let finished = false;
function finish(code, message) {
  if (finished) return;
  finished = true;
  console.log(message);
  provider.destroy();
  setTimeout(() => process.exit(code), 150);
}

// Comme le front : les champs du contrat, plus une clé « ui » de présentation que le serveur ignore.
const entry = (type, position, data) =>
  new Y.Map([
    ['type', type],
    ['position', position],
    ['data', data],
    ['ui', { shape: 'service', replicas: 2 }],
  ]);

provider.on('authenticationFailed', ({ reason }) => finish(3, `AUTH_FAILED ${reason}`));
provider.on('close', () => console.log('CLOSED'));
const timeout = setTimeout(() => finish(2, 'TIMEOUT_NO_SYNC'), 6000);

provider.on('synced', () => {
  clearTimeout(timeout);
  console.log(`SYNCED nodes=${nodes.size}`);
  if (action === 'watch') {
    nodes.observe(() => console.log(`UPDATE nodes=${nodes.size}`));
  }
  doc.transact(() => {
    if (action === 'add-node') {
      nodes.set('n-e2e', entry('auth', { x: 5, y: 5 }, { name: 'connexion', method: 'otp-sms' }));
    }
    if (action === 'add-bad-node') {
      nodes.set('n-bad', entry('auth', { x: 5, y: 5 }, { name: 'class', method: 'otp-sms' }));
    }
    if (action === 'wipe') {
      nodes.clear();
      edges.clear();
    }
  });
  setTimeout(() => finish(0, `DONE nodes=${nodes.size}`), Number(holdMs));
});
