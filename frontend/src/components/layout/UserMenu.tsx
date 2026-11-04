"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GearSix, GithubLogo, SignOut, UserCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { initialsOf, useSession } from "@/lib/session";
import { useDismiss } from "@/components/ui/use-dismiss";

export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { user, signOut, signInWithGitHub } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  useDismiss(open, close, containerRef);

  if (!user) return null;

  const handleSignOut = async () => {
    close();
    await signOut();
    router.replace("/");
  };

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink-2 transition-colors hover:bg-subtle hover:text-ink";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? user.displayName : undefined}
        className={cn(
          "flex w-full items-center rounded-lg text-left transition-colors hover:bg-subtle",
          collapsed ? "h-10 justify-center" : "gap-2.5 p-1.5",
        )}
      >
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
          {initialsOf(user.displayName)}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{user.displayName}</span>
            <span className="block truncate font-mono text-xs text-ink-3">
              {user.isGuest ? "Espace de démonstration" : `@${user.login}`}
            </span>
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-50 w-64 rounded-xl border border-edge bg-surface p-1 shadow-pop",
            collapsed ? "bottom-0 left-full ml-2" : "bottom-full left-0 mb-2",
          )}
        >
          <div className="border-b border-edge-soft px-2.5 pb-2.5 pt-2">
            <div className="truncate text-sm font-medium text-ink">{user.displayName}</div>
            <div className="truncate font-mono text-xs text-ink-3">@{user.login}</div>
          </div>

          <div className="py-1">
            {user.isGuest && (
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  close();
                  await signInWithGitHub();
                }}
                className={itemClass}
              >
                <GithubLogo size={16} />
                Connecter GitHub
              </button>
            )}
            <Link href="/onboarding" role="menuitem" onClick={close} className={itemClass}>
              <UserCircle size={16} />
              Configuration initiale
            </Link>
            <Link href="/settings" role="menuitem" onClick={close} className={itemClass}>
              <GearSix size={16} />
              Paramètres
            </Link>
          </div>

          <div className="border-t border-edge-soft pt-1">
            <button type="button" role="menuitem" onClick={handleSignOut} className={itemClass}>
              <SignOut size={16} />
              Se déconnecter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
