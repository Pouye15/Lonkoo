#!/usr/bin/env node
/**
 * Parcours MANUEL contre le VRAI GitHub : connexion, création d'un dépôt, envoi du projet généré, lancement du workflow de
 * déploiement et suivi de son exécution. Il ne fait pas partie de `npm run e2e` : il crée un dépôt sur un vrai compte et
 * demande qu'une personne se connecte elle-même dans la fenêtre qui s'ouvre.
 *
 *   cd e2e
 *   E2E_BASE_URL=https://votre-adresse node manuel/github-reel.mjs        (ou : npm run github-reel)
 *
 * Réglages (en plus de ceux du README) :
 *   E2E_REPO_NAME             nom du dépôt de test (lonkoo-essai-reel-AAAAMMJJ par défaut)
 *   E2E_VISIBILITY            private (par défaut) ou public
 *   E2E_LOGIN_TIMEOUT_SECONDS temps laissé pour se connecter et autoriser sur github.com (600 par défaut)
 *
 * Ce que le script ne fait jamais : lire une page de github.com (il attend seulement le retour sur l'application),
 * ni garder ou afficher un jeton. La personne tape ses identifiants elle-même.
 *
 * Résultat attendu sur un dépôt neuf : le dépôt est créé avec les fichiers du projet (workflow compris), le workflow est
 * lancé, puis il ÉCHOUE à l'étape « Vérifier les secrets » (aucun secret SYSTALINK_* dans ce dépôt de test) : c'est ce
 * qui prouve la chaîne de bout en bout. Pour voir un déploiement réussi, créez d'abord les quatre secrets dans le dépôt
 * de test (voir docs/DEPLOIEMENT.md, étape 4) et un serveur joignable.
 *
 * Après l'essai : supprimez le dépôt de test (GitHub > le dépôt > Settings > Delete this repository). Et, si
 * l'application OAuth sert à autre chose qu'à l'essai, retirez l'autorisation « repo workflow » donnée pendant l'essai
 * (github.com/settings/applications).
 */
import { config, startHarness } from "../lib/harness.mjs";

config.headed = process.env.E2E_HEADED !== "0"; // une personne doit se connecter dans la fenêtre (E2E_HEADED=0 : essai à blanc, sans fenêtre)

const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const REPO = process.env.E2E_REPO_NAME || `lonkoo-essai-reel-${today}`;
const VISIBILITY = process.env.E2E_VISIBILITY === "public" ? "public" : "private";
const LOGIN_TIMEOUT_MS = Number(process.env.E2E_LOGIN_TIMEOUT_SECONDS || 600) * 1000;
const RUN_TIMEOUT_MS = 5 * 60 * 1000;

const h = await startHarness("github-reel");
const origin = new URL(config.base).origin;

