import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Les écrans sans backend derrière, qui affichent les exemples fictifs de `lonkoo-data.ts` même en mode API.
 * Règle du front (CLAUDE.md, § 5, point 4) : chacun doit dire qu'il est une démonstration.
 */
const FICTIONAL_SCREENS = [
  "app/(app)/palabre/page.tsx",
  "app/(app)/reviews/page.tsx",
  "app/(app)/settings/page.tsx",
  "components/palabre/BlueprintDetailClient.tsx",
];

test("chaque écran fictif affiche l'avertissement de démonstration", () => {
  for (const file of FICTIONAL_SCREENS) {
    const source = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf-8");
    assert.match(source, /import \{ DemoNotice \} from "@\/components\/ui\/DemoNotice";/, `${file} : import`);
    assert.match(source, /<DemoNotice>/, `${file} : avertissement`);
  }
});
