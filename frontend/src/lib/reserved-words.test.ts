import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { RESERVED_WORD_LISTS, isReserved } from "./reserved-words.ts";

/** Lit les mots d'un `Set.of(...)` Java donné par le nom de sa constante. */
function javaSet(source: string, constant: string): string[] {
  const match = new RegExp(`${constant}\\s*=\\s*Set\\.of\\(([^;]*)\\);`).exec(source);
  assert.ok(match?.[1], `constante ${constant} introuvable dans ReservedWords.java`);
  return [...match[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1] as string);
}

test("les mots réservés du front sont ceux du backend (ReservedWords.java fait foi)", () => {
  const path = fileURLToPath(
    new URL("../../../backend/src/main/java/com/lonkoo/backend/canvas/ReservedWords.java", import.meta.url),
  );
  const java = readFileSync(path, "utf-8");
  for (const [key, constant] of [["java", "JAVA"], ["sql", "SQL"], ["yaml", "YAML"]] as const) {
    assert.deepEqual([...RESERVED_WORD_LISTS[key]].sort(), javaSet(java, constant).sort(), `liste ${constant}`);
  }
});

test("isReserved reconnaît un mot de chaque liste et laisse passer un nom ordinaire", () => {
  for (const word of ["class", "select", "yes", "user", "database", "index"]) assert.ok(isReserved(word), word);
  for (const word of ["api", "passerelle", "boutique_web", "cache"]) assert.ok(!isReserved(word), word);
});
