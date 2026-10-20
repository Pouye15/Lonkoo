"use client";

import React, { memo } from "react";
import {
  ChatCircleText,
  Cpu,
  Cube,
  DeviceMobile,
  Lightning,
  Receipt,
  ShareNetwork,
  ShieldCheck,
  Sparkle,
} from "@phosphor-icons/react";
import type { ArchitectureNode, ArchitectureShape } from "@/lib/lonkoo-data";
import { cn } from "@/lib/cn";
import { nodeSize, type Side } from "./geometry";

const ICONS: Partial<Record<ArchitectureShape, React.ElementType>> = {
  generic: Cube,
  service: Cpu,
  gateway: ShareNetwork,
  cache: Lightning,
  security: ShieldCheck,
  ai: Sparkle,
  "mobile-payment": DeviceMobile,
  messaging: ChatCircleText,
  billing: Receipt,
};

const STROKE = "var(--edge-strong)";
const FILL = "var(--surface)";

/* ------------------------------------------------------------------ */
/* Pictogrammes de la boîte à outils                                    */
/* ------------------------------------------------------------------ */

/** Version miniature d'un bloc (boîte à outils, inspecteur). */
export function ShapeGlyph({ shape, size = 26 }: { shape: ArchitectureShape; size?: number }) {
  if (shape === "cylinder") {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="flex-shrink-0">
        <ellipse cx="16" cy="7" rx="11" ry="4" fill={FILL} stroke="var(--ink-2)" strokeWidth="1.8" />
        <path d="M5 7v18c0 2.2 4.9 4 11 4s11-1.8 11-4V7" fill={FILL} stroke="var(--ink-2)" strokeWidth="1.8" />
        <path d="M5 13c0 2.2 4.9 4 11 4s11-1.8 11-4M5 19c0 2.2 4.9 4 11 4s11-1.8 11-4" stroke="var(--ink-2)" strokeWidth="1.5" />
      </svg>
    );
  }
  if (shape === "user") {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="flex-shrink-0">
        <circle cx="16" cy="9" r="5" fill={FILL} stroke="var(--ink-2)" strokeWidth="1.8" />
        <path d="M6 27c0-5.5 4.5-9.5 10-9.5S26 21.5 26 27z" fill={FILL} stroke="var(--ink-2)" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (shape === "queue") {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="flex-shrink-0">
        <path d="M7 10h18a3 6 0 0 1 3 6 3 6 0 0 1-3 6H7a3 6 0 0 1-3-6 3 6 0 0 1 3-6z" fill={FILL} stroke="var(--ink-2)" strokeWidth="1.8" />
        <ellipse cx="25" cy="16" rx="3" ry="6" stroke="var(--ink-2)" strokeWidth="1.5" />
        <path d="M13 10v12M19 10v12" stroke="var(--ink-2)" strokeWidth="1.5" strokeDasharray="2 2" />
      </svg>
    );
  }
  const Icon = ICONS[shape] ?? Cube;
  return (
    <span
      style={{ width: size, height: size }}
      className="flex flex-shrink-0 items-center justify-center rounded-lg border border-edge-strong bg-surface text-ink"
    >
      <Icon size={Math.round(size * 0.62)} weight="bold" />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Corps des blocs                                                      */
/* ------------------------------------------------------------------ */

interface BodyProps {
  node: ArchitectureNode;
  w: number;
  h: number;
  hasStack: boolean;
  editing: boolean;
  onRename: (id: string, title: string) => void;
  onStopEditing: () => void;
}

function Title({ node, editing, onRename, onStopEditing, className }: Pick<BodyProps, "node" | "editing" | "onRename" | "onStopEditing"> & { className?: string }) {
  if (!editing) return <div className={cn("truncate", className)}>{node.title}</div>;
  return (
    <input
      autoFocus
      defaultValue={node.title}
      aria-label="Nom du bloc"
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => onRename(node.id, event.currentTarget.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") onStopEditing();
      }}
      className={cn("w-full rounded border border-accent bg-surface px-1 text-ink outline-none", className)}
    />
  );
}

