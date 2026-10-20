"use client";

import React, { useState } from "react";
import { CaretDown, CaretUp, Prohibit } from "@phosphor-icons/react";
import type { ArchitectureNode } from "@/lib/lonkoo-data";
import { cn } from "@/lib/cn";
import { STACK_PRESETS_BY_SHAPE, STENCIL_ITEMS, type StencilItem, type TechStackPreset } from "./stencils";
import { ShapeGlyph } from "./NodeView";

export const STENCIL_DRAG_TYPE = "application/x-lonkoo-stencil";

interface DockProps {
  selectedNode: ArchitectureNode | null;
  onAdd: (item: StencilItem) => void;
  onUpdateNode: (id: string, patch: Partial<ArchitectureNode>, mergeKey?: string) => void;
  onClearStack: () => void;
  onApplyPreset: (preset: TechStackPreset) => void;
}

const smallInput =
  "h-8 w-full rounded-md border border-edge bg-surface px-2 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent";

/** Boîte à outils posée en bas du canevas : composants (cliquer ou glisser) et stack technique du bloc sélectionné. */
export function Dock({ selectedNode, onAdd, onUpdateNode, onClearStack, onApplyPreset }: DockProps) {
  const [tab, setTab] = useState<"components" | "techstack">("components");
  const [minimized, setMinimized] = useState(false);

  const open = (next: "components" | "techstack") => {
    setTab(next);
    setMinimized(false);
  };

  return (
    <div
      className="absolute bottom-3 left-1/2 z-30 w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 rounded-xl border border-edge bg-surface shadow-pop"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 p-1.5">
        <div role="tablist" aria-label="Boîte à outils" className="flex items-center gap-1 rounded-lg bg-subtle p-0.5">
          {(
            [
              { id: "components", label: "Composants" },
              { id: "techstack", label: "Stack technique" },
            ] as const
          ).map((item) => {
            const active = tab === item.id && !minimized;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => open(item.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  active ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink",
                )}
              >
                {item.label}
                {item.id === "techstack" && selectedNode && (
                  <span className="hidden max-w-[9rem] truncate font-mono text-xs font-normal text-ink-3 sm:inline">
                    {selectedNode.title}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setMinimized((value) => !value)}
          aria-label={minimized ? "Déplier la boîte à outils" : "Réduire la boîte à outils"}
          title={minimized ? "Déplier" : "Réduire"}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-subtle hover:text-ink"
        >
          {minimized ? <CaretUp size={14} /> : <CaretDown size={14} />}
        </button>
      </div>

      {!minimized && (
        <div className="border-t border-edge-soft p-2">
          {tab === "components" && (
            <ul className="flex gap-2 overflow-x-auto pb-1">
              {STENCIL_ITEMS.map((item) => (
                <li key={item.label} className="flex-shrink-0">
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(STENCIL_DRAG_TYPE, item.label);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onAdd(item)}
                    title="Cliquer pour ajouter, ou glisser sur le canevas"
                    className="flex w-[5.75rem] cursor-grab flex-col items-center gap-1 rounded-lg border border-edge bg-surface px-1.5 py-2 text-center transition-colors hover:border-accent hover:bg-sunken active:cursor-grabbing"
                  >
                    <ShapeGlyph shape={item.shape} size={26} />
                    <span className="line-clamp-2 min-h-[1.9rem] text-xs font-medium leading-[0.95rem] text-ink">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {tab === "techstack" &&
            (!selectedNode ? (
              <p className="px-2 py-4 text-center text-sm text-ink-3">
                Sélectionnez un bloc pour modifier ses propriétés ou lui associer une stack.
              </p>
            ) : (
              <div className="grid max-h-52 grid-cols-1 gap-3 overflow-y-auto md:grid-cols-12">
                <div className="space-y-2 rounded-lg bg-sunken p-2.5 md:col-span-4">
                  <label className="block">
                    <span className="mb-0.5 block text-xs text-ink-3">Nom du bloc</span>
                    <input
                      type="text"
                      value={selectedNode.title}
                      onChange={(event) => onUpdateNode(selectedNode.id, { title: event.target.value }, `title:${selectedNode.id}`)}
                      className={smallInput}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-0.5 block text-xs text-ink-3">Stack libre</span>
                      <input
                        type="text"
                        placeholder="Aucune"
                        value={selectedNode.tech}
                        onChange={(event) => onUpdateNode(selectedNode.id, { tech: event.target.value }, `tech:${selectedNode.id}`)}
                        className={cn(smallInput, "font-mono")}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-0.5 block text-xs text-ink-3">Port</span>
                      <input
                        type="number"
                        min={0}
                        max={65535}
                        placeholder="Port"
                        value={selectedNode.port || ""}
                        onChange={(event) =>
                          onUpdateNode(selectedNode.id, { port: Math.max(0, Number(event.target.value) || 0) }, `port:${selectedNode.id}`)
                        }
                        className={cn(smallInput, "font-mono")}
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:col-span-8">
                  <button
                    type="button"
                    onClick={onClearStack}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-2 text-left text-sm transition-colors",
                      !selectedNode.tech
                        ? "border-ink bg-inverse text-inverse-ink"
                        : "border-edge bg-surface text-ink-2 hover:border-edge-strong hover:bg-sunken",
                    )}
                  >
                    <Prohibit size={15} className="flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">Aucune stack</span>
                      <span className="block truncate text-xs opacity-80">Bloc neutre</span>
                    </span>
                  </button>

                  {(STACK_PRESETS_BY_SHAPE[selectedNode.shape] ?? []).map((preset) => {
                    const current = selectedNode.tech === preset.name;
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => onApplyPreset(preset)}
                        className={cn(
                          "rounded-lg border p-2 text-left text-sm transition-colors",
                          current
                            ? "border-brand bg-brand text-white"
                            : "border-edge bg-surface text-ink hover:border-edge-strong hover:bg-sunken",
                        )}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span className="truncate font-semibold">{preset.name}</span>
                          <span className={cn("flex-shrink-0 font-mono text-[11px]", current ? "text-white" : "text-ink-3")}>
                            {preset.version}
                          </span>
                        </span>
                        <span className={cn("block truncate text-xs", current ? "text-white" : "text-ink-3")}>
                          Port {preset.port}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
