"use client";

import React, { useCallback } from "react";
import Link from "next/link";
import { PALABRE_BLUEPRINTS } from "@/lib/lonkoo-data";
import {
  SlidersHorizontal,
  Cpu,
  ChartLineUp,
  PlugsConnected,
  GitFork,
  ArrowRight,
  GitPullRequest,
  Star,
  Tag,
} from "@phosphor-icons/react";

const BENTO_FEATURES = [
  {
    id: "studio",
    title: "Studio Collaboratif & Versioning de Stack",
    description:
      "Concevez vos architectures en temps réel, versionnez chaque choix technologique, comparez les évolutions par diff visuel et liez chaque version à une release ou un tag Git.",
    href: "/studio",
    icon: SlidersHorizontal,
    accent: "brand",
    tag: "Collaboration & Git",
  },
  {
    id: "scanner",
    title: "Scanner IA, Revue de Stack & Auto-Doc",
    description:
      "L'assistant IA inspecte votre modélisation, suggère des optimisations applicables en un clic et génère automatiquement la documentation technique (ADR, flux, contrats).",
    href: "/studio?tab=scanner",
    icon: Cpu,
    accent: "brand",
    tag: "Assistant IA",
  },
  {
    id: "simulator",
    title: "Simulateur de Charge & Résilience",
    description:
      "Testez le comportement de votre topologie sous des pics de trafic réalistes, identifiez les goulots d'étranglement et ajustez le nombre de répliques avant l'implémentation.",
    href: "/studio?tab=simulator",
    icon: ChartLineUp,
    accent: "amber",
    tag: "Simulation",
  },
  {
    id: "deploy",
    title: "Implémentation via Serveur MCP & Orion",
    description:
      "Exposez votre architecture via un serveur MCP pour que vos agents IA l'implémentent dans les modèles choisis, ou transférez le blueprint directement vers le site builder Orion.",
    href: "/deploy",
    icon: PlugsConnected,
    accent: "brand",
    tag: "MCP & Orion",
  },
] as const;

