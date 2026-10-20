"use client";

import React, { useState } from "react";
import Link from "next/link";
import { List, X } from "@phosphor-icons/react";
import { useSession } from "@/lib/session";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { ThemeIconButton } from "@/components/theme/ThemeToggle";

const LINKS = [
  { label: "Parcours", href: "#parcours" },
  { label: "Fonctionnalités", href: "#fonctionnalites" },
  { label: "Questions", href: "#faq" },
] as const;

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const { status } = useSession();
  const signedIn = status === "authenticated";

  return (
    <header className="sticky top-0 z-50 border-b border-edge bg-canvas">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Logo />

        <nav aria-label="Sections de la page" className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-sm font-medium text-ink-2 transition-colors hover:text-ink">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <ThemeIconButton />
          {signedIn ? (
            <Button href="/dashboard" size="sm">
              Ouvrir mes projets
            </Button>
          ) : (
            <>
              <div className="hidden sm:block">
                <Button href="/login" variant="ghost" size="sm">
                  Se connecter
                </Button>
              </div>
              <Button href="/login" size="sm">
                Commencer
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={open}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-subtle md:hidden"
          >
            {open ? <X size={18} /> : <List size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <nav aria-label="Sections de la page" className="border-t border-edge bg-canvas px-5 py-3 md:hidden">
          <ul className="space-y-1">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-subtle hover:text-ink"
                >
                  {link.label}
                </a>
              </li>
            ))}
            {!signedIn && (
              <li>
                <Link
                  href="/login"
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-subtle hover:text-ink"
                >
                  Se connecter
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
