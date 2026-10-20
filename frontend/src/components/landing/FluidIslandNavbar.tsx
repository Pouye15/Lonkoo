"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Hexagon,
  Cpu,
  Compass,
  PlugsConnected,
  GitPullRequest,
  SlidersHorizontal,
} from "@phosphor-icons/react";

const NAV_LINKS = [
  { label: "Studio Collaboratif", href: "/studio", icon: SlidersHorizontal },
  { label: "Assistant IA & Doc", href: "/studio?tab=scanner", icon: Cpu },
  { label: "Templates & Forks", href: "/palabre", icon: Compass },
  { label: "Pont MCP & Orion", href: "/deploy", icon: PlugsConnected },
  { label: "Revues (PR)", href: "/reviews", icon: GitPullRequest },
] as const;

export function FluidIslandNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let rafId = 0;
    const handleScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        setScrolled(window.scrollY > 20);
        rafId = 0;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 pt-4 px-4 pointer-events-none">
      <nav
        aria-label="Navigation principale"
        className={`pointer-events-auto mx-auto h-14 max-w-5xl px-6 rounded-full glass flex items-center justify-between whitespace-nowrap transition-all duration-300 ${
          scrolled
            ? "bg-abyss/85 border-line-strong shadow-xl shadow-black/40"
            : "bg-abyss/60 border-line"
        }`}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-xl bg-brand/15 border border-brand/35 flex items-center justify-center text-brand-soft group-hover:scale-105 transition-transform">
            <Hexagon size={18} weight="fill" />
          </div>
          <span className="font-bold text-white tracking-wider text-sm">
            LONKOO
          </span>
          <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand/10 text-brand-soft border border-brand/25">
            Architecture &amp; Git
          </span>
        </Link>

        {/* Navigation centrale */}
        <div className="hidden md:flex items-center gap-6 text-xs font-medium text-muted">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="hover:text-mist transition-colors py-1"
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-xs text-muted hover:text-mist transition-colors hidden sm:block px-2"
          >
            Bibliothèque
          </Link>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-full text-xs font-semibold bg-amber text-abyss hover:bg-amber/90 transition-all shadow-md shadow-amber/15"
          >
            Ouvrir l&apos;Espace
          </Link>
        </div>
      </nav>
    </header>
  );
}
