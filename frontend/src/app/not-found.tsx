import React from "react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main id="contenu" className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 text-center">
      <Logo markOnly size={44} />
      <p className="mt-6 font-mono text-sm text-ink-3">Erreur 404</p>
      <h1 className="mt-2 max-w-xl text-3xl font-semibold tracking-tight text-ink">
        Cette page n&apos;existe pas ou a été déplacée
      </h1>
      <p className="mt-3 max-w-md text-[15px] text-ink-2">
        Vérifiez l&apos;adresse, ou revenez à l&apos;accueil pour retrouver vos projets.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button href="/">Retour à l&apos;accueil</Button>
        <Button href="/dashboard" variant="secondary">
          Mes projets
        </Button>
      </div>
    </main>
  );
}
