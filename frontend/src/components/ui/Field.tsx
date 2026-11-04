import React from "react";
import { cn } from "@/lib/cn";

/** Styles communs des champs de formulaire (opaques, thème clair et sombre). */
export const inputClass =
  "h-10 w-full rounded-lg border border-edge bg-sunken px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-accent focus:bg-surface focus:ring-1 focus:ring-accent disabled:opacity-60";

export const textareaClass =
  "w-full rounded-lg border border-edge bg-sunken px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-accent focus:bg-surface focus:ring-1 focus:ring-accent";

export const selectClass =
  "h-10 w-full rounded-lg border border-edge bg-sunken px-2.5 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent";

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

/** Libellé + champ + aide optionnelle. */
export function Field({ label, htmlFor, hint, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}
