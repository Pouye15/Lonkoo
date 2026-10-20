"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CaretDown,
  Hexagon,
  ArrowRight,
} from "@phosphor-icons/react";

const FAQS = [
  {
    q: "Comment fonctionne le fork partiel ou complet d'une architecture ?",
    a: "Dans l'espace communautaire, chaque architecture est découpée en sous-graphes cohérents (ex: Passerelle & Auth OIDC, Bus d'événements, Persistance HA). Vous pouvez cloner l'architecture entière ou sélectionner uniquement les briques souhaitées pour les greffer dans votre projet.",
  },
  {
    q: "Comment une modélisation est-elle implémentée via MCP ou Orion ?",
    a: "LONKOO génère un serveur MCP (Model Context Protocol) dédié à votre projet pour que vos agents IA (Claude Code, Cursor, Antigravity) lisent la topologie, la stack et les contrats d'API afin d'écrire le code correspondant. Vous pouvez également envoyer le modèle vers le site builder Orion de Systalink.",
  },
  {
    q: "Comment fonctionne la liaison avec GitHub et les Releases / Tags Git ?",
    a: "Chaque espace de travail peut être lié à un dépôt GitHub. Lorsque vous validez une nouvelle version de l'architecture (ex: v2.4.0), LONKOO l'associe directement au tag ou à la release Git correspondante avec son changelog architectural et ses ADR.",
  },
  {
    q: "Que fait l'assistant IA sur la modélisation et la documentation ?",
    a: "Le scanner IA analyse votre graphe et votre stack technique pour détecter les goulots d'étranglement ou les incompatibilités, propose des correctifs applicables en un clic et rédige automatiquement la documentation technique (vue d'ensemble, ADR, contrats).",
  },
  {
    q: "Puis-je gérer des projets privés et faire des revues en équipe ?",
    a: "Oui. Comme sur Git, vos projets peuvent être Privés ou Publics. Les membres de votre équipe proposent des évolutions sur des branches d'architecture, discutent dans le canal intégré et approuvent les changements sur le modèle des Pull Requests.",
  },
] as const;

