/**
 * Exports du canvas (cahier des charges, « exportations multiformats ») : spécification JSON du contrat,
 * code déclaratif Mermaid, image vectorielle SVG. Module pur (aucune dépendance à React ni au navigateur) :
 * il sert aussi au comparateur visuel des versions, et se teste avec le lanceur de tests de Node.
 *
 * Le SVG est un fichier autonome : il porte ses couleurs (thème clair, sans variables CSS) et n'utilise que
 * des polices du système, pour s'afficher de la même façon dans un README, un navigateur ou un traitement de texte.
 */
import type { ArchitectureEdge, ArchitectureNode } from "./lonkoo-data";
import { nodeRect, roundedPath, routeEdge, unionRects, type Rect } from "../components/studio/whiteboard/geometry.ts";
import { edgeToEntry, nodeToEntry, type JsonObject } from "./canvas-model.ts";

/* ------------------------------------------------------------------ */
/* Instantané du contrat                                                */
/* ------------------------------------------------------------------ */

export interface ContractSnapshot {
  schemaVersion: 1;
  meta?: { name?: string; description?: string };
  nodes: { id: string; type: string; position: { x: number; y: number }; data: JsonObject }[];
  edges: { id: string; source: string; target: string; kind?: string; label?: string }[];
}

/**
 * L'instantané du contrat (docs/canvas.schema.json) tiré du graphe du tableau : sans la clé `ui`, trié par
 * identifiant, comme le produit le serveur temps réel. Les liens vers un bloc absent sont écartés.
 */
export function snapshotFromGraph(
  nodes: readonly ArchitectureNode[],
  edges: readonly ArchitectureEdge[],
  meta?: ContractSnapshot["meta"],
): ContractSnapshot {
  const used = new Set<string>();
  const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const outNodes = sorted.map((node) => {
    const entry = nodeToEntry(node, undefined, used);
    const name = entry.data.name;
    if (typeof name === "string") used.add(name);
    return { id: node.id, type: entry.type, position: entry.position, data: entry.data };
  });
  const ids = new Set(sorted.map((node) => node.id));
  const outEdges = [...edges]
    .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((edge) => {
      const { source, target, kind, label } = edgeToEntry(edge);
      return { id: edge.id, source, target, ...(kind ? { kind } : {}), ...(label ? { label } : {}) };
    });
  const snapshot: ContractSnapshot = { schemaVersion: 1, nodes: outNodes, edges: outEdges };
  if (meta && Object.keys(meta).length > 0) snapshot.meta = meta;
  return snapshot;
}

/* ------------------------------------------------------------------ */
/* Mermaid                                                              */
/* ------------------------------------------------------------------ */

/**
 * Texte d'une étiquette Mermaid, sur une seule ligne. Le « # » est remplacé en premier (il introduit les codes),
 * puis les caractères que Mermaid interprète : guillemets, chevrons, esperluette et accent grave (qui ouvre une
 * chaîne Markdown).
 */
