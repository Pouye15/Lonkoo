/**
 * Formes et règles pures de l'agent IA (`/api/canvases/{id}/ai/*`, docs/openapi.yaml, tag « IA ») :
 * lecture tolérante des réponses, libellés des gravités et des catégories, décompte des remarques,
 * messages d'erreur lisibles et découpage du flux SSE du chatbot.
 *
 * Aucun accès réseau ici (les appels sont dans `ai-api.ts`) et aucune dépendance à React : ce module se
 * teste seul avec le lanceur de tests de Node (`npm test`, `ai.test.ts`).
 *
 * Règle de fond : rien n'est inventé. L'API ne renvoie ni score, ni gain chiffré, ni correctif applicable ;
 * on n'affiche donc que ce qu'elle dit, et un décompte calculé d'après les remarques réelles.
 */

import { ApiError, messageOf } from "./api.ts";
import { asEdgeEntry, asNodeEntry, edgeFromEntry, nodeFromEntry } from "./canvas-model.ts";
import { AI_SUGGESTIONS, type ArchitectureEdge, type ArchitectureNode } from "./lonkoo-data.ts";

/* ------------------------------------------------------------------ */
/* Formes échangées                                                     */
/* ------------------------------------------------------------------ */

export type AiSeverity = "CRITICAL" | "RECOMMENDED" | "OPTIMIZATION";
export type AiCategory = "RESILIENCE" | "STACK" | "SECURITY" | "PERFORMANCE";

/**
 * Une remarque d'audit, **consultative** : le serveur ne modifie jamais le canvas. Les champs que le serveur
 * n'a pas écrits valent `null` ou la chaîne vide : on ne les remplace pas par une valeur inventée.
 */
export interface AiFinding {
  id: string;
  severity: AiSeverity | null;
  category: AiCategory | null;
  title: string;
  /** Bloc visé ; le serveur écarte les remarques qui visent un bloc absent. */
  targetNodeId: string | null;
  rationale: string;
  currentConfig: string;
  proposedConfig: string;
}

export interface AiAuditResult {
  findings: AiFinding[];
  /** Remarques écartées par le serveur parce qu'elles visaient un bloc absent du canvas. */
  discarded: number;
  /** Vrai quand la réponse est figée (agent de démonstration) et non celle d'un agent. */
  demo: boolean;
}

/** Instantané du contrat tel que l'API le renvoie (docs/canvas.schema.json). */
export interface AiCanvasSnapshot {
  schemaVersion?: number;
  nodes?: unknown;
  edges?: unknown;
  meta?: unknown;
}

/** Réponse de `/ai/sketch` et `/ai/complete` : une proposition complète, à accepter ou non. */
export interface AiProposal {
  canvas: AiCanvasSnapshot | null;
  summary: string;
  demo: boolean;
  /** Avertissements en français (blocs que la proposition fait disparaître) ; absent sur les serveurs qui ne les envoient pas encore. */
  warnings?: string[];
}

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatResult {
  reply: string;
  suggestedActions: string[];
  demo: boolean;
}

/* ------------------------------------------------------------------ */
/* Libellés                                                             */
/* ------------------------------------------------------------------ */

export const SEVERITY_LABELS: Record<AiSeverity, string> = {
  CRITICAL: "critique",
  RECOMMENDED: "recommandé",
  OPTIMIZATION: "optimisation",
};

export const CATEGORY_LABELS: Record<AiCategory, string> = {
  RESILIENCE: "Résilience",
  STACK: "Stack Technique",
  SECURITY: "Sécurité",
  PERFORMANCE: "Performance",
};

const SEVERITIES = Object.keys(SEVERITY_LABELS) as AiSeverity[];
const CATEGORIES = Object.keys(CATEGORY_LABELS) as AiCategory[];

/** La gravité, ou `null` si le serveur n'en a pas écrit une que l'on connaisse. */
export function asSeverity(value: unknown): AiSeverity | null {
  return SEVERITIES.find((severity) => severity === value) ?? null;
}

export function asCategory(value: unknown): AiCategory | null {
  return CATEGORIES.find((category) => category === value) ?? null;
}

export function severityLabel(severity: AiSeverity | null): string {
  return severity ? SEVERITY_LABELS[severity] : "gravité non précisée";
}

export function categoryLabel(category: AiCategory | null): string {
  return category ? CATEGORY_LABELS[category] : "catégorie non précisée";
}

