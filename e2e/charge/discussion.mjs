/**
 * Mesure de charge de la discussion d'un projet : N personnes d'un même projet lisent la conversation toutes les 3 s
 * (comme l'interface) et écrivent à intervalles irréguliers. Rien n'est livré avec l'application : outil de vérification.
 *
 *   cd e2e
 *   E2E_API=http://localhost:8080 CHARGE_PERSONNES=50 CHARGE_SECONDES=60 npm run charge
 *
 * Il s'adresse au backend directement (pas à l'interface) : c'est ce que Caddy lui relaie sous /api. Les personnes sont
 * des invités (le backend doit accepter beaucoup de créations d'invités : GUEST_RATE_LIMIT_PER_HOUR élevé).
 *
 * Il mesure : ce qui est envoyé et reçu (rien ne doit manquer chez personne), le délai entre l'envoi d'un message et
 * sa réception par chaque autre personne, la durée des appels, et les refus (429 : limite de débit, 5xx : panne).
 */
import { monitorEventLoopDelay } from "node:perf_hooks";

const API = process.env.E2E_API || "http://localhost:8080";
const PEOPLE = Number(process.env.CHARGE_PERSONNES || 30);
const SECONDS = Number(process.env.CHARGE_SECONDES || 60);
// Messages écrits par personne et par minute (la limite du serveur est de 20).
const PER_MINUTE = Number(process.env.CHARGE_MESSAGES_PAR_MINUTE || 6);
const POLL_MS = 3000;

class Person {
  constructor(label) {
    this.label = label;
    this.cookie = "";
    this.lastId = undefined;
    this.seen = new Map(); // id du message -> instant de réception
    this.sent = 0;
  }

