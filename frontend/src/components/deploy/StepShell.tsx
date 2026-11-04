import React from "react";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

export type StepState = "idle" | "running" | "done" | "failed";

interface StepShellProps {
  index: number;
  title: string;
  state: StepState;
  locked: boolean;
  children: React.ReactNode;
}

/** Une étape numérotée du parcours Générer → GitHub → Déployer ; grisée tant que l'étape précédente n'est pas faite. */
export function StepShell({ index, title, state, locked, children }: StepShellProps) {
  return (
    <section
      aria-labelledby={`step-${index}`}
      className={cn("rounded-xl border bg-surface p-5 transition-colors", locked ? "border-edge-soft opacity-60" : "border-edge")}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            state === "done" ? "bg-ok-fill text-white" : "border border-edge-strong text-ink-2",
          )}
        >
          {state === "done" ? (
            <CheckCircle size={16} weight="fill" />
          ) : state === "failed" ? (
            <WarningCircle size={16} weight="fill" className="text-warn" />
          ) : (
            index
          )}
        </span>
        <h2 id={`step-${index}`} className="text-base font-semibold text-ink">
          {title}
        </h2>
      </div>
      <div className="mt-4 pl-10">{children}</div>
    </section>
  );
}
