"use client";

import React, { useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CaretUpDown, Check, Globe, LockKey, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/lib/workspace";
import { useDismiss } from "@/components/ui/use-dismiss";

/** Pages dont le contenu dépend du projet actif : le changement de projet recharge la page. */
const PROJECT_SCOPED_ROUTES = ["/studio", "/deploy"];

export function ProjectSwitcher({ collapsed }: { collapsed: boolean }) {
  const { projects, activeProject, setActiveProjectSlug } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);
  useDismiss(open, close, containerRef);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? projects.filter((p) => p.name.toLowerCase().includes(needle)) : projects;
  }, [projects, query]);

  const choose = (slug: string) => {
    setActiveProjectSlug(slug);
    close();
    if (PROJECT_SCOPED_ROUTES.some((route) => pathname.startsWith(route))) {
      router.push(`${pathname}?project=${slug}`);
    }
  };

  if (!activeProject) return null;

  const VisibilityIcon = activeProject.visibility === "public" ? Globe : LockKey;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={collapsed ? activeProject.name : undefined}
        className={cn(
          "flex w-full items-center rounded-lg border border-edge bg-surface text-left transition-colors hover:border-edge-strong",
          collapsed ? "h-10 justify-center" : "gap-2.5 px-2.5 py-2",
        )}
      >
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-subtle font-mono text-xs font-semibold uppercase text-ink">
          {activeProject.name.charAt(0)}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{activeProject.name}</span>
              <span className="flex items-center gap-1 text-xs text-ink-3">
                <VisibilityIcon size={11} />
                {activeProject.visibility === "public" ? "Public" : "Privé"}
              </span>
            </span>
            <CaretUpDown size={14} className="flex-shrink-0 text-ink-3" />
          </>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 w-72 overflow-hidden rounded-xl border border-edge bg-surface shadow-pop",
            collapsed ? "left-full top-0 ml-2" : "left-0 top-full mt-1.5",
          )}
        >
          <div className="relative border-b border-edge-soft p-2">
            <MagnifyingGlass size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-4" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un projet"
              aria-label="Rechercher un projet"
              className="h-8 w-full rounded-md bg-sunken pl-8 pr-2 text-sm text-ink outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <ul role="listbox" aria-label="Projets" className="max-h-64 overflow-y-auto p-1">
            {visible.length === 0 && <li className="px-3 py-4 text-center text-xs text-ink-3">Aucun projet</li>}
            {visible.map((project) => {
              const selected = project.slug === activeProject.slug;
              const Icon = project.visibility === "public" ? Globe : LockKey;
              return (
                <li key={project.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => choose(project.slug)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-subtle",
                      selected && "bg-subtle",
                    )}
                  >
                    <Icon size={14} className="flex-shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{project.name}</span>
                    {selected && <Check size={14} weight="bold" className="flex-shrink-0 text-accent" />}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-edge-soft p-1">
            <button
              type="button"
              onClick={() => {
                close();
                router.push("/dashboard?new=1");
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium text-accent transition-colors hover:bg-subtle"
            >
              <Plus size={14} weight="bold" />
              Nouveau projet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
