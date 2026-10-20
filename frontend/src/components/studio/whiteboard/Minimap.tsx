"use client";

import React, { useRef } from "react";
import { unionRects, type Point, type Rect, type View } from "./geometry";

const WIDTH = 176;
const HEIGHT = 112;
const PADDING = 10;

interface MinimapProps {
  /** Rectangles des blocs dans le repère du canevas. */
  rects: Rect[];
  view: View;
  /** Taille de la zone visible, en pixels. */
  size: { w: number; h: number };
  /** Centre la vue sur un point du canevas. */
  onNavigate: (center: Point) => void;
}

/** Vue d'ensemble : les blocs et le cadre de la zone visible ; un clic ou un glissement déplace la vue. */
export function Minimap({ rects, view, size, onNavigate }: MinimapProps) {
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  if (size.w === 0 || size.h === 0) return null;

  const visible: Rect = { x: -view.x / view.zoom, y: -view.y / view.zoom, w: size.w / view.zoom, h: size.h / view.zoom };
  const bounds = unionRects([...rects, visible]);
  if (!bounds) return null;

  const scale = Math.min((WIDTH - PADDING * 2) / bounds.w, (HEIGHT - PADDING * 2) / bounds.h);
  const ox = (WIDTH - bounds.w * scale) / 2 - bounds.x * scale;
  const oy = (HEIGHT - bounds.h * scale) / 2 - bounds.y * scale;

  const navigate = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    onNavigate({ x: (event.clientX - box.left - ox) / scale, y: (event.clientY - box.top - oy) / scale });
  };

  return (
    <svg
      ref={ref}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label="Vue d'ensemble du canevas"
      className="cursor-pointer touch-none rounded-lg border border-edge bg-surface shadow-card"
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        navigate(event);
      }}
      onPointerMove={(event) => {
        if (dragging.current) navigate(event);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      {rects.map((rect, index) => (
        <rect
          key={index}
          x={rect.x * scale + ox}
          y={rect.y * scale + oy}
          width={Math.max(rect.w * scale, 2)}
          height={Math.max(rect.h * scale, 2)}
          rx={1.5}
          fill="var(--ink-4)"
        />
      ))}
      <rect
        x={visible.x * scale + ox}
        y={visible.y * scale + oy}
        width={visible.w * scale}
        height={visible.h * scale}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        rx={2}
      />
    </svg>
  );
}
