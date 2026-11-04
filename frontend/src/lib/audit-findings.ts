/**
 * Remarques de l'audit d'architecture renvoyées par le serveur (`POST /api/canvases/{id}/ai/audit`, voir
 * docs/openapi.yaml), converties pour l'onglet « Analyse IA ». Règles pures, sans réseau, pour pouvoir les tester seules
 * (`npm test`).
 */

import type { AISuggestion } from "./lonkoo-data.ts";

/** Une remarque telle que le serveur la renvoie : ni score, ni chiffre, ni correctif automatique. */
export type LiveAuditFinding = {
  id?: string;
  severity?: string;
  category?: string;
  title?: string;
  targetNodeId?: string;
  currentConfig?: string;
  proposedConfig?: string;
  rationale?: string;
};

export type LiveAuditResponse = {
  findings?: LiveAuditFinding[];
};

const CATEGORIES: Record<string, AISuggestion["category"]> = {
  RESILIENCE: "Résilience",
  STACK: "Stack Technique",
  SECURITY: "Sécurité",
  PERFORMANCE: "Performance",
};

const SEVERITIES: Record<string, AISuggestion["severity"]> = {
  CRITICAL: "critique",
  RECOMMENDED: "recommandé",
  OPTIMIZATION: "optimisation",
};

/**
 * Une remarque du serveur, telle quelle. Rien n'est ajouté : ni score, ni chiffre, ni correctif automatique que le
 * serveur n'a pas fournis (une remarque réelle est consultative : elle ne modifie jamais le canvas). Une remarque dont
 * la gravité ou la catégorie est inconnue, ou sans titre ni bloc visé, est écartée, pas devinée.
 */
export function toSuggestion(finding: LiveAuditFinding, index: number): AISuggestion[] {
  const severity = SEVERITIES[finding.severity ?? ""];
  const category = CATEGORIES[finding.category ?? ""];
  if (!severity || !category || !finding.title || !finding.targetNodeId) return [];
  return [
    {
      id: finding.id || `remarque-${index + 1}`,
      severity,
      category,
      title: finding.title,
      targetNodeId: finding.targetNodeId,
      currentConfig: finding.currentConfig ?? "",
      proposedConfig: finding.proposedConfig ?? "",
      rationale: finding.rationale ?? "",
    },
  ];
}

export function toSuggestions(response: LiveAuditResponse): AISuggestion[] {
  return (response.findings ?? []).flatMap(toSuggestion);
}
