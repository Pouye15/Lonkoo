import type { Severity } from "../../lib/audit.ts";

/**
 * Couleur du texte de chaque gravité (jetons de design). Les noms de classe sont écrits en entier : Tailwind ne
 * trouve que ce qu'il lit. Un test (`lib/audit-contrast.test.ts`) vérifie que chaque paire reste au seuil AA dans
 * les deux thèmes.
 */
export const SEVERITY_TEXT: Record<Severity, string> = {
  critique: "text-danger",
  important: "text-warn",
  mineur: "text-ink-2",
};