function StackLine({ node }: { node: ArchitectureNode }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2 border-t border-edge-soft pt-2 font-mono text-[11px]">
      <span className="truncate font-medium text-ink-2">{node.tech}</span>
      {node.version && <span className="flex-shrink-0 text-ink-3">{node.version}</span>}
    </div>
  );
}

function BoxBody(props: BodyProps) {
  const { node, hasStack } = props;
  const Icon = ICONS[node.shape] ?? Cube;
  return (
    <div className="flex h-full w-full flex-col justify-center rounded-xl border border-edge-strong bg-surface px-3 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-subtle text-ink">
          <Icon size={18} weight="bold" />
        </span>
        <div className="min-w-0 flex-1">
          <Title {...props} className="text-[13px] font-semibold leading-snug text-ink" />
          <div className="truncate text-[11px] text-ink-3">{node.moduleGroup}</div>
        </div>
      </div>
      {hasStack && <StackLine node={node} />}
    </div>
  );
}

/** Base de données : pile de cylindres. */
function CylinderBody(props: BodyProps) {
  const { node, w, h, hasStack } = props;
  const rx = w / 2 - 1.5;
  const ry = 15;
  const mid1 = h * 0.4;
  const mid2 = h * 0.68;
  return (
    <div className="relative h-full w-full">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" className="absolute inset-0 overflow-visible" aria-hidden="true">
        <path d={`M ${w / 2 - rx} ${ry} V ${h - ry} A ${rx} ${ry} 0 0 0 ${w / 2 + rx} ${h - ry} V ${ry}`} fill={FILL} stroke={STROKE} strokeWidth="1.6" />
        <path d={`M ${w / 2 - rx} ${mid1} A ${rx} ${ry} 0 0 0 ${w / 2 + rx} ${mid1}`} stroke={STROKE} strokeWidth="1.3" />
        <path d={`M ${w / 2 - rx} ${mid2} A ${rx} ${ry} 0 0 0 ${w / 2 + rx} ${mid2}`} stroke={STROKE} strokeWidth="1.3" />
        <ellipse cx={w / 2} cy={ry} rx={rx} ry={ry} fill="var(--subtle)" stroke={STROKE} strokeWidth="1.6" />
      </svg>
      <div className="absolute inset-x-5 bottom-3 top-8 flex flex-col items-center justify-center text-center">
        <Title {...props} className="w-full text-[13px] font-semibold leading-snug text-ink" />
        <div className="w-full truncate text-[11px] text-ink-3">{hasStack ? node.tech : node.moduleGroup}</div>
      </div>
    </div>
  );
}

/** Utilisateur ou client : silhouette. */
function UserBody(props: BodyProps) {
  const { node, w, h } = props;
  return (
    <div className="relative h-full w-full">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" className="absolute inset-0 overflow-visible" aria-hidden="true">
        <circle cx={w / 2} cy="26" r="15" fill={FILL} stroke={STROKE} strokeWidth="1.6" />
        <path
          d={`M ${w / 2 - 34} 82 C ${w / 2 - 34} 58 ${w / 2 - 18} 49 ${w / 2} 49 C ${w / 2 + 18} 49 ${w / 2 + 34} 58 ${w / 2 + 34} 82 Z`}
          fill={FILL}
          stroke={STROKE}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <Title {...props} className="text-[13px] font-semibold leading-snug text-ink" />
        <div className="truncate text-[11px] text-ink-3">{node.tech || node.moduleGroup}</div>
      </div>
    </div>
  );
}

