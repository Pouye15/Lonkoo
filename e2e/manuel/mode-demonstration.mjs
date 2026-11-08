#!/usr/bin/env node
/**
 * Vérifie l'onglet Audit du Studio en MODE DÉMONSTRATION (sans API), dans un vrai navigateur. Ce mode est fixé à la
 * construction de l'interface (`NEXT_PUBLIC_API_MODE`), donc `npm run e2e` (qui exige le mode API) ne peut pas le couvrir.
 * C'est le mode du repli de la démo : si le backend ne démarre pas, l'interface seule suffit.
 *
 *   1. arrêter l'interface en mode API, puis, dans frontend/ :
 *        NEXT_PUBLIC_API_MODE=demo npm run dev          (la page de connexion porte alors data-api-mode="mock")
 *   2. cd e2e && E2E_BASE_URL=http://localhost:3000 npm run demo-mode
 *   3. relancer l'interface en mode API.
 *
 * Il crée une session simulée dans le navigateur (aucun serveur, aucun compte). Capture : e2e/captures/mode-demonstration.png
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const base = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const shots = process.env.E2E_SHOTS || fileURLToPath(new URL("../captures", import.meta.url));
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failed += 1;
};

await page.goto(base + "/login", { waitUntil: "load" });
const mode = await page.locator("html").getAttribute("data-api-mode");
if (mode !== "mock") {
  console.error(`L'interface n'est pas en mode démonstration (data-api-mode="${mode}"). Relancez-la avec NEXT_PUBLIC_API_MODE=demo.`);
  await browser.close();
  process.exit(2);
}
check("le mode est « démonstration »", true);

await page.getByRole("button", { name: /Essayer sans compte/ }).click();
await page.waitForURL(/\/dashboard/, { timeout: 20000 });
await page.goto(base + "/studio?tab=scanner", { waitUntil: "load" });
const score = page.locator("[data-audit-score]");
await score.waitFor({ timeout: 20000 });
const text = ((await score.textContent()) ?? "").trim();
check("l'audit calcule un score sur le graphe de démonstration", /^\d+\/100$/.test(text), `score ${text}`);
check("ce n'est pas le score constant d'avant (86 %)", text !== "86/100" && !text.includes("%"));
const findings = await page.locator("li[data-rule]").count();
check("des constats sont listés, et l'onglet annonce leur nombre", findings >= 1 && (await page.getByText(`Audit (${findings})`).count()) >= 1, `${findings} constat(s)`);
check("l'authentification reliée à la passerelle n'est pas dite « sans rôle »", (await page.locator('li[data-rule="auth-non-reliee"]').count()) === 0);
check("les suggestions de l'IA de démonstration s'affichent, au nombre de trois", (await page.getByText("Suggestions de l'IA").count()) === 1 && (await page.getByRole("button", { name: "Appliquer" }).count()) === 3);
check("le « Score IA » d'avant n'est plus affiché", (await page.getByText(/Score IA/).count()) === 0);
await page.screenshot({ path: join(shots, "mode-demonstration.png"), fullPage: true });

// Une suggestion de démonstration modifie le graphe : l'audit se recalcule au lieu de rester figé.
await page.getByRole("button", { name: "Appliquer" }).first().click();
await page.waitForTimeout(500);
check("l'audit reste calculé après une suggestion appliquée", /^\d+\/100$/.test(((await score.textContent()) ?? "").trim()));

// Un nom de bloc ramène au tableau blanc.
await page.locator("li[data-rule] button").first().click();
await page.getByRole("application", { name: "Tableau blanc d'architecture" }).waitFor({ timeout: 15000 });
check("un nom de bloc ouvre le tableau blanc", !page.url().includes("tab=scanner"));
check("aucune erreur JavaScript", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log(failed === 0 ? "\nTout passe." : `\n${failed} échec(s).`);
process.exit(failed === 0 ? 0 : 1);
