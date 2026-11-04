import { Suspense } from "react";
import { AppShell, ShellLoader } from "@/components/layout/AppShell";

/**
 * Espace de travail connecté : le shell (barre latérale, en-tête) est monté une seule fois
 * et reste en place d'une page à l'autre. Il redirige vers /login si l'utilisateur n'a pas de session.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellLoader />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