try {
  // ---------------------------------------------------------------- invité et génération (projet d'exemple)
  const person = await h.newGuest("invité");
  const { page } = person;
  const step = (n) => page.locator(`section[aria-labelledby="step-${n}"]`);

  await page.goto(config.base + "/deploy", { waitUntil: "load" });
  await step(1).getByRole("button", { name: "Générer le projet" }).click();
  h.check("la génération (en invité) se termine", await h.visible(step(1).getByText(/Projet « .* » généré/), 30000));
  const summary = (await step(1).getByText(/\d+ fichiers · /).first().textContent().catch(() => "")) ?? "";
  console.log("   ", summary.trim());

  // ---------------------------------------------------------------- connexion réelle (autorisations repo + workflow)
  console.log(`\n>>> ACTION HUMAINE : dans la fenêtre ouverte, connectez-vous à GitHub puis cliquez « Authorize » (${LOGIN_TIMEOUT_MS >= 60000 ? Math.round(LOGIN_TIMEOUT_MS / 60000) + " minutes" : Math.round(LOGIN_TIMEOUT_MS / 1000) + " secondes"} au plus).`);
  console.log(">>> Vérifiez que le compte affiché est bien celui que vous voulez utiliser, et que l'écran demande read:user, repo et workflow.\n");
  await page.goto(config.base + "/api/auth/github/login?access=deploy");
  const returned = await page
    .waitForURL((url) => url.origin === origin && /^\/(deploy|dashboard|login)/.test(url.pathname), { timeout: LOGIN_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!h.check("la connexion GitHub réelle ramène sur l'application", returned && new URL(page.url()).pathname === "/deploy", page.url())) {
    throw new Error("connexion non aboutie (refus d'autorisation, délai dépassé ou application OAuth mal réglée : voir docs/GITHUB-OAUTH.md)");
  }

  const me = await page.evaluate(async () => (await fetch("/api/me")).json());
  h.check("la personne est connectée avec un vrai compte GitHub", me.isGuest === false && Boolean(me.login), `login=${me.login}`);
  const status = await page.evaluate(async () => (await fetch("/api/github/status")).json());
  console.log("   état GitHub :", JSON.stringify({ ...status, login: undefined }));
  h.check("les autorisations de déploiement sont accordées", status.canPublish === true && status.canDeploy === true);
  await page.waitForLoadState("load");
  h.check("la génération faite en invité est retrouvée après la connexion", await h.visible(step(1).getByText(/Projet « .* » généré/), 30000));
  await h.shot(page, "1-connecte");

  // ---------------------------------------------------------------- envoi du projet sur un dépôt neuf
  const nameInput = step(2).getByLabel("Nom du dépôt");
  h.check("l'étape 2 propose le nom du dépôt", await h.visible(nameInput, 20000));
  await nameInput.fill(REPO);
  const radio = step(2).getByRole("radio", { name: VISIBILITY === "private" ? /Privé/ : /Public/ });
  h.check(`la visibilité « ${VISIBILITY} » est possible`, await radio.isEnabled());
  await radio.check();
  await step(2).getByRole("button", { name: "Créer le dépôt et envoyer" }).click();
  const created = await h.visible(step(2).getByText(/Dépôt créé, un commit envoyé/), 90000);
  h.check("le dépôt est créé sur le vrai GitHub", created);
  if (!created) {
    console.log("   texte de l'étape 2 :", ((await step(2).textContent()) ?? "").replace(/\s+/g, " ").slice(0, 400));
    throw new Error("dépôt non créé");
  }
  const repoHref = await step(2).getByRole("link", { name: new RegExp(REPO) }).getAttribute("href");
  console.log("   dépôt :", repoHref);
  h.check("le lien mène au dépôt", repoHref === `https://github.com/${me.login}/${REPO}`, repoHref ?? "");
  h.check("aucun avertissement sur le workflow", (await step(2).getByText(/n'a pas été envoyé/).count()) === 0);
  await h.shot(page, "2-depot-cree");

  // ---------------------------------------------------------------- déploiement : lancement du vrai workflow
  const deployButton = step(3).getByRole("button", { name: "Déployer", exact: true });
  h.check("le déploiement automatique est possible", (await h.visible(deployButton, 20000)) && (await deployButton.isEnabled()));
  await step(3).getByLabel(/Adresse publique prévue/).fill(config.base);
  await deployButton.click();
  const runLink = step(3).getByRole("link", { name: /Voir l'exécution sur GitHub Actions/ });
  const started = await h.visible(runLink, 60000);
  h.check("le déploiement démarre avec un lien vers l'exécution GitHub Actions", started);
  if (started) {
    const runHref = (await runLink.getAttribute("href")) ?? "";
    console.log("   exécution :", runHref);
    h.check("le lien d'exécution est celui du dépôt de test", runHref.startsWith(`https://github.com/${me.login}/${REPO}/actions/runs/`), runHref);
  }

  // Sans secrets dans le dépôt de test, l'exécution échoue : ce qui compte est que LONKOO suive l'exécution jusqu'au verdict.
  const verdict = await Promise.race([
    h.visible(step(3).getByText("Déploiement terminé."), RUN_TIMEOUT_MS).then((ok) => (ok ? "réussi" : null)),
    h.visible(step(3).getByText(/s'est terminé sans succès/), RUN_TIMEOUT_MS).then((ok) => (ok ? "échoué" : null)),
  ]);
  console.log("   verdict suivi par LONKOO :", verdict ?? "aucun");
  h.check("LONKOO suit l'exécution jusqu'à son verdict", verdict !== null);
  await h.shot(page, "3-verdict");

  // ---------------------------------------------------------------- hygiène
  const html = await page.content();
  h.check("aucun jeton GitHub dans la page", !/gh[opusr]_[0-9A-Za-z]{10,}/.test(html));
  h.noScriptErrors();

  console.log(`\nÀ faire maintenant : supprimer le dépôt de test https://github.com/${me.login}/${REPO} (Settings > Delete this repository).`);
} catch (error) {
  h.check("le parcours va jusqu'au bout", false, String(error?.message ?? error).split("\n")[0]);
}
process.exit((await h.finish()) === 0 ? 0 : 1);