/** Ordre d'affichage : le plus grave d'abord, les gravités inconnues à la fin. */
export function severityRank(severity: AiSeverity | null): number {
  switch (severity) {
    case "CRITICAL":
      return 0;
    case "RECOMMENDED":
      return 1;
    case "OPTIMIZATION":
      return 2;
    default:
      return 3;
  }
}

/** Les remarques triées par gravité, l'ordre du serveur étant conservé à gravité égale. */
export function sortFindings(findings: readonly AiFinding[]): AiFinding[] {
  return [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

/* ------------------------------------------------------------------ */
/* Lecture tolérante des réponses                                       */
/* ------------------------------------------------------------------ */

const asText = (value: unknown): string => (typeof value === "string" ? value : "");
const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

function asFinding(value: unknown, index: number): AiFinding | null {
  const entry = asObject(value);
  if (!entry) return null;
  const title = asText(entry.title).trim();
  const rationale = asText(entry.rationale).trim();
  // Une remarque sans titre ni explication n'a rien à montrer : on ne la complète pas, on l'ignore.
  if (!title && !rationale) return null;
  const targetNodeId = asText(entry.targetNodeId).trim();
  return {
    id: asText(entry.id).trim() || `remarque-${index + 1}`,
    severity: asSeverity(entry.severity),
    category: asCategory(entry.category),
    title,
    targetNodeId: targetNodeId || null,
    rationale,
    currentConfig: asText(entry.currentConfig).trim(),
    proposedConfig: asText(entry.proposedConfig).trim(),
  };
}

/** La réponse de `/ai/audit`, lue sans rien compléter : un champ absent reste vide. */
export function asAuditResult(payload: unknown): AiAuditResult {
  const body = asObject(payload);
  const list = Array.isArray(body?.findings) ? body.findings : [];
  const findings: AiFinding[] = [];
  list.forEach((item, index) => {
    const finding = asFinding(item, index);
    if (finding) findings.push(finding);
  });
  const discarded = typeof body?.discarded === "number" && Number.isFinite(body.discarded) ? Math.max(0, Math.trunc(body.discarded)) : 0;
  return { findings, discarded, demo: body?.demo === true };
}

/** La réponse de `/ai/sketch` et `/ai/complete`. `warnings` est facultatif côté serveur. */
export function asProposal(payload: unknown): AiProposal {
  const body = asObject(payload);
  const warnings = Array.isArray(body?.warnings)
    ? body.warnings.filter((line): line is string => typeof line === "string" && line.trim() !== "")
    : undefined;
  return {
    canvas: asObject(body?.canvas) as AiCanvasSnapshot | null,
    summary: asText(body?.summary).trim(),
    demo: body?.demo === true,
    ...(warnings && warnings.length > 0 ? { warnings } : {}),
  };
}

export function asChatResult(payload: unknown): AiChatResult {
  const body = asObject(payload);
  const actions = Array.isArray(body?.suggestedActions)
    ? body.suggestedActions.filter((line): line is string => typeof line === "string" && line.trim() !== "")
    : [];
  return { reply: asText(body?.reply).trim(), suggestedActions: actions, demo: body?.demo === true };
}

/* ------------------------------------------------------------------ */
/* Décompte et mise en forme                                            */
/* ------------------------------------------------------------------ */

export interface SeverityCounts {
  CRITICAL: number;
  RECOMMENDED: number;
  OPTIMIZATION: number;
  /** Remarques dont la gravité n'est pas une de celles du contrat. */
  other: number;
  total: number;
}

/** Le seul indicateur honnête que l'on puisse tirer d'un audit : le décompte par gravité. */
export function countBySeverity(findings: readonly AiFinding[]): SeverityCounts {
  const counts: SeverityCounts = { CRITICAL: 0, RECOMMENDED: 0, OPTIMIZATION: 0, other: 0, total: findings.length };
  for (const finding of findings) {
    if (finding.severity) counts[finding.severity] += 1;
    else counts.other += 1;
  }
  return counts;
}

const COUNT_LABELS: Record<AiSeverity | "other", [string, string]> = {
  CRITICAL: ["critique", "critiques"],
  RECOMMENDED: ["recommandée", "recommandées"],
  OPTIMIZATION: ["optimisation", "optimisations"],
  other: ["sans gravité précisée", "sans gravité précisée"],
};

/** « 2 critiques, 1 recommandée » ; chaîne vide s'il n'y a aucune remarque. */
export function severitySummary(findings: readonly AiFinding[]): string {
  const counts = countBySeverity(findings);
  const parts: string[] = [];
  for (const key of [...SEVERITIES, "other"] as (AiSeverity | "other")[]) {
    const count = counts[key];
    if (count === 0) continue;
    const labels = COUNT_LABELS[key];
    parts.push(`${count} ${count > 1 ? labels[1] : labels[0]}`);
  }
  return parts.join(", ");
}

/** « 6 remarques : 2 critiques, 4 recommandées ». */
export function findingsSummary(findings: readonly AiFinding[]): string {
  if (findings.length === 0) return "Aucune remarque";
  const head = `${findings.length} remarque${findings.length > 1 ? "s" : ""}`;
  const detail = severitySummary(findings);
  return detail ? `${head} : ${detail}` : head;
}

/** Ce que le serveur a écarté (remarques visant un bloc absent du canvas), ou `null` s'il n'a rien écarté. */
export function discardedNotice(discarded: number): string | null {
  if (discarded <= 0) return null;
  return discarded === 1
    ? "1 remarque a été écartée : elle visait un bloc absent du canvas."
    : `${discarded} remarques ont été écartées : elles visaient des blocs absents du canvas.`;
}

/** La consigne envoyée à `/ai/complete` pour une remarque : ce qu'elle propose, à défaut son titre. */
export function correctionInstruction(finding: Pick<AiFinding, "proposedConfig" | "title">): string {
  return finding.proposedConfig.trim() || finding.title.trim();
}

/**
 * Nom de la version enregistrée avant d'appliquer une proposition de l'IA : elle rend le retour en arrière
 * possible en un clic depuis l'onglet « Versions » (80 caractères au plus côté serveur).
 */
export function backupVersionName(date: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `Avant IA ${two(date.getHours())}h${two(date.getMinutes())}`;
}

/* ------------------------------------------------------------------ */
/* Erreurs                                                             */
/* ------------------------------------------------------------------ */

/**
 * Message à montrer quand un appel à l'IA échoue. Chaque cas du contrat a sa phrase : limite du jour (429),
 * agent non branché (501), sortie refusée ou fournisseur en panne (502, 503, 504). Le reste passe par
 * `messageOf`, qui lit le `detail` des erreurs `application/problem+json`.
 */
export function aiErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return messageOf(error);
  const detail = error.message && error.message !== error.title ? error.message : "";
  switch (error.status) {
    case 429:
      return detail || "La limite d'appels à l'IA pour aujourd'hui est atteinte. Réessayez demain.";
    case 501:
      return "L'agent IA n'est pas branché sur ce serveur.";
    case 502:
      return error.errors.length > 0
        ? "La proposition de l'agent IA ne respecte pas le contrat du canvas : elle a été refusée, rien n'a été modifié."
        : "Le fournisseur d'IA est indisponible pour le moment. Réessayez dans un instant.";
    case 503:
      return "Le fournisseur d'IA est indisponible pour le moment. Réessayez dans un instant.";
    case 504:
      return "Le fournisseur d'IA n'a pas répondu à temps. Réessayez dans un instant.";
    default:
      return messageOf(error);
  }
}

/* ------------------------------------------------------------------ */
/* Flux SSE du chatbot                                                  */
/* ------------------------------------------------------------------ */

export type ChatStreamEvent =
  | { kind: "text"; text: string }
  | { kind: "done" }
  | { kind: "error"; message: string }
  /** Événement reçu mais sans rien à afficher (commentaire, champ inconnu, fragment illisible). */
  | { kind: "ignored" };

/**
 * Les événements **complets** d'un tampon SSE, et ce qu'il reste à compléter.
 *
 * Un morceau du réseau ne contient pas forcément des événements entiers : le reste doit être gardé et
 * complété par la lecture suivante, sinon un événement coupé en deux est perdu.
 */
export function takeSseEvents(buffer: string): { events: string[]; rest: string } {
  const pieces = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = pieces.pop() ?? "";
  return { events: pieces.filter((piece) => piece.trim() !== ""), rest };
}

/** Le contenu des lignes `data:` d'un événement, ou `null` si l'événement n'en porte pas. */
export function sseData(event: string): string | null {
  const lines = event.split("\n").filter((line) => line.startsWith("data:"));
  if (lines.length === 0) return null;
  return lines.map((line) => line.slice("data:".length).replace(/^ /, "")).join("\n");
}

/**
 * Ce qu'un événement du flux apporte. Un fragment qui n'est pas du JSON analysable n'est **jamais** affiché :
 * ce serait du JSON tronqué dans la bulle de réponse.
 */
export function parseChatEvent(event: string): ChatStreamEvent {
  const data = sseData(event);
  if (data === null) return { kind: "ignored" };
  const trimmed = data.trim();
  if (trimmed === "") return { kind: "ignored" };
  if (trimmed === "[DONE]") return { kind: "done" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { kind: "ignored" };
  }
  const body = asObject(parsed);
  if (!body) return { kind: "ignored" };
  if (typeof body.error === "string" && body.error.trim() !== "") return { kind: "error", message: body.error.trim() };
  if (typeof body.content === "string" && body.content !== "") return { kind: "text", text: body.content };
  return { kind: "ignored" };
}

/** Les événements interprétés d'un tampon SSE, et le reste à compléter. */
export function takeChatEvents(buffer: string): { events: ChatStreamEvent[]; rest: string } {
  const { events, rest } = takeSseEvents(buffer);
  return { events: events.map(parseChatEvent), rest };
}

/* ------------------------------------------------------------------ */
/* Proposition vers graphe du tableau blanc                             */
/* ------------------------------------------------------------------ */

/**
 * Le bloc à écrire : la proposition décide du contrat (titre, stack, champs, position), le bloc existant
 * garde ce qui ne lui appartient pas (version, métriques du simulateur, réplicas…). Un bloc dont la forme
 * change est repris tel quel : les champs de l'ancienne forme ne s'appliquent plus.
 */
function mergeNode(proposed: ArchitectureNode, existing: ArchitectureNode | undefined): ArchitectureNode {
  if (!existing || existing.shape !== proposed.shape) return proposed;
  return {
    ...existing,
    title: proposed.title,
    tech: proposed.tech,
    x: proposed.x,
    y: proposed.y,
    description: proposed.description || existing.description,
    contract: proposed.contract,
  };
}

/**
 * Le graphe du tableau blanc correspondant à un instantané proposé par l'IA, en gardant les champs propres
 * au front des blocs qui existent déjà. Les entrées mal formées et les liens vers un bloc absent sont écartés.
 */
export function graphFromSnapshot(
  snapshot: AiCanvasSnapshot | null | undefined,
  current: readonly ArchitectureNode[] = [],
): { nodes: ArchitectureNode[]; edges: ArchitectureEdge[] } {
  const existing = new Map(current.map((node) => [node.id, node]));
  const nodes: ArchitectureNode[] = [];
  const nodeList = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  for (const item of nodeList) {
    const id = asText(asObject(item)?.id).trim();
    const entry = id ? asNodeEntry(item) : null;
    if (!entry) continue;
    nodes.push(mergeNode(nodeFromEntry(id, entry), existing.get(id)));
  }

  const known = new Set(nodes.map((node) => node.id));
  const edges: ArchitectureEdge[] = [];
  const edgeList = Array.isArray(snapshot?.edges) ? snapshot.edges : [];
  for (const item of edgeList) {
    const id = asText(asObject(item)?.id).trim();
    const entry = id ? asEdgeEntry(item) : null;
    if (!entry || !known.has(entry.source) || !known.has(entry.target)) continue;
    edges.push(edgeFromEntry(id, entry));
  }
  return { nodes, edges };
}

/* ------------------------------------------------------------------ */
/* Mode démonstration du front                                          */
/* ------------------------------------------------------------------ */

const SEVERITY_BY_LABEL: Record<string, AiSeverity> = {
  critique: "CRITICAL",
  recommandé: "RECOMMENDED",
  optimisation: "OPTIMIZATION",
};

const CATEGORY_BY_LABEL: Record<string, AiCategory> = {
  Résilience: "RESILIENCE",
  "Stack Technique": "STACK",
  Sécurité: "SECURITY",
  Performance: "PERFORMANCE",
};

/**
 * Les remarques d'exemple du mode démonstration du front (`NEXT_PUBLIC_API_MODE` autre que `live`), portant
 * `demo: true` : l'interface les étiquette comme une démonstration et ne les présente jamais comme un audit.
 */
export function demoAuditResult(): AiAuditResult {
  return {
    findings: AI_SUGGESTIONS.map((suggestion) => ({
      id: suggestion.id,
      severity: SEVERITY_BY_LABEL[suggestion.severity] ?? null,
      category: CATEGORY_BY_LABEL[suggestion.category] ?? null,
      title: suggestion.title,
      targetNodeId: suggestion.targetNodeId,
      rationale: suggestion.rationale,
      currentConfig: suggestion.currentConfig,
      proposedConfig: suggestion.proposedConfig,
    })),
    discarded: 0,
    demo: true,
  };
}
