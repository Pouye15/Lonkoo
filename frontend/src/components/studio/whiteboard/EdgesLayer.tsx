"use client";

import React, { memo } from "react";
import type { ArchitectureEdge } from "@/lib/lonkoo-data";
import { roundedPath, routeEdge, type Point, type Rect } from "./geometry";

export interface Guide {
  orientation: "v" | "h";
  /** Position de la ligne sur l'axe perpendiculaire. */
  at: number;
  from: number;
  to: number;
}

export interface ConnectPreview {
  from: Point;
  to: Point;
}

interface EdgesLayerProps {
  edges: ArchitectureEdge[];
  rects: Map<string, Rect>;
  selectedEdgeId: string | null;
  guides: Guide[];
  preview: ConnectPreview | null;
}

const shortProtocol = (protocol: string) => protocol.split("/")[0]?.trim() ?? protocol;

/**
 * Couche SVG du canevas : liaisons (routage orthogonal), guides d'alignement et tracé en cours.
 * Elle n'a pas de taille propre : tout est dessiné en coordonnées du canevas.
 */
export const EdgesLayer = memo(function EdgesLayer({ edges, rects, selectedEdgeId, guides, preview }: EdgesLayerProps) {
  return (
    <svg
      width="1"
      height="1"
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      role="group"
      aria-label="Liaisons entre les blocs"
    >
      <defs>
        <marker id="wb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--ink-3)" />
        </marker>
        <marker id="wb-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--accent)" />
        </marker>
      </defs>

      {edges.map((edge) => {
        const a = rects.get(edge.from);
        const b = rects.get(edge.to);
        if (!a || !b) return null;
        const route = routeEdge(a, b);
        const d = roundedPath(route.points, 12);
        const active = edge.id === selectedEdgeId;
        const label = shortProtocol(edge.protocol);
        const labelWidth = label.length * 6.6 + 16;

        return (
          <g key={edge.id} data-edge-id={edge.id} className="group/edge">
            <path d={d} fill="none" stroke="transparent" strokeWidth="16" style={{ pointerEvents: "stroke", cursor: "pointer" }} />
            <path
              d={d}
              fill="none"
              stroke={active ? "var(--accent)" : "var(--ink-3)"}
              strokeWidth={active ? 2.4 : 1.8}
              markerEnd={active ? "url(#wb-arrow-active)" : "url(#wb-arrow)"}
              className="transition-[stroke] group-hover/edge:stroke-[var(--accent)]"
            />
            <g transform={`translate(${route.mid.x} ${route.mid.y})`} style={{ pointerEvents: "all", cursor: "pointer" }}>
              <rect
                x={-labelWidth / 2}
                y={-10}
                width={labelWidth}
                height={20}
                rx={6}
                fill="var(--surface)"
                stroke={active ? "var(--accent)" : "var(--edge-strong)"}
                strokeWidth="1"
              />
              <text
                textAnchor="middle"
                y={4}
                fontSize="11"
                fontWeight="600"
                fill={active ? "var(--accent)" : "var(--ink-2)"}
                fontFamily="var(--font-geist-mono), ui-monospace, monospace"
              >
                {label}
              </text>
            </g>
          </g>
        );
      })}

      {guides.map((guide, index) =>
        guide.orientation === "v" ? (
          <line key={index} x1={guide.at} x2={guide.at} y1={guide.from} y2={guide.to} stroke="var(--accent)" strokeWidth="1" strokeDasharray="4 4" />
        ) : (
          <line key={index} y1={guide.at} y2={guide.at} x1={guide.from} x2={guide.to} stroke="var(--accent)" strokeWidth="1" strokeDasharray="4 4" />
        ),
      )}

      {preview && (
        <path
          d={`M ${preview.from.x} ${preview.from.y} L ${preview.to.x} ${preview.to.y}`}
          stroke="var(--accent)"
          strokeWidth="2"
          strokeDasharray="6 5"
          fill="none"
          markerEnd="url(#wb-arrow-active)"
        />
      )}
    </svg>
  );
});