export function FaqAndFooter() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <>
      {/* FAQ Section */}
      <section className="bg-white/[0.94] backdrop-blur-xl text-slate-900 py-24 px-6 border-t border-slate-200/80">
        <div className="max-w-4xl mx-auto">
          <div className="reveal text-center max-w-xl mx-auto mb-14">
            <span className="text-[11px] font-mono text-[#1265DD] uppercase tracking-wider font-semibold">
              Questions fréquentes
            </span>
            <h2 className="text-3xl font-bold tracking-tight text-slate-950 mt-1">
              Tout savoir sur la collaboration et l&apos;implémentation dans LONKOO
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Versioning Git, fork granulaire, assistant IA, serveur MCP et intégration Orion.
            </p>
          </div>

          <div className="space-y-3">
            {FAQS.map((item, idx) => {
              const isOpen = openIdx === idx;
              return (
                <div
                  key={idx}
                  style={{ "--d": `${idx * 65}ms` } as React.CSSProperties}
                  className="reveal bg-white/90 border border-slate-200/90 rounded-xl overflow-hidden hover:border-sky-300 transition-colors shadow-xs"
                >
                  <button
                    type="button"
                    onClick={() => setOpenIdx(isOpen ? null : idx)}
                    className="w-full text-left p-5 flex items-center justify-between gap-4 font-semibold text-sm text-slate-900 hover:text-[#1265DD] transition-colors"
                  >
                    <span>{item.q}</span>
                    <CaretDown
                      size={16}
                      className={`text-slate-400 flex-shrink-0 transition-transform duration-300 ${
                        isOpen ? "rotate-180 text-[#1265DD]" : ""
                      }`}
                    />
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="px-5 pb-5 text-xs text-slate-600 leading-relaxed border-t border-slate-200/60 pt-3">
                        {item.a}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Conversion Banner */}
      <section className="bg-slate-50/[0.90] backdrop-blur-xl text-mist py-16 px-6 border-t border-slate-200/80">
        <div className="max-w-5xl mx-auto">
          <div className="reveal bg-[#04111d]/85 backdrop-blur-xl rounded-3xl p-8 sm:p-12 border border-brand/35 flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl shadow-[#061826]/20 relative overflow-hidden">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-20 w-72 h-72 rounded-full bg-brand/25 blur-3xl"
            />
            <div className="relative z-10">
              <span className="text-[11px] font-mono text-brand-soft uppercase tracking-wider block mb-2 font-medium">
                Collaboration &amp; Ingénierie Assistée par IA
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                Prêt à concevoir, versionner et implémenter votre prochaine architecture ?
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
                Créez un espace public ou privé, invitez vos collaborateurs et connectez votre
                dépôt GitHub et vos agents MCP en quelques secondes.
              </p>
            </div>

            <Link
              href="/dashboard"
              className="relative z-10 px-8 py-4 rounded-xl text-sm font-semibold bg-amber text-abyss hover:bg-[#ff951a] transition-all shadow-lg shadow-amber/25 whitespace-nowrap flex items-center gap-2 flex-shrink-0"
            >
              <span>Ouvrir LONKOO</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white/[0.96] backdrop-blur-xl text-slate-600 border-t border-slate-200 py-14 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-8 text-xs">
          <div className="col-span-2">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-[#1265DD]">
                <Hexagon size={16} weight="fill" />
              </div>
              <span className="font-bold text-slate-950 tracking-wider text-sm">
                LONKOO
              </span>
            </div>
            <p className="text-slate-500 leading-relaxed max-w-sm mb-4">
              Plateforme collaborative de modélisation d&apos;architecture logicielle, de
              versioning de stack assisté par IA et d&apos;implémentation via MCP, Orion et GitHub.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-[#1265DD] font-mono font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1265DD] animate-pulse" />
              <span>Synchronisation Git · MCP v1.0 · Orion Ready</span>
            </div>
          </div>

          <div>
            <div className="font-semibold text-slate-900 mb-3">Plateforme</div>
            <ul className="space-y-2 text-slate-600">
              <li>
                <Link href="/dashboard" className="hover:text-[#1265DD] transition-colors">
                  Bibliothèque de Projets
                </Link>
              </li>
              <li>
                <Link href="/studio" className="hover:text-[#1265DD] transition-colors">
                  Studio Collaboratif
                </Link>
              </li>
              <li>
                <Link
                  href="/studio?tab=scanner"
                  className="hover:text-[#1265DD] transition-colors"
                >
                  Scanner IA &amp; Auto-Doc
                </Link>
              </li>
              <li>
                <Link
                  href="/studio?tab=simulator"
                  className="hover:text-[#1265DD] transition-colors"
                >
                  Simulateur de Charge
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <div className="font-semibold text-slate-900 mb-3">Communauté</div>
            <ul className="space-y-2 text-slate-600">
              <li>
                <Link href="/palabre" className="hover:text-[#1265DD] transition-colors">
                  Templates &amp; Architectures
                </Link>
              </li>
              <li>
                <Link href="/reviews" className="hover:text-[#1265DD] transition-colors">
                  Revues (Pull Requests)
                </Link>
              </li>
              <li>
                <Link href="/deploy" className="hover:text-[#1265DD] transition-colors">
                  Serveur MCP &amp; Orion
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <div className="font-semibold text-slate-900 mb-3">Espace &amp; Accès</div>
            <ul className="space-y-2 text-slate-600">
              <li>
                <Link href="/onboarding" className="hover:text-[#1265DD] transition-colors">
                  Initialisation Profil
                </Link>
              </li>
              <li>
                <Link href="/settings" className="hover:text-[#1265DD] transition-colors">
                  Dépôts GitHub &amp; Tags
                </Link>
              </li>
              <li>
                <Link href="/settings" className="hover:text-[#1265DD] transition-colors">
                  Permissions &amp; Jetons MCP
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-5xl mx-auto mt-12 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-3">
          <p>© 2026 LONKOO — Plateforme Collaborative d&apos;Architecture Logicielle.</p>
          <div className="flex items-center gap-6 font-mono">
            <span>Git-Native Architecture</span>
            <span>MCP &amp; Orion Integration</span>
          </div>
        </div>
      </footer>
    </>
  );
}