export function SpotlightBentoGrid() {
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
  }, []);

  return (
    <>
      {/* 1. Grille Bento 2x2 — Passage en page blanche à partir de "Un cycle d'ingénierie complet" */}
      <section className="bg-white/[0.94] backdrop-blur-xl text-slate-900 py-28 px-6 relative border-t border-slate-200/80">
        <div className="max-w-5xl mx-auto">
          <div className="reveal text-center max-w-2xl mx-auto mb-16">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-[#1265DD] text-[11px] font-mono mb-3 border border-sky-200 font-semibold">
              Plateforme Collaborative &amp; IA
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-950">
              Un cycle d&apos;ingénierie complet, de la modélisation à l&apos;implémentation
            </h2>
            <p className="text-sm text-slate-600 mt-3 leading-relaxed">
              Travaillez sur vos projets publics ou privés, sollicitez l&apos;assistant IA, validez en
              équipe par Pull Request et connectez vos dépôts GitHub.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {BENTO_FEATURES.map((item, idx) => {
              const Icon = item.icon;
              const isAmber = item.accent === "amber";
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onMouseMove={handleMouseMove}
                  style={{ "--d": `${idx * 90}ms` } as React.CSSProperties}
                  className="reveal bg-white/90 rounded-2xl p-7 flex flex-col justify-between group border border-slate-200/90 hover:border-sky-300 hover:bg-white hover:-translate-y-1 hover:shadow-xl hover:shadow-[#1265DD]/10 transition-all duration-500 relative overflow-hidden"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      background: isAmber
                        ? "radial-gradient(420px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(251, 133, 0, 0.09), transparent 70%)"
                        : "radial-gradient(420px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(18, 101, 221, 0.09), transparent 70%)",
                    }}
                  />

                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-5">
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-500 group-hover:scale-105 ${
                          isAmber
                            ? "bg-amber/10 text-amber border border-amber/25"
                            : "bg-sky-50 text-[#1265DD] border border-sky-200"
                        }`}
                      >
                        <Icon size={22} weight="bold" />
                      </div>
                      <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-medium">
                        {item.tag}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-950 mb-2 group-hover:text-[#1265DD] transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  <div className="relative z-10 mt-8 pt-4 border-t border-slate-200/80 flex items-center justify-between text-xs font-semibold text-[#1265DD] group-hover:text-brand-hover transition-colors">
                    <span>Ouvrir l&apos;outil</span>
                    <ArrowRight
                      size={14}
                      className="group-hover:translate-x-1 transition-transform duration-300"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* 2. Templates communautaires, Fork granulaire & Revues PR */}
      <section className="bg-slate-50/[0.92] backdrop-blur-xl text-slate-900 py-24 px-6 border-t border-slate-200/80 relative">
        <div className="max-w-5xl mx-auto">
          <div className="reveal text-center max-w-2xl mx-auto mb-14">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-[#1265DD] text-[11px] font-mono mb-3 border border-sky-200 font-semibold">
              Communauté &amp; Partage
            </span>
            <h2 className="text-3xl font-bold tracking-tight text-slate-950">
              Templates d&apos;architecture notés, commentés et forkables à la carte
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Publiez vos travaux, notez les architectures de la communauté et forkez un système
              complet ou uniquement le sous-graphe dont vous avez besoin.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Colonne gauche : 3 Templates Communautaires */}
            <div className="lg:col-span-2 space-y-4">
              {PALABRE_BLUEPRINTS.slice(0, 3).map((bp, idx) => (
                <Link
                  key={bp.id}
                  href={`/palabre/${bp.slug}`}
                  style={{ "--d": `${idx * 90}ms` } as React.CSSProperties}
                  className="reveal bg-white/95 rounded-xl p-5 block border border-slate-200/90 shadow-xs hover:border-sky-300 hover:bg-white hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 group"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-slate-900 group-hover:text-[#1265DD] transition-colors">
                        {bp.title}
                      </h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                        {bp.sector}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-slate-600">
                      <span className="flex items-center gap-1 text-amber-600 font-semibold">
                        <Star size={13} weight="fill" className="text-amber-500" />
                        {bp.stars} ({bp.ratingsCount})
                      </span>
                      <span className="flex items-center gap-1">
                        <GitFork size={13} className="text-[#1265DD]" />
                        {bp.forks} forks
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mb-3.5 leading-relaxed">
                    {bp.summary}
                  </p>
                  <div className="flex flex-wrap items-center justify-between text-xs pt-3 border-t border-slate-100 gap-2 font-mono">
                    <span className="text-[#1265DD] font-semibold">
                      {bp.stack.join(" · ")}
                    </span>
                    <span className="flex items-center gap-1 text-slate-600">
                      <Tag size={12} className="text-sky-500" />
                      {bp.gitTag} · {bp.modules.length} sous-graphes forkables
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            {/* Colonne droite : Revue d'architecture type Pull Request */}
            <div
              style={{ "--d": "220ms" } as React.CSSProperties}
              className="reveal bg-white/95 rounded-xl p-6 border border-slate-200/90 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <div className="flex items-center gap-2">
                    <GitPullRequest size={18} className="text-[#1265DD]" weight="bold" />
                    <span className="font-semibold text-sm text-slate-900">
                      Revue d&apos;Architecture
                    </span>
                  </div>
                  <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200 font-semibold">
                    2 Approbations
                  </span>
                </div>

                <div className="text-xs font-mono text-[#1265DD] font-semibold mb-2">
                  PR #42 · feat/ha-redpanda-saga → main
                </div>
                <div className="text-[11px] font-mono text-sky-700 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200 inline-block mb-3">
                  Liée à la Release GitHub v2.4.0
                </div>

                <blockquote className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200/80 mb-4">
                  &ldquo;Le découplage Redpanda et le passage à PostgreSQL 16.4 + PgBouncer ont été
                  validés par le simulateur à 12 000 req/s. Documentation ADR-004 générée.&rdquo;
                </blockquote>
                <div className="text-[11px] text-slate-500 flex items-center justify-between">
                  <span className="text-slate-800 font-medium">Koffi D. &amp; Cheikh T.</span>
                  <span className="font-mono text-slate-500">Reviewers</span>
                </div>
              </div>

              <Link
                href="/reviews"
                className="mt-6 w-full py-2.5 rounded-lg text-xs font-semibold bg-[#1265DD] hover:bg-brand-hover text-white transition-colors text-center flex items-center justify-center gap-1.5 shadow-xs"
              >
                <span>Ouvrir les revues &amp; discussions</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
