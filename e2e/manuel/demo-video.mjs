#!/usr/bin/env node
/**
 * Enregistre une courte vidéo de démonstration (environ 2 minutes, format WebM, sans son, avec des sous-titres) de ce
 * que l'application affiche quand tout marche : page d'accueil, espace de démonstration, studio, collaboration à deux
 * personnes, versions, export, génération du projet. Elle sert à montrer à quelqu'un qui n'arrive pas à faire tourner le
 * projet en local à quoi ressemble un démarrage réussi, et de base à la démo de secours du jury.
 *
 *   cd e2e
 *   E2E_BASE_URL=http://localhost:3000 node manuel/demo-video.mjs        (ou : npm run demo-video)
 *
 * Réglages (en plus de ceux du README) :
 *   E2E_VIDEO_DIR       dossier de la vidéo (e2e/captures, ignoré par git, par défaut)
 *   E2E_REALTIME_HEALTH adresse de santé du serveur temps réel (http://localhost:1234/health en local, <adresse>/ws/health sinon)
 *
 * Avant d'enregistrer, le script vérifie que l'interface, le backend et le serveur temps réel répondent. Sinon il
 * s'arrête sans rien enregistrer et dit quoi lancer : une vidéo d'une pile en panne n'aurait aucun intérêt.
 *
 * Il ne crée que des invités (leurs données disparaissent après 24 h) et ne touche à aucun compte GitHub.
 * Le fichier WebM se lit dans un navigateur ou VLC ; pour un MP4 (téléphone, WhatsApp) : ffmpeg -i demo-lonkoo.webm demo-lonkoo.mp4
 */
import { mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

import { config } from "../lib/harness.mjs";

const SIZE = { width: 1280, height: 720 };
const OUT = process.env.E2E_VIDEO_DIR || config.shots;
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(config.base);
const REALTIME_HEALTH = process.env.E2E_REALTIME_HEALTH || (IS_LOCAL ? "http://localhost:1234/health" : `${config.base}/ws/health`);
const BACKEND_HEALTH = `${config.base}/api/actuator/health`;

/* ---------------------------------------------------------------------------------------------------------------- */
/* Ce qui s'ajoute à chaque page pour la vidéo : sous-titres, curseur visible, cartes de titre. Rien n'est livré.   */
/* ---------------------------------------------------------------------------------------------------------------- */
function installOverlay() {
  const install = () => {
    if (document.getElementById("demo-caption")) return;
    const style = document.createElement("style");
    style.textContent = [
      "nextjs-portal{display:none!important}",
      "#demo-caption{position:fixed;left:0;right:0;bottom:0;height:46px;z-index:2147483647;display:none;align-items:center;justify-content:center;padding:0 24px;background:#0b1220;color:#fff;font:600 18px/1.25 system-ui,'Segoe UI',sans-serif;text-align:center}",
      "#demo-card{position:fixed;inset:0;z-index:2147483645;display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:48px;background:#0b1220;color:#fff;font-family:system-ui,'Segoe UI',sans-serif;text-align:center}",
      "#demo-card h1{margin:0;font-size:46px;font-weight:700}",
      "#demo-card p{margin:0;font-size:22px;line-height:1.45;color:#c7d2e8;max-width:960px}",
      "#demo-card code{font:600 20px/1.45 ui-monospace,Consolas,monospace;color:#9dc2ff}",
      "#demo-cursor{position:fixed;left:-100px;top:-100px;width:26px;height:26px;z-index:2147483646;pointer-events:none}",
      "#demo-ripple{position:fixed;left:-100px;top:-100px;width:38px;height:38px;margin:-19px 0 0 -19px;border:3px solid #1265dd;border-radius:50%;z-index:2147483646;pointer-events:none;opacity:0}",
      "#demo-ripple.go{animation:demo-ripple .55s ease-out}",
      "@keyframes demo-ripple{from{opacity:.95;transform:scale(.35)}to{opacity:0;transform:scale(1.5)}}",
    ].join("\n");
    document.head.appendChild(style);

    const caption = document.createElement("div");
    caption.id = "demo-caption";
    const card = document.createElement("div");
    card.id = "demo-card";
    const ripple = document.createElement("div");
    ripple.id = "demo-ripple";
    const cursor = document.createElement("div");
    cursor.id = "demo-cursor";
    cursor.innerHTML =
      '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l7.6 19 2.7-7.6L22 10.6z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.append(card, caption, ripple, cursor);

    document.addEventListener(
      "mousemove",
      (event) => {
        cursor.style.left = event.clientX - 4 + "px";
        cursor.style.top = event.clientY - 2 + "px";
      },
      true,
    );
    document.addEventListener(
      "mousedown",
      (event) => {
        ripple.style.left = event.clientX + "px";
        ripple.style.top = event.clientY + "px";
        ripple.classList.remove("go");
        void ripple.offsetWidth;
        ripple.classList.add("go");
      },
      true,
    );

    const show = (text) => {
      caption.textContent = text || "";
      caption.style.display = text ? "flex" : "none";
    };
    window.__demo = {
      say(text) {
        try {
          sessionStorage.setItem("demo-caption", text || "");
        } catch {
          // stockage indisponible : le sous-titre ne survivra pas à un changement de page
        }
        show(text);
      },
      card(html) {
        card.innerHTML = html;
        card.style.display = "flex";
      },
      cardOff() {
        card.style.display = "none";
      },
    };
    try {
      show(sessionStorage.getItem("demo-caption"));
    } catch {
      show("");
    }
  };
  if (document.readyState === "complete") install();
  else window.addEventListener("load", install);
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Outils                                                                                                           */
/* ---------------------------------------------------------------------------------------------------------------- */
const beat = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const started = Date.now();
const note = (text) => console.log(`[${String(Math.round((Date.now() - started) / 1000)).padStart(3)} s] ${text}`);

let pointer = { x: 640, y: 360 };

/** Dit une phrase en sous-titre (vide : l'efface). */
async function say(page, text) {
  await page.waitForFunction(() => Boolean(window.__demo), null, { timeout: 15000 });
  await page.evaluate((value) => window.__demo.say(value), text);
}

/** Déplace le curseur vers l'élément en douceur, comme une main. */
async function glide(page, locator, steps = 26) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("élément introuvable à l'écran");
  pointer = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(pointer.x, pointer.y, { steps });
  await beat(280);
}

async function click(page, locator) {
  await glide(page, locator);
  await locator.click();
}

/** Après un changement de page, le curseur dessiné repart de zéro : on le remet où la souris se trouve. */
async function restorePointer(page) {
  await page.waitForFunction(() => Boolean(window.__demo), null, { timeout: 15000 });
  await page.mouse.move(pointer.x + 1, pointer.y);
}

/* ---------------------------------------------------------------------------------------------------------------- */
const browser = await chromium.launch({
  channel: config.channel,
  headless: true,
  args: config.hostMap ? [`--host-resolver-rules=${config.hostMap}`] : [],
});

// 1. La pile répond-elle ? Sinon, rien à filmer.
{
  const probe = await browser.newContext({ ignoreHTTPSErrors: config.insecureTls });
  const page = await probe.newPage();
  const problems = [];
  const expect = async (what, url, pattern, hint) => {
    try {
      const response = await page.goto(url, { timeout: 10000 });
      const text = (await page.locator("body").innerText()).slice(0, 400);
      if (!response?.ok() || !pattern.test(text)) problems.push(`${what} (${url}) : réponse inattendue. ${hint}`);
    } catch {
      problems.push(`${what} (${url}) : ne répond pas. ${hint}`);
    }
  };
  await expect("Interface", `${config.base}/login`, /Essayer sans compte/, "Lancez « npm run dev » dans frontend/ (et créez frontend/.env.local, voir le README).");
  await expect("Backend", BACKEND_HEALTH, /"UP"/, "Lancez le backend (./mvnw spring-boot:run \"-Dspring-boot.run.profiles=dev\" dans backend/), après PostgreSQL.");
  await expect("Serveur temps réel", REALTIME_HEALTH, /"UP"/, "Lancez « npm run dev » dans realtime/.");
  await probe.close();
  if (problems.length > 0) {
    console.error("La pile ne tourne pas normalement : rien n'a été enregistré.\n- " + problems.join("\n- "));
    await browser.close();
    process.exit(2);
  }
  note("la pile répond (interface, backend, temps réel)");
}

mkdirSync(OUT, { recursive: true });
const contextA = await browser.newContext({
  viewport: SIZE,
  ignoreHTTPSErrors: config.insecureTls,
  recordVideo: { dir: OUT, size: SIZE },
});
await contextA.addInitScript(installOverlay);
const contextB = await browser.newContext({ viewport: SIZE, ignoreHTTPSErrors: config.insecureTls });
await contextB.addInitScript(installOverlay);
const A = await contextA.newPage();
const B = await contextB.newPage();
const board = (page) => page.getByRole("application", { name: "Tableau blanc d'architecture" });
const step = (n) => A.locator(`section[aria-labelledby="step-${n}"]`);

/**
 * Le tableau s'ouvre à 46 % dans une fenêtre de 1280 x 720 : trop petit pour lire les blocs dans une vidéo. On range la
 * boîte à outils (si elle est dépliée), puis on zoome (Ctrl + molette) autour du milieu du schéma, comme le ferait une personne.
 */
async function zoomBoard() {
  const fold = A.getByRole("button", { name: "Réduire la boîte à outils" });
  if ((await fold.count()) > 0) {
    await click(A, fold);
    await beat(600);
  }
  const rects = await board(A)
    .locator("[data-node-id]")
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect()).map((r) => [r.left, r.top, r.right, r.bottom]));
  if (rects.length === 0) return;
  const centerX = (Math.min(...rects.map((r) => r[0])) + Math.max(...rects.map((r) => r[2]))) / 2;
  const centerY = (Math.min(...rects.map((r) => r[1])) + Math.max(...rects.map((r) => r[3]))) / 2;
  pointer = { x: centerX, y: centerY };
  await A.mouse.move(centerX, centerY, { steps: 30 });
  await A.keyboard.down("Control");
  for (let i = 0; i < 3; i++) {
    await A.mouse.wheel(0, -120);
    await beat(380);
  }
  await A.keyboard.up("Control");
}

