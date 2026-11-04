import React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/** Marque LONKOO : trois nœuds reliés (deux branches qui convergent). */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("flex-shrink-0", className)}
    >
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <path
        d="M10.5 11.5 16 21m5.5-9.5L16 21"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="10.5" cy="11" r="3.2" fill="#ffffff" />
      <circle cx="21.5" cy="11" r="3.2" fill="#ffffff" />
      <circle cx="16" cy="21.5" r="3.2" fill="#ffffff" />
    </svg>
  );
}

interface LogoProps {
  href?: string;
  /** Masque le nom (barre latérale repliée). */
  markOnly?: boolean;
  size?: number;
  className?: string;
}

export function Logo({ href = "/", markOnly = false, size = 28, className }: LogoProps) {
  return (
    <Link href={href} aria-label="LONKOO, accueil" className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      {!markOnly && <span className="text-[15px] font-semibold tracking-[0.12em] text-ink">LONKOO</span>}
    </Link>
  );
}
