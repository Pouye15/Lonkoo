import type { ReactNode } from "react";

/**
 * Signale une partie de l'interface qui montre des exemples fictifs. Règle du front (CLAUDE.md, § 5, point 4) :
 * aucune donnée inventée présentée comme réelle. Le test `lib/demo-notice.test.ts` vérifie que chaque écran fictif
 * l'affiche.
 */
export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="rounded-xl border border-edge bg-sunken px-4 py-3 text-xs leading-relaxed text-ink-2">
      <span className="font-semibold text-ink">Démonstration : </span>
      {children}
    </p>
  );
}