  async call(method, path, body) {
    const started = performance.now();
    const response = await fetch(API + path, {
      method,
      redirect: "manual",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const elapsed = performance.now() - started;
    const setCookie = response.headers.getSetCookie?.() ?? [];
    const session = setCookie.map((c) => c.split(";")[0]).find((c) => c.startsWith("JSESSIONID") || c.startsWith("SESSION"));
    if (session) this.cookie = session;
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // corps non JSON
    }
    return { status: response.status, json, elapsed };
  }
}

const stats = { get: [], post: [], statuses: new Map() };
const count = (key) => stats.statuses.set(key, (stats.statuses.get(key) ?? 0) + 1);
const percentile = (values, p) => {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const ms = (value) => (Number.isNaN(value) ? "—" : `${Math.round(value)} ms`);
const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

// Le retard de l'outil lui-même : si son horloge prend du retard (machine chargée), les délais mesurés s'allongent d'autant.
const loopDelay = monitorEventLoopDelay({ resolution: 10 });

async function main() {
  loopDelay.enable();
  console.log(`Charge de la discussion : ${PEOPLE} personnes, ${SECONDS} s, ${PER_MINUTE} messages par personne et par minute, API ${API}`);

  // ------------------------------------------------------------ L'équipe : un propriétaire, les autres entrent par un lien
  const owner = new Person("propriétaire");
  let r = await owner.call("POST", "/api/auth/guest");
  if (r.status !== 201) throw new Error(`création du propriétaire : ${r.status}`);
  r = await owner.call("GET", "/api/projects");
  const projectId = r.json[0].id;
  r = await owner.call("GET", `/api/projects/${projectId}/canvases`);
  const canvasId = r.json[0].id;
  r = await owner.call("POST", `/api/canvases/${canvasId}/share-links`, { role: "WRITE", ttlHours: 1 });
  if (r.status !== 201) throw new Error(`lien de partage : ${r.status}`);
  const token = r.json.url.slice(r.json.url.lastIndexOf("/") + 1);

  const people = [owner];
  const joinStarted = performance.now();
  for (let i = 1; i < PEOPLE; i++) {
    const person = new Person(`membre-${i}`);
    const joined = await person.call("POST", `/api/join/${token}`);
    if (joined.status !== 200 && joined.status !== 201) throw new Error(`entrée de ${person.label} : ${joined.status}`);
    people.push(person);
  }
  console.log(`${PEOPLE} personnes dans le projet (entrées en ${Math.round((performance.now() - joinStarted) / 1000)} s)`);

  // ------------------------------------------------------------ La conversation
  const sentAt = new Map(); // texte -> instant d'envoi
  const latencies = [];
  const deadline = Date.now() + SECONDS * 1000;
  let sentTotal = 0;
  const refused = [];

  // `finalPass` : la lecture de fin de test (après l'arrêt de toutes les boucles) vérifie que rien ne manque, mais ne compte
  // pas dans les délais : elle arrive jusqu'à 3 s après la dernière écriture et fausserait le pire cas.
  async function read(person, finalPass = false) {
    const result = await person.call("GET", `/api/projects/${projectId}/messages${person.lastId === undefined ? "" : `?after=${person.lastId}`}`);
    stats.get.push(result.elapsed);
    count(`GET ${result.status}`);
    if (result.status !== 200) return;
    const now = performance.now();
    for (const message of result.json) {
      person.lastId = Math.max(person.lastId ?? 0, message.id);
      if (!person.seen.has(message.id)) {
        person.seen.set(message.id, now);
        const sent = sentAt.get(message.body);
        if (!finalPass && sent !== undefined && !message.mine) latencies.push(now - sent);
      }
    }
  }

  async function write(person) {
    const text = `${person.label} n°${++person.sent} (${"x".repeat(20 + Math.floor(Math.random() * 200))})`;
    sentAt.set(text, performance.now());
    const result = await person.call("POST", `/api/projects/${projectId}/messages`, { body: text });
    stats.post.push(result.elapsed);
    count(`POST ${result.status}`);
    if (result.status === 201) {
      sentTotal += 1;
      // Comme l'interface : ce qu'on vient d'écrire s'affiche tout de suite, mais le curseur de lecture n'avance que
      // par les lectures (sinon un message d'une autre personne, arrivé entre-temps, serait sauté).
      person.seen.set(result.json.id, performance.now());
    } else {
      refused.push(result.status);
    }
  }

  async function live(person, index) {
    // Chacun commence à un instant différent : les lectures ne partent pas toutes ensemble.
    await sleep((index * POLL_MS) / PEOPLE);
    let nextWrite = Date.now() + Math.random() * (60000 / PER_MINUTE) * 2;
    while (Date.now() < deadline) {
      await read(person);
      if (Date.now() >= nextWrite) {
        await write(person);
        nextWrite = Date.now() + (60000 / PER_MINUTE) * (0.5 + Math.random());
      }
      await sleep(POLL_MS * (0.9 + Math.random() * 0.2));
    }
  }

  await Promise.all(people.map(live));
  // Dernière lecture pour tout le monde : les messages envoyés à la fin doivent arriver aussi.
  await Promise.all(people.map((person) => read(person, true)));

  // ------------------------------------------------------------ Ce qu'on a vu
  const allIds = new Set();
  for (const person of people) for (const id of person.seen.keys()) allIds.add(id);
  let missing = 0;
  for (const person of people) missing += allIds.size - person.seen.size;

  console.log("");
  console.log(`Messages écrits : ${sentTotal} (refusés : ${refused.length}${refused.length ? ` — ${[...new Set(refused)].join(", ")}` : ""})`);
  console.log(`Messages distincts en base pour ce projet : ${allIds.size}`);
  console.log(`Chaque personne devait voir ${allIds.size} messages ; manquants au total : ${missing}`);
  console.log(`Délai d'arrivée chez les autres (${latencies.length} mesures) : médiane ${ms(percentile(latencies, 50))}, 95 % en moins de ${ms(percentile(latencies, 95))}, pire ${ms(Math.max(...latencies))}`);
  console.log(`Lecture (GET) : ${stats.get.length} appels, médiane ${ms(percentile(stats.get, 50))}, 95 % en moins de ${ms(percentile(stats.get, 95))}, pire ${ms(Math.max(...stats.get))}`);
  console.log(`Écriture (POST) : ${stats.post.length} appels, médiane ${ms(percentile(stats.post, 50))}, 95 % en moins de ${ms(percentile(stats.post, 95))}, pire ${ms(Math.max(...stats.post))}`);
  console.log(`Retard de l'outil de mesure lui-même (boucle d'événements) : moyen ${ms(loopDelay.mean / 1e6)}, pire ${ms(loopDelay.max / 1e6)}`);
  console.log(`Réponses : ${[...stats.statuses].sort().map(([key, n]) => `${key} × ${n}`).join(", ")}`);
  const serverErrors = [...stats.statuses].filter(([key]) => /\b5\d\d$/.test(key)).reduce((sum, [, n]) => sum + n, 0);
  const ok = missing === 0 && serverErrors === 0 && sentTotal > 0 && allIds.size === sentTotal;
  console.log(ok ? "\nRésultat : rien de perdu, aucune erreur du serveur." : "\nRésultat : ANOMALIE (messages manquants ou erreurs du serveur).");
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
