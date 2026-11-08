import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SEVERITIES } from "./audit.ts";
import { SEVERITY_TEXT } from "../components/studio/audit-styles.ts";

/**
 * Le contraste AA (4,5 pour du texte courant, WCAG 2) de chaque paire de couleurs de l'onglet Audit, dans les deux thèmes,
 * calculé sur les jetons de `globals.css`. Le parcours de bout en bout `06-audit.mjs` mesure en plus ce qui s'affiche.
 */
const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf-8");

function tokens(block: RegExp): Record<string, string> {
  const body = css.match(block)?.[1] ?? "";
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1] as string, m[2] as string]));
}

const light = tokens(/:root\s*{([^}]*)}/);
const dark = { ...light, ...tokens(/\.dark\s*{([^}]*)}/) };

const channel = (hex: string, from: number) => {
  const v = Number.parseInt(hex.slice(from, from + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
export const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

const tokenOf = (cls: string) => cls.replace(/^text-/, "");

/** [couleur du texte, fond, où] : « #ffffff » est le blanc du bouton principal (`Button`, variante primary). */
const PAIRS: Array<[string, string, string]> = [
  ["ink", "surface", "titres"],
  ["ink-2", "surface", "explications"],
  ["ink-3", "surface", "libellés et pénalités"],
  ["accent", "surface", "liens vers les blocs"],
  ["ink", "sunken", "score"],
  ["ink-3", "sunken", "légendes et compteurs à zéro"],
  ["#ffffff", "brand", "bouton de correction"],
  ...SEVERITIES.flatMap((severity): Array<[string, string, string]> => [
    [tokenOf(SEVERITY_TEXT[severity]), "surface", `puce « ${severity} »`],
    [tokenOf(SEVERITY_TEXT[severity]), "sunken", `compteur « ${severity} »`],
  ]),
];

for (const [name, palette] of [["clair", light], ["sombre", dark]] as const) {
  test(`thème ${name} : chaque paire de couleurs de l'onglet Audit atteint le contraste AA`, () => {
    assert.ok(Object.keys(palette).length > 20, "les jetons de globals.css sont lus");
    for (const [fg, bg, where] of PAIRS) {
      const front = fg.startsWith("#") ? fg : palette[fg];
      const back = palette[bg];
      assert.ok(front && back, `jeton introuvable : ${fg} ou ${bg}`);
      const ratio = contrast(front, back);
      assert.ok(ratio >= 4.5, `${where} : ${fg} sur ${bg} = ${ratio.toFixed(2)} (< 4,5)`);
    }
  });
}

test("le calcul du contraste donne les valeurs connues du WCAG", () => {
  assert.equal(Math.round(contrast("#000000", "#ffffff")), 21);
  assert.equal(contrast("#ffffff", "#ffffff"), 1);
  assert.ok(Math.abs(contrast("#777777", "#ffffff") - 4.48) < 0.02);
});