function mermaidText(text: string): string {
  return text
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/#/g, "#35;")
    .replace(/`/g, "#96;")
    .replace(/&/g, "#amp;")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;")
    .trim();
}

function mermaidShape(shape: ArchitectureNode["shape"], label: string): (id: string) => string {
  switch (shape) {
    case "cylinder":
      return (id) => `${id}[("${label}")]`;
    case "user":
      return (id) => `${id}(["${label}"])`;
    case "queue":
      return (id) => `${id}[["${label}"]]`;
    case "gateway":
    case "security":
      return (id) => `${id}{{"${label}"}}`;
    default:
      return (id) => `${id}["${label}"]`;
  }
}

/** Code Mermaid (`flowchart LR`) du graphe : se colle tel quel dans un README GitHub, entre ```mermaid et ```. */
export function toMermaid(nodes: readonly ArchitectureNode[], edges: readonly ArchitectureEdge[]): string {
  const ids = new Map<string, string>();
  nodes.forEach((node, index) => ids.set(node.id, `n${index + 1}`));

  const lines = ["flowchart LR"];
  if (nodes.length === 0) lines.push("  %% Architecture vide");
  for (const node of nodes) {
    const title = mermaidText(node.title) || node.id;
    const tech = mermaidText(node.tech);
    const label = tech ? `${title}<br/>${tech}` : title;
    lines.push(`  ${mermaidShape(node.shape, label)(ids.get(node.id) ?? node.id)}`);
  }
  for (const edge of edges) {
    const from = ids.get(edge.from);
    const to = ids.get(edge.to);
    if (!from || !to) continue;
    const label = mermaidText(edge.protocol);
    // Les flux d'événements sont en pointillés, comme un message asynchrone.
    const arrow = edge.protocol === "Kafka / Events" || edge.protocol === "Redis PubSub" ? "-.->" : "-->";
    lines.push(`  ${from} ${arrow}|"${label}"| ${to}`);
  }
  return lines.join("\n") + "\n";
}

/* ------------------------------------------------------------------ */
/* SVG                                                                  */
/* ------------------------------------------------------------------ */

export type ChangeStatus = "added" | "removed" | "modified";

export interface SvgOptions {
  /** Titre lisible par les lecteurs d'écran (élément `<title>`). */
  title?: string;
  /** Comparateur de versions : couleur de chaque bloc et de chaque lien selon son changement. */
  status?: { nodes?: ReadonlyMap<string, ChangeStatus>; edges?: ReadonlyMap<string, ChangeStatus> };
}

export interface RenderedSvg {
  svg: string;
  width: number;
  height: number;
}

const PALETTE = {
  surface: "#FFFFFF",
  subtle: "#F1F5F9",
  stroke: "#94A3B8",
  ink: "#0F172A",
  ink2: "#334155",
  ink3: "#64748B",
  edge: "#64748B",
};

const STATUS_STYLE: Record<ChangeStatus, { stroke: string; fill: string; dash?: string }> = {
  added: { stroke: "#16A34A", fill: "#F0FDF4" },
  removed: { stroke: "#DC2626", fill: "#FEF2F2", dash: "6 4" },
  modified: { stroke: "#EA580C", fill: "#FFF7ED" },
};

const FONT = "Inter, 'Segoe UI', Roboto, Arial, sans-serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";
const MARGIN = 36;

/** Texte sûr dans du XML : caractères spéciaux remplacés, caractères de contrôle (interdits en XML) retirés. */
export function escapeXml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const num = (value: number) => Math.round(value * 10) / 10;

/** Texte coupé à une largeur approximative (en caractères), avec « … ». */
function fit(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= maxChars ? clean : clean.slice(0, Math.max(1, maxChars - 1)).trimEnd() + "…";
}

function text(x: number, y: number, content: string, opts: { size?: number; weight?: number; fill?: string; anchor?: "start" | "middle" | "end"; mono?: boolean }): string {
  const { size = 12, weight = 400, fill = PALETTE.ink, anchor = "start", mono = false } = opts;
  return `<text x="${num(x)}" y="${num(y)}" font-family="${mono ? MONO : FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(content)}</text>`;
}

function nodeSvg(node: ArchitectureNode, rect: Rect, status: ChangeStatus | undefined): string {
  const style = status ? STATUS_STYLE[status] : undefined;
  const stroke = style?.stroke ?? PALETTE.stroke;
  const fill = style?.fill ?? PALETTE.surface;
  const accent = style?.fill ?? PALETTE.subtle;
  const dash = style?.dash ? ` stroke-dasharray="${style.dash}"` : "";
  const sw = status ? 2.4 : 1.6;
  const { x, y, w, h } = rect;
  const tech = node.tech.trim();
  const group = node.moduleGroup.trim();
  const title = fit(node.title, Math.floor((w - 28) / 7));

  switch (node.shape) {
    case "cylinder": {
      const rx = w / 2 - 1.5;
      const ry = 15;
      const cx = x + w / 2;
      return [
        `<g data-node-id="${escapeXml(node.id)}">`,
        `<path d="M ${num(cx - rx)} ${num(y + ry)} V ${num(y + h - ry)} A ${num(rx)} ${ry} 0 0 0 ${num(cx + rx)} ${num(y + h - ry)} V ${num(y + ry)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`,
        `<path d="M ${num(cx - rx)} ${num(y + h * 0.4)} A ${num(rx)} ${ry} 0 0 0 ${num(cx + rx)} ${num(y + h * 0.4)} M ${num(cx - rx)} ${num(y + h * 0.68)} A ${num(rx)} ${ry} 0 0 0 ${num(cx + rx)} ${num(y + h * 0.68)}" fill="none" stroke="${stroke}" stroke-width="1.3"/>`,
        `<ellipse cx="${num(cx)}" cy="${num(y + ry)}" rx="${num(rx)}" ry="${ry}" fill="${accent}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`,
        text(cx, y + h * 0.56, title, { size: 13, weight: 600, anchor: "middle" }),
        text(cx, y + h * 0.56 + 16, fit(tech || group, Math.floor((w - 28) / 6.4)), { size: 11, fill: PALETTE.ink3, anchor: "middle" }),
        `</g>`,
      ].join("");
    }
    case "user": {
      const cx = x + w / 2;
      return [
        `<g data-node-id="${escapeXml(node.id)}">`,
        `<circle cx="${num(cx)}" cy="${num(y + 26)}" r="15" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`,
        `<path d="M ${num(cx - 34)} ${num(y + 82)} C ${num(cx - 34)} ${num(y + 58)} ${num(cx - 18)} ${num(y + 49)} ${num(cx)} ${num(y + 49)} C ${num(cx + 18)} ${num(y + 49)} ${num(cx + 34)} ${num(y + 58)} ${num(cx + 34)} ${num(y + 82)} Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"${dash}/>`,
        text(cx, y + h - 18, title, { size: 13, weight: 600, anchor: "middle" }),
        text(cx, y + h - 3, fit(tech || group, Math.floor((w + 20) / 6.4)), { size: 11, fill: PALETTE.ink3, anchor: "middle" }),
        `</g>`,
      ].join("");
    }
    case "queue": {
      const cap = 14;
      return [
        `<g data-node-id="${escapeXml(node.id)}">`,
        `<path d="M ${num(x + cap)} ${num(y + 3)} H ${num(x + w - cap)} A ${cap} ${num(h / 2 - 3)} 0 0 1 ${num(x + w - cap)} ${num(y + h - 3)} H ${num(x + cap)} A ${cap} ${num(h / 2 - 3)} 0 0 1 ${num(x + cap)} ${num(y + 3)} Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`,
        `<ellipse cx="${num(x + cap)}" cy="${num(y + h / 2)}" rx="${cap}" ry="${num(h / 2 - 3)}" fill="${accent}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`,
        text(x + w / 2 + 8, y + h / 2 - 2, title, { size: 13, weight: 600, anchor: "middle" }),
        text(x + w / 2 + 8, y + h / 2 + 14, fit(tech || group, Math.floor((w - 60) / 6.4)), { size: 11, fill: PALETTE.ink3, anchor: "middle" }),
        `</g>`,
      ].join("");
    }
    default: {
      const parts = [
        `<g data-node-id="${escapeXml(node.id)}">`,
        `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`,
        text(x + 14, y + (tech ? 28 : 30), title, { size: 13, weight: 600 }),
        text(x + 14, y + (tech ? 46 : 49), fit(group, Math.floor((w - 28) / 6.2)), { size: 11, fill: PALETTE.ink3 }),
      ];
      if (tech) {
        parts.push(
          `<line x1="${num(x + 14)}" x2="${num(x + w - 14)}" y1="${num(y + h - 32)}" y2="${num(y + h - 32)}" stroke="${PALETTE.subtle}" stroke-width="1.5"/>`,
          text(x + 14, y + h - 12, fit(tech, Math.floor((w - 28 - (node.version ? 50 : 0)) / 6.6)), { size: 11, weight: 600, fill: PALETTE.ink2, mono: true }),
        );
        if (node.version) parts.push(text(x + w - 14, y + h - 12, fit(node.version, 8), { size: 11, fill: PALETTE.ink3, anchor: "end", mono: true }));
      }
      parts.push(`</g>`);
      return parts.join("");
    }
  }
}

const shortProtocol = (protocol: string) => protocol.split("/")[0]?.trim() ?? protocol;

function edgeSvg(edge: ArchitectureEdge, a: Rect, b: Rect, status: ChangeStatus | undefined): string {
  const route = routeEdge(a, b);
  const style = status ? STATUS_STYLE[status] : undefined;
  const color = style?.stroke ?? PALETTE.edge;
  const dash = style?.dash ? ` stroke-dasharray="${style.dash}"` : "";
  const label = shortProtocol(edge.protocol);
  const labelWidth = label.length * 6.6 + 16;
  const marker = status ?? "plain";
  return [
    `<g data-edge-id="${escapeXml(edge.id)}">`,
    `<path d="${roundedPath(route.points, 12)}" fill="none" stroke="${color}" stroke-width="${status ? 2.2 : 1.8}"${dash} marker-end="url(#arrow-${marker})"/>`,
    `<rect x="${num(route.mid.x - labelWidth / 2)}" y="${num(route.mid.y - 10)}" width="${num(labelWidth)}" height="20" rx="6" fill="${PALETTE.surface}" stroke="${color}" stroke-width="1"/>`,
    text(route.mid.x, route.mid.y + 4, label, { size: 11, weight: 600, fill: PALETTE.ink2, anchor: "middle", mono: true }),
    `</g>`,
  ].join("");
}

function markers(): string {
  const arrow = (id: string, color: string) =>
    `<marker id="arrow-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 1 L 10 5 L 0 9 z" fill="${color}"/></marker>`;
  return `<defs>${arrow("plain", PALETTE.edge)}${arrow("added", STATUS_STYLE.added.stroke)}${arrow("removed", STATUS_STYLE.removed.stroke)}${arrow("modified", STATUS_STYLE.modified.stroke)}</defs>`;
}

/** Image vectorielle autonome du graphe (fond blanc, thème clair). Un graphe vide donne une image minimale. */
export function toSvg(nodes: readonly ArchitectureNode[], edges: readonly ArchitectureEdge[], options: SvgOptions = {}): RenderedSvg {
  const rects = new Map<string, Rect>(nodes.map((node) => [node.id, nodeRect(node)]));
  const bounds = unionRects([...rects.values()]) ?? { x: 0, y: 0, w: 240, h: 120 };
  const x = bounds.x - MARGIN;
  const y = bounds.y - MARGIN;
  const width = Math.ceil(bounds.w + MARGIN * 2);
  const height = Math.ceil(bounds.h + MARGIN * 2);

  const body: string[] = [];
  for (const edge of edges) {
    const a = rects.get(edge.from);
    const b = rects.get(edge.to);
    if (a && b) body.push(edgeSvg(edge, a, b, options.status?.edges?.get(edge.id)));
  }
  for (const node of nodes) {
    const rect = rects.get(node.id);
    if (rect) body.push(nodeSvg(node, rect, options.status?.nodes?.get(node.id)));
  }
  if (nodes.length === 0) body.push(text(x + width / 2, y + height / 2, "Architecture vide", { size: 14, fill: PALETTE.ink3, anchor: "middle" }));

  const title = options.title ? `<title>${escapeXml(options.title)}</title>` : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${num(x)} ${num(y)} ${width} ${height}" role="img">` +
    title +
    markers() +
    `<rect x="${num(x)}" y="${num(y)}" width="${width}" height="${height}" fill="${PALETTE.surface}"/>` +
    body.join("") +
    `</svg>\n`;
  return { svg, width, height };
}
