import React from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export function FinalCta() {
  return (
    <section className="px-5 pb-24 sm:pb-28">
      <div className="reveal mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 rounded-3xl bg-brand p-8 text-white sm:p-12 md:flex-row md:items-center">
        <div className="max-w-xl">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Dessinez votre prochaine architecture avec votre équipe.
          </h2>
          <p className="mt-3 text-[15px] text-white">
            Connectez-vous avec GitHub, ou ouvrez un espace de démonstration en un clic.
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-white px-6 text-[15px] font-semibold text-brand transition-colors hover:bg-[#e8f0fd]"
          >
            Commencer
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-white px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#0f56bd]"
          >
            Essayer sans compte
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-edge bg-surface px-5 py-12">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-2">
            Le studio où une équipe conçoit l&apos;architecture de son application, puis la génère et la déploie.
          </p>
        </div>

        <nav aria-label="Produit">
          <div className="text-sm font-semibold text-ink">Produit</div>
          <ul className="mt-3 space-y-2 text-sm text-ink-2">
            <li>
              <a href="#parcours" className="hover:text-ink">
                Parcours
              </a>
            </li>
            <li>
              <a href="#fonctionnalites" className="hover:text-ink">
                Fonctionnalités
              </a>
            </li>
            <li>
              <a href="#faq" className="hover:text-ink">
                Questions fréquentes
              </a>
            </li>
          </ul>
        </nav>

        <nav aria-label="Compte">
          <div className="text-sm font-semibold text-ink">Compte</div>
          <ul className="mt-3 space-y-2 text-sm text-ink-2">
            <li>
              <Link href="/login" className="hover:text-ink">
                Se connecter
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-ink">
                Essayer sans compte
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="mx-auto mt-10 max-w-6xl border-t border-edge pt-6 text-sm text-ink-3">
        © 2026 LONKOO. Tous droits réservés.
      </div>
    </footer>
  );
}
