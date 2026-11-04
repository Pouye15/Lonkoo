import React from "react";
import { ArrowDown } from "@phosphor-icons/react/ssr";
import { LandingNav } from "@/components/landing/LandingNav";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { StudioDemo } from "@/components/landing/StudioDemo";
import { Features } from "@/components/landing/Features";
import { Faq } from "@/components/landing/Faq";
import { FinalCta, Footer } from "@/components/landing/FinalCtaAndFooter";
import { Button } from "@/components/ui/Button";

export default function LandingPage() {
  return (
    <>
      <ScrollReveal />
      <LandingNav />

      <main id="contenu">
        {/* Accroche */}
        <section className="relative overflow-hidden px-5 pb-10 pt-16 sm:pt-24">
          <div aria-hidden="true" className="dot-grid pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
          <div className="relative mx-auto max-w-4xl text-center">
            <h1
              className="intro text-[clamp(2.5rem,6.4vw,4.75rem)] font-semibold leading-[1.04] tracking-tight text-ink"
              style={{ "--i": 0 } as React.CSSProperties}
            >
              Concevez l&apos;architecture de votre application, ensemble, <span className="text-accent">en temps réel</span>
            </h1>

            <p
              className="intro mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-2"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              Lonkoo est le studio où votre équipe dessine le système, fait auditer ses choix par une IA qui propose sans
              jamais décider, puis génère le projet, le pousse sur GitHub et le déploie.
            </p>

            <div
              className="intro mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ "--i": 2 } as React.CSSProperties}
            >
              <Button href="/login" size="lg">
                Commencer
              </Button>
              <Button href="#parcours" variant="secondary" size="lg">
                Voir le parcours
                <ArrowDown size={16} weight="bold" />
              </Button>
            </div>

            <p className="intro mt-5 text-sm text-ink-3" style={{ "--i": 3 } as React.CSSProperties}>
              Connexion avec GitHub, ou espace de démonstration sans inscription.
            </p>
          </div>
        </section>

        <StudioDemo />
        <Features />
        <Faq />
        <FinalCta />
      </main>

      <Footer />
    </>
  );
}
