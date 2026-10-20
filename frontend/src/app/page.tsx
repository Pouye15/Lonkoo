import React from "react";
import { FluidIslandNavbar } from "@/components/landing/FluidIslandNavbar";
import { CinematicBackdrop } from "@/components/landing/CinematicBackdrop";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { FrameSequenceHero } from "@/components/landing/FrameSequenceHero";
import { TaglineWordReveal } from "@/components/landing/TaglineWordReveal";
import { SpotlightBentoGrid } from "@/components/landing/SpotlightBentoGrid";
import { FaqAndFooter } from "@/components/landing/FaqAndFooter";

export default function LonkooLandingPage() {
  return (
    <>
      {/* Vidéo d'arrière-plan fixe, avance avec le scroll de toute la page */}
      <CinematicBackdrop />
      <ScrollReveal />

      <main
        id="contenu"
        className="relative z-10 min-h-screen text-mist selection:bg-amber selection:text-abyss"
      >
        {/* 1. Navbar flottante */}
        <FluidIslandNavbar />

        {/* 2. Hero + fenêtre Studio animée image par image */}
        <FrameSequenceHero />

        {/* 3. Métriques & tagline mot par mot */}
        <TaglineWordReveal />

        {/* 4. Fondu progressif de la nuit vers la partie claire */}
        <div aria-hidden="true" className="h-48 bg-gradient-to-b from-transparent to-white/[0.94]" />

        {/* 5. Grille Bento & Blueprints (fond clair, vidéo en filigrane) */}
        <SpotlightBentoGrid />

        {/* 6. FAQ, CTA & Footer */}
        <FaqAndFooter />
      </main>
    </>
  );
}
