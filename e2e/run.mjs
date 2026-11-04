#!/usr/bin/env node
/**
 * Lance les parcours de bout en bout, l'un après l'autre, contre l'application dont l'adresse est dans E2E_BASE_URL.
 *
 *   node run.mjs                  tous les parcours
 *   node run.mjs --only 01,03     ceux dont le fichier commence par 01 ou 03
 *   node run.mjs --list           les liste sans rien lancer
 *
 * Code de sortie : 0 si toutes les vérifications passent, 1 sinon.
 */
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

import { config, startHarness } from "./lib/harness.mjs";

const dir = fileURLToPath(new URL("./scenarios/", import.meta.url));
const files = readdirSync(dir).filter((file) => file.endsWith(".mjs")).sort();

const args = process.argv.slice(2);
const onlyIndex = args.indexOf("--only");
const only = onlyIndex >= 0 ? (args[onlyIndex + 1] ?? "").split(",").filter(Boolean) : [];
const selected = only.length ? files.filter((file) => only.some((prefix) => file.startsWith(prefix))) : files;

if (args.includes("--list")) {
  for (const file of files) {
    const { title } = await import(pathToFileURL(join(dir, file)).href);
    console.log(`${file}  ${title}`);
  }
  process.exit(0);
}
if (selected.length === 0) {
  console.error(`Aucun parcours ne correspond à « ${only.join(",")} ». Parcours : ${files.join(", ")}`);
  process.exit(2);
}

console.log(`Application : ${config.base}\n`);
let failed = 0;
for (const file of selected) {
  const scenario = await import(pathToFileURL(join(dir, file)).href);
  console.log(`=== ${file} : ${scenario.title}`);
  const h = await startHarness(file.replace(/\.mjs$/, ""));
  try {
    await scenario.run(h);
  } catch (error) {
    h.check("le parcours va jusqu'au bout", false, String(error?.message ?? error).split("\n")[0]);
  }
  failed += await h.finish();
  console.log("");
}

console.log(failed === 0 ? "Tous les parcours passent." : `${failed} vérification(s) en échec.`);
process.exit(failed === 0 ? 0 : 1);
