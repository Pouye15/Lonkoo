import type { ArchitectureNode } from "@/lib/lonkoo-data";

/** Pas de la grille d'aimantation, en unités du canevas. */
export const GRID = 10;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = "top" | "right" | "bottom" | "left";

type SizedNode = Pick<ArchitectureNode, "shape" | "tech">;

/** Dimensions d'un bloc : les formes à silhouette propre ont une taille fixe, les autres suivent la stack. */
export function nodeSize(node: SizedNode): { w: number; h: number } {
  switch (node.shape) {
    case "cylinder":
      return { w: 184, h: 108 };
    case "user":
      return { w: 120, h: 116 };
    case "queue":
      return { w: 224, h: 68 };
    default:
      return { w: 196, h: node.tech.trim() ? 96 : 64 };
  }
}

export function nodeRect(node: ArchitectureNode, dx = 0, dy = 0): Rect {
  const { w, h } = nodeSize(node);
  return { x: node.x + dx, y: node.y + dy, w, h };
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

export function anchorPoint(rect: Rect, side: Side): Point {
  switch (side) {
    case "top":
      return { x: rect.x + rect.w / 2, y: rect.y };
    case "bottom":
      return { x: rect.x + rect.w / 2, y: rect.y + rect.h };
    case "left":
      return { x: rect.x, y: rect.y + rect.h / 2 };
    case "right":
      return { x: rect.x + rect.w, y: rect.y + rect.h / 2 };
  }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function pointInRect(point: Point, rect: Rect, margin = 0): boolean {
  return (
    point.x >= rect.x - margin &&
    point.x <= rect.x + rect.w + margin &&
    point.y >= rect.y - margin &&
    point.y <= rect.y + rect.h + margin
  );
}

export function unionRects(rects: Rect[]): Rect | null {
  const first = rects[0];
  if (!first) return null;
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.w;
  let maxY = first.y + first.h;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/* ------------------------------------------------------------------ */
/* Routage des liaisons                                                */
/* ------------------------------------------------------------------ */

/** Choisit les côtés à relier : face à face sur l'axe où les blocs sont séparés. */
export function pickSides(a: Rect, b: Rect): [Side, Side] {
  const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  const ca = rectCenter(a);
  const cb = rectCenter(b);

  if (gapX > 0 && gapX >= gapY) return cb.x >= ca.x ? ["right", "left"] : ["left", "right"];
  if (gapY > 0) return cb.y >= ca.y ? ["bottom", "top"] : ["top", "bottom"];
  // Blocs qui se chevauchent : on se fie aux centres.
  if (Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y)) return cb.x >= ca.x ? ["right", "left"] : ["left", "right"];
  return cb.y >= ca.y ? ["bottom", "top"] : ["top", "bottom"];
}

export interface EdgeRoute {
  points: Point[];
  start: Point;
  end: Point;
  /** Milieu du tronçon central : emplacement de l'étiquette. */
  mid: Point;
  /** Direction d'arrivée, pour orienter la pointe. */
  endSide: Side;
}

export function routeEdge(a: Rect, b: Rect): EdgeRoute {
  const [sideA, sideB] = pickSides(a, b);
  const start = anchorPoint(a, sideA);
  const end = anchorPoint(b, sideB);
  const horizontal = sideA === "left" || sideA === "right";

  let points: Point[];
  if (horizontal) {
    if (Math.abs(start.y - end.y) < 1) points = [start, end];
    else {
      const xm = (start.x + end.x) / 2;
      points = [start, { x: xm, y: start.y }, { x: xm, y: end.y }, end];
    }
  } else if (Math.abs(start.x - end.x) < 1) {
    points = [start, end];
  } else {
    const ym = (start.y + end.y) / 2;
    points = [start, { x: start.x, y: ym }, { x: end.x, y: ym }, end];
  }

  const m1 = points.length === 4 ? points[1] : start;
  const m2 = points.length === 4 ? points[2] : end;
  return {
    points,
    start,
    end,
    mid: { x: ((m1?.x ?? 0) + (m2?.x ?? 0)) / 2, y: ((m1?.y ?? 0) + (m2?.y ?? 0)) / 2 },
    endSide: sideB,
  };
}

/** Polyligne aux coins arrondis, au format d'un attribut SVG `d`. */
export function roundedPath(points: Point[], radius = 12): string {
  const first = points[0];
  if (!first) return "";
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    if (!prev || !corner || !next) continue;
    const len1 = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const len2 = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, len1 / 2, len2 / 2);
    if (r < 0.5) {
      d += ` L ${corner.x} ${corner.y}`;
      continue;
    }
    const ax = corner.x - ((corner.x - prev.x) / len1) * r;
    const ay = corner.y - ((corner.y - prev.y) / len1) * r;
    const bx = corner.x + ((next.x - corner.x) / len2) * r;
    const by = corner.y + ((next.y - corner.y) / len2) * r;
    d += ` L ${ax} ${ay} Q ${corner.x} ${corner.y} ${bx} ${by}`;
  }
  const last = points[points.length - 1];
  if (last && points.length > 1) d += ` L ${last.x} ${last.y}`;
  return d;
}

/* ------------------------------------------------------------------ */
/* Vue                                                                  */
/* ------------------------------------------------------------------ */

export interface View {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3;

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/**
 * Vue qui montre tout le contenu, centré, avec une marge. `bottomInset` réserve de la place en bas
 * (boîte à outils posée sur le canevas).
 */
export function fitView(
  bounds: Rect | null,
  width: number,
  height: number,
  padding = 72,
  maxZoom = 1.25,
  bottomInset = 0,
): View {
  const usable = height - bottomInset;
  if (!bounds || width <= 0 || usable <= 0) return { x: 48, y: 48, zoom: 1 };
  const zoom = clampZoom(
    Math.min((width - padding * 2) / Math.max(bounds.w, 1), (usable - padding * 2) / Math.max(bounds.h, 1), maxZoom),
  );
  return {
    zoom,
    x: (width - bounds.w * zoom) / 2 - bounds.x * zoom,
    y: (usable - bounds.h * zoom) / 2 - bounds.y * zoom,
  };
}

/** Emplacement libre le plus proche d'un point, en spirale : évite de poser un bloc sur un autre. */
export function findFreeSpot(center: Point, size: { w: number; h: number }, occupied: Rect[], gap = 24): Point {
  const stepX = size.w + gap;
  const stepY = size.h + gap;
  for (let ring = 0; ring <= 8; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const candidate: Rect = {
          x: center.x - size.w / 2 + dx * stepX,
          y: center.y - size.h / 2 + dy * stepY,
          w: size.w,
          h: size.h,
        };
        const margin = gap / 2;
        const blocked = occupied.some((rect) =>
          rectsIntersect(candidate, { x: rect.x - margin, y: rect.y - margin, w: rect.w + margin * 2, h: rect.h + margin * 2 }),
        );
        if (!blocked) return { x: candidate.x, y: candidate.y };
      }
    }
  }
  return { x: center.x - size.w / 2, y: center.y - size.h / 2 };
}

export const snapToGrid = (value: number, step = GRID) => Math.round(value / step) * step;