let failure = null;
try {
  // ------------------------------------------------------------------ titre
  await A.goto(config.base + "/", { waitUntil: "load" });
  await A.waitForFunction(() => Boolean(window.__demo), null, { timeout: 15000 });
  await A.evaluate(
    (local) =>
      window.__demo.card(
        "<h1>LONKOO en local</h1><p>Ce que vous devez voir quand tout marche</p>" +
          (local
            ? "<p><code>base de données</code> · <code>backend 8080</code> · <code>temps réel 1234</code> · <code>interface 3000</code></p>"
            : ""),
      ),
    IS_LOCAL,
  );
  await beat(4500);
  await A.evaluate(() => window.__demo.cardOff());

  // ------------------------------------------------------------------ accueil, connexion sans compte
  await say(A, `La page d'accueil : ${config.base}`);
  await beat(2800);
  await click(A, A.getByRole("link", { name: "Commencer" }).first());
  await A.waitForURL(/\/login/, { timeout: 15000 });
  await restorePointer(A);
  await say(A, "« Essayer sans compte » : un espace de démonstration, sans GitHub");
  await beat(2200);
  await click(A, A.getByRole("button", { name: "Essayer sans compte" }));
  await A.waitForURL(/\/dashboard|\/onboarding/, { timeout: 15000 });
  if (A.url().includes("onboarding")) await A.goto(config.base + "/dashboard", { waitUntil: "load" });
  await A.getByText("Chargement de vos projets").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  await restorePointer(A);
  await say(A, "Vos projets : un modèle d'exemple est déjà prêt");
  await beat(3200);
  note("espace de démonstration ouvert");

  // ------------------------------------------------------------------ le studio
  await click(A, A.getByRole("link", { name: "Ouvrir" }).first());
  await A.waitForURL(/\/studio\?project=/, { timeout: 15000 });
  await restorePointer(A);
  await say(A, "Le studio s'ouvre : le canvas se charge par le serveur temps réel");
  await board(A).waitFor({ timeout: 25000 });
  await beat(1200);
  await say(A, "Le tableau apparaît avec le modèle d'exemple : une boutique avec paiement mobile");
  await zoomBoard();
  await beat(3000);
  note("studio affiché");

  // ------------------------------------------------------------------ partager, une deuxième personne arrive
  await say(A, "Partager : un lien pour inviter quelqu'un à dessiner avec vous");
  await click(A, A.getByRole("button", { name: /Partager/ }));
  await beat(2000);
  await click(A, A.getByRole("button", { name: /Créer (le|un autre) lien/ }));
  await A.locator("#share-url").waitFor({ timeout: 10000 });
  const shareUrl = await A.locator("#share-url").inputValue();
  await beat(2600);
  await click(A, A.getByRole("dialog").locator('button:text-is("Fermer")'));
  await beat(500);

  await say(A, "Une deuxième personne ouvre le lien : son curseur et ses blocs apparaissent en direct");
  await B.goto(config.base + new URL(shareUrl).pathname, { waitUntil: "load" });
  await B.waitForURL(/\/studio\?project=/, { timeout: 25000 });
  await board(B).waitFor({ timeout: 25000 });
  await beat(1500);
  const area = await board(B).boundingBox();
  for (const [fx, fy] of [[0.3, 0.3], [0.55, 0.45], [0.72, 0.28], [0.5, 0.58]]) {
    await B.mouse.move(area.x + area.width * fx, area.y + area.height * fy, { steps: 38 });
    await beat(450);
  }
  await B.getByRole("button", { name: "Application web" }).first().click();
  await beat(3200);
  note("collaboration à deux montrée");

  // ------------------------------------------------------------------ versions
  await say(A, "Versions : on enregistre l'état du canvas pour pouvoir y revenir");
  await click(A, A.getByRole("tab", { name: /Versions/ }));
  const name = A.getByLabel("Nom de la version");
  await click(A, name);
  await name.pressSequentially("v1", { delay: 180 });
  await beat(500);
  await click(A, A.getByRole("button", { name: "Enregistrer la version" }));
  await A.getByText(/Version « v1 » enregistrée/).waitFor({ timeout: 10000 });
  await beat(2600);

  // ------------------------------------------------------------------ export
  await click(A, A.getByRole("tab", { name: "Architecture" }));
  await board(A).waitFor({ timeout: 15000 });
  await beat(1200);
  await zoomBoard();
  await say(A, "Exporter : un schéma Mermaid pour un README, ou du JSON, du SVG, du PNG");
  await click(A, A.getByRole("button", { name: /Exporter/ }));
  await A.getByRole("dialog").waitFor({ timeout: 10000 });
  await beat(4200);
  await click(A, A.getByRole("dialog").getByRole("button", { name: "Fermer" }).last());
  await beat(500);
  note("versions et export montrés");

  // ------------------------------------------------------------------ génération du projet
  await say(A, "Déploiement : générer le projet à partir du canvas");
  await click(A, A.getByRole("link", { name: "Déploiement" }).first());
  await A.waitForURL(/\/deploy/, { timeout: 15000 });
  await restorePointer(A);
  await step(1).getByRole("button", { name: "Générer le projet" }).waitFor({ timeout: 15000 });
  await beat(1200);
  await click(A, step(1).getByRole("button", { name: "Générer le projet" }));
  await step(1).getByText(/Projet « .* » généré/).waitFor({ timeout: 45000 });
  await say(A, "Le projet est prêt : une API Spring Boot, une interface, une base PostgreSQL, docker-compose, un README");
  await beat(2600);
  await click(A, step(1).getByText("Voir les fichiers"));
  await click(A, step(1).getByRole("button", { name: /README\.md/ }));
  await step(1).getByLabel("Contenu de README.md").waitFor({ timeout: 10000 });
  await beat(4200);
  await say(A, "L'envoi sur GitHub demande de se connecter avec GitHub (facultatif en local)");
  await step(2).scrollIntoViewIfNeeded();
  await beat(4200);
  note("génération montrée");

  // ------------------------------------------------------------------ fin
  const [backend, realtime] = await Promise.all(
    [BACKEND_HEALTH, REALTIME_HEALTH].map(async (url) => {
      try {
        return (await fetch(url, { signal: AbortSignal.timeout(5000) })).ok ? "UP" : "indisponible";
      } catch {
        return "indisponible";
      }
    }),
  );
  await say(A, "");
  await A.evaluate(
    ({ local, up }) =>
      window.__demo.card(
        "<h1>Quand tout marche</h1>" +
          (local
            ? `<p>Ces deux vérifications répondent UP :</p><p><code>curl http://localhost:8080/api/actuator/health</code> → ${up.backend}<br><code>curl http://localhost:1234/health</code> → ${up.realtime}</p>` +
              "<p>Le studio reste sur « Connexion au canvas partagé… » ?<br>Lancez <code>cd realtime &amp;&amp; npm run dev</code> et vérifiez <code>frontend/.env.local</code> :<br><code>NEXT_PUBLIC_REALTIME_URL=ws://localhost:1234</code></p>"
            : `<p>Backend : ${up.backend} · temps réel : ${up.realtime}</p>`),
      ),
    { local: IS_LOCAL, up: { backend, realtime } },
  );
  await beat(9000);
  note("fin");
} catch (error) {
  failure = error;
  console.error("Échec pendant l'enregistrement :", String(error?.message ?? error).split("\n")[0]);
  await A.screenshot({ path: join(OUT, "demo-lonkoo-echec.png") }).catch(() => {});
}

const video = A.video();
await contextB.close();
await contextA.close();
const raw = await video.path();
const target = join(OUT, failure ? "demo-lonkoo-echec.webm" : "demo-lonkoo.webm");
renameSync(raw, target);
await browser.close();
console.log(failure ? `Enregistrement incomplet : ${target}` : `Vidéo enregistrée : ${target}`);
process.exit(failure ? 1 : 0);
