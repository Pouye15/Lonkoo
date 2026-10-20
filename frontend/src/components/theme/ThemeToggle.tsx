"use client";

import React from "react";
import { Desktop, Moon, Sun } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useTheme, type ThemePreference } from "./ThemeProvider";

const OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  icon: React.ElementType;
}> = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "system", label: "Système", icon: Desktop },
];

/** Sélecteur de thème en trois choix. `compact` n'affiche que les icônes. */
export function ThemeSegmented({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Thème de l'interface"
      className={cn("grid grid-cols-3 gap-0.5 rounded-lg bg-subtle p-0.5", className)}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setPreference(value)}
            className={cn(
              "flex h-7 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors",
              active ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink",
            )}
          >
            <Icon size={14} weight={active ? "fill" : "regular"} />
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Bouton unique qui alterne clair et sombre (barres de navigation). */
export function ThemeIconButton({ className }: { className?: string }) {
  const { resolved, setPreference } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      aria-label={next === "dark" ? "Passer au thème sombre" : "Passer au thème clair"}
      title={next === "dark" ? "Thème sombre" : "Thème clair"}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-subtle hover:text-ink",
        className,
      )}
    >
      {resolved === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
