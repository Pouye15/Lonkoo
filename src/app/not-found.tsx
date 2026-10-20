import React from "react";
import Link from "next/link";
import { LonkooLogoMark, IconArrowUpRight } from "@/components/icons/LonkooIcons";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0A2E4A] px-6 text-center text-[#E7F2F7] tissage-grid-dark">
      <LonkooLogoMark className="h-12 w-12" />
      <div className="mt-4 rounded-full border border-[#19748A]/60 bg-[#061D30] px-3.5 py-1 font-mono text-xs text-[#FB8500]">
        ERREUR 404 · NŒUD INTROUVABLE SUR LA GRILLE TISSAGE
      </div>
      <h1 className="mt-4 max-w-[680px] text-4xl font-bold tracking-tight">
        Cette route d&apos;architecture n&apos;existe pas ou a été déplacée
      </h1>
      <p className="mt-3 max-w-md text-sm text-[#E7F2F7]/75">
        Vérifiez l&apos;identifiant de votre blueprint ou retournez sur le portail principal LONKOO.
      </p>
      <div className="mt-8 flex items-center gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-[#FB8500] px-5 py-2.5 text-sm font-semibold text-[#0A2E4A]"
        >
          <span>Retour à l&apos;accueil LONKOO</span>
          <IconArrowUpRight className="w-4 h-4" />
        </Link>
        <Link
          href="/studio"
          className="inline-flex items-center gap-2 rounded-full border border-[#19748A] bg-[#061D30] px-5 py-2.5 text-sm font-semibold text-[#B8FAFF]"
        >
          <span>Ouvrir le Studio</span>
        </Link>
      </div>
    </main>
  );
}