/** File ou bus d'événements : tuyau horizontal segmenté. */
function QueueBody(props: BodyProps) {
  const { node, w, h, hasStack } = props;
  const cap = 14;
  const x1 = w * 0.3;
  const x2 = w * 0.7;
  return (
    <div className="relative h-full w-full">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" className="absolute inset-0 overflow-visible" aria-hidden="true">
        <path d={`M ${cap} 3 H ${w - cap} A ${cap} ${h / 2 - 3} 0 0 1 ${w - cap} ${h - 3} H ${cap} A ${cap} ${h / 2 - 3} 0 0 1 ${cap} 3 Z`} fill={FILL} stroke={STROKE} strokeWidth="1.6" />
        <ellipse cx={cap} cy={h / 2} rx={cap} ry={h / 2 - 3} fill="var(--subtle)" stroke={STROKE} strokeWidth="1.6" />
        <path d={`M ${x1} 3.5 A 8 ${h / 2 - 3.5} 0 0 1 ${x1} ${h - 3.5}`} stroke={STROKE} strokeWidth="1.3" />
        <path d={`M ${x2} 3.5 A 8 ${h / 2 - 3.5} 0 0 1 ${x2} ${h - 3.5}`} stroke={STROKE} strokeWidth="1.3" />
      </svg>
      <div className="absolute inset-y-0 left-8 right-6 flex flex-col items-center justify-center text-center">
        <Title {...props} className="w-full text-[13px] font-semibold leading-snug text-ink" />
        <div className="w-full truncate text-[11px] text-ink-3">{hasStack ? node.tech : node.moduleGroup}</div>
      </div>
    </div>
  );
}

function Body(props: BodyProps) {
  switch (props.node.shape) {
    case "cylinder":
      return <CylinderBody {...props} />;
    case "user":
      return <UserBody {...props} />;
    case "queue":
      return <QueueBody {...props} />;
    default:
      return <BoxBody {...props} />;
  }
}

/* ------------------------------------------------------------------ */
/* Bloc complet                                                         */
/* ------------------------------------------------------------------ */

const ANCHOR_POSITION: Record<Side, string> = {
  top: "-top-[7px] left-1/2 -translate-x-1/2",
  bottom: "-bottom-[7px] left-1/2 -translate-x-1/2",
  left: "-left-[7px] top-1/2 -translate-y-1/2",
  right: "-right-[7px] top-1/2 -translate-y-1/2",
};

interface NodeViewProps {
  node: ArchitectureNode;
  x: number;
  y: number;
  selected: boolean;
  /** Seul bloc sélectionné : les points d'ancrage restent visibles. */
  solo: boolean;
  /** Cible possible d'une liaison en cours de tracé. */
  dropTarget: boolean;
  /** Source armée du mode « Relier ». */
  armed: boolean;
  editing: boolean;
  onRename: (id: string, title: string) => void;
  onStopEditing: () => void;
}

export const NodeView = memo(function NodeView({
  node,
  x,
  y,
  selected,
  solo,
  dropTarget,
  armed,
  editing,
  onRename,
  onStopEditing,
}: NodeViewProps) {
  const { w, h } = nodeSize(node);
  const hasStack = node.tech.trim().length > 0;

  return (
    <div
      data-node-id={node.id}
      className={cn("group absolute left-0 top-0 touch-none select-none", selected ? "z-20" : "z-10")}
      style={{ width: w, height: h, transform: `translate(${x}px, ${y}px)` }}
    >
      <Body node={node} w={w} h={h} hasStack={hasStack} editing={editing} onRename={onRename} onStopEditing={onStopEditing} />

      {(selected || dropTarget || armed) && (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -inset-1.5 rounded-2xl border-2",
            dropTarget || armed ? "border-dashed border-accent" : "border-accent",
          )}
        />
      )}

      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <button
          key={side}
          type="button"
          tabIndex={-1}
          data-anchor={side}
          aria-label={`Relier depuis le côté ${side === "top" ? "haut" : side === "bottom" ? "bas" : side === "left" ? "gauche" : "droit"}`}
          className={cn(
            "absolute z-10 h-3.5 w-3.5 cursor-crosshair rounded-full border-2 border-accent bg-surface transition-opacity hover:scale-125",
            ANCHOR_POSITION[side],
            solo ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        />
      ))}
    </div>
  );
});
