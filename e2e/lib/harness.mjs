/**
 * Socle des parcours de bout en bout : un navigateur, des personnes (un contexte chacune), des vérifications qui
 * s'affichent au fur et à mesure, et un bilan. Rien ici ne connaît l'application, sauf la page de connexion.
 *
 * Réglages par variables d'environnement (voir README.md) :
 *   E2E_BASE_URL         adresse de l'application (http://localhost:3000 par défaut)
 *   E2E_HOST_MAP         règle de résolution de nom du navigateur, ex. « MAP lonkoo.internal 127.0.0.1 »
 *   E2E_INSECURE_TLS=1   accepte un certificat non reconnu (répétition avec un certificat local)
 *   E2E_BROWSER_CHANNEL  navigateur installé à utiliser (« chrome », « msedge ») au lieu de celui de Playwright
 *   E2E_HEADED=1         montre le navigateur
 *   E2E_SHOTS            dossier des captures d'écran (e2e/captures par défaut)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const env = process.env;

export const config = {
  base: (env.E2E_BASE_URL || "http://localhost:3000").replace(/\/+$/, ""),
  hostMap: env.E2E_HOST_MAP || "",
  insecureTls: env.E2E_INSECURE_TLS === "1",
  channel: env.E2E_BROWSER_CHANNEL || undefined,
  headed: env.E2E_HEADED === "1",
  shots: env.E2E_SHOTS || fileURLToPath(new URL("../captures", import.meta.url)),
};

/** Les erreurs du navigateur qui ne sont pas des défauts : requêtes refusées voulues (401 avant connexion, 404 d'un lien inconnu) et sockets coupées. */
const NOISE = /Failed to load resource|WebSocket|ws:\/\/|wss:\/\/|status of (401|403|404|429)/;

/** Démarre un navigateur pour un scénario. `finish()` ferme tout et rend le nombre de vérifications ratées. */
export async function startHarness(scenario) {
  mkdirSync(config.shots, { recursive: true });
  const browser = await chromium.launch({
    channel: config.channel,
    headless: !config.headed,
    args: config.hostMap ? [`--host-resolver-rules=${config.hostMap}`] : [],
  });
  const results = [];
  const errors = [];

  const h = {
    config,
    base: config.base,
    browser,
    errors,

    check(name, ok, detail = "") {
      results.push({ name, ok });
      console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
      return ok;
    },

    skip(name, why) {
      console.log(`SKIP ${name} — ${why}`);
    },

    /** Vrai quand l'élément apparaît à temps, faux sinon (une vérification qui échoue ne doit pas arrêter le scénario). */
    visible: (locator, timeout = 15000) =>
      locator.waitFor({ state: "visible", timeout }).then(() => true).catch(() => false),

    gone: (locator, timeout = 15000) =>
      locator.waitFor({ state: "detached", timeout }).then(() => true).catch(() => false),

    /** Une personne qui n'est pas encore connectée (elle arrive par un lien de partage, par exemple). */
    async newVisitor(label) {
      const context = await browser.newContext({
        viewport: { width: 1360, height: 900 },
        ignoreHTTPSErrors: config.insecureTls,
      });
      const page = await context.newPage();
      const sockets = [];
      page.on("pageerror", (e) => errors.push(`[${label}] ${String(e).slice(0, 220)}`));
      page.on("console", (m) => {
        if (m.type() === "error" && !NOISE.test(m.text())) errors.push(`[${label}] console: ${m.text().slice(0, 220)}`);
      });
      page.on("websocket", (ws) => {
        if (ws.url().includes("/_next/")) return; // rechargement à chaud de Next.js en développement
        const entry = { url: ws.url(), openedAt: Date.now(), closedAt: null };
        sockets.push(entry);
        ws.on("close", () => {
          entry.closedAt = Date.now();
        });
      });
      return { label, context, page, sockets };
    },

    /** Une personne qui ouvre « Essayer sans compte » : invité, avec son projet d'exemple, sur le tableau de bord. */
    async newGuest(label) {
      const person = await h.newVisitor(label);
      const { page } = person;
      await page.goto(config.base + "/login", { waitUntil: "load" });
      await page.getByRole("button", { name: "Essayer sans compte" }).click();
      await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 15000 });
      if (page.url().includes("onboarding")) await page.goto(config.base + "/dashboard");
      await page.getByText("Chargement de vos projets").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
      return person;
    },

    async shot(page, name) {
      await page.screenshot({ path: join(config.shots, `${scenario}-${name}.png`) });
    },

    /** Aucune erreur JavaScript dans aucune des pages ouvertes. */
    noScriptErrors() {
      return h.check("aucune erreur JavaScript dans les pages", errors.length === 0, errors.slice(0, 4).join(" | "));
    },

    async finish() {
      await browser.close();
      const failed = results.filter((r) => !r.ok).length;
      console.log(`${results.length - failed}/${results.length} vérifications passent`);
      return failed;
    },
  };
  return h;
}
