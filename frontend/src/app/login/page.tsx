"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle, GithubLogo, Play, WarningCircle } from "@phosphor-icons/react";
import { IS_MOCK_SESSION, safeNextPath, useSession, type SessionUser } from "@/lib/session";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { ThemeIconButton } from "@/components/theme/ThemeToggle";

const ONBOARDED_KEY = "lonkoo.onboarded";

function isOnboarded(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return true;
  }
}

/** Panneau de présentation : architecture illustrative sur fond de marque. */
function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-brand text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      <div>
        <h2 className="max-w-xl text-4xl font-semibold leading-[1.12] tracking-tight xl:text-5xl">
          L&apos;architecture de votre application, dessinée à plusieurs.
        </h2>
        <ul className="mt-8 space-y-3 text-[15px] text-white">
          {[
            "Un canevas partagé, avec les curseurs de toute l'équipe",
            "Un copilote IA qui propose, sans jamais décider à votre place",
            "Du schéma validé au projet généré, poussé sur GitHub et déployé",
          ].map((line) => (
            <li key={line} className="flex items-start gap-3">
              <CheckCircle size={20} weight="fill" className="mt-0.5 flex-shrink-0" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <svg viewBox="0 0 520 300" fill="none" className="mt-10 w-full max-w-xl" role="img" aria-label="Exemple d'architecture : boutique web, API, base de données, paiement mobile et notifications">
        <g stroke="#9CC2F8" strokeWidth="2" strokeLinecap="round">
          <path d="M150 58C216 58 216 26 282 26M150 58C216 58 216 138 282 138M372 138H432M327 156C327 230 340 234 372 234" />
        </g>
        {[
          { x: 20, y: 40, w: 130, label: "Boutique web" },
          { x: 282, y: 8, w: 90, label: "Connexion" },
          { x: 282, y: 120, w: 90, label: "API" },
          { x: 432, y: 120, w: 76, label: "Base" },
          { x: 372, y: 216, w: 136, label: "Paiement mobile" },
        ].map((node) => (
          <g key={node.label}>
            <rect x={node.x} y={node.y} width={node.w} height={36} rx={10} fill="#0F56BD" stroke="#9CC2F8" strokeWidth="2" />
            <text
              x={node.x + node.w / 2}
              y={node.y + 23}
              textAnchor="middle"
              fontSize="13"
              fontWeight="600"
              fill="#ffffff"
              fontFamily="var(--font-geist-sans), system-ui, sans-serif"
            >
              {node.label}
            </text>
          </g>
        ))}
      </svg>
    </aside>
  );
}

/**
 * Message pour un retour d'échec du serveur (`/login?error=github` après un refus ou un échec de la
 * connexion GitHub). Seules les valeurs connues sont traduites : le paramètre n'est jamais affiché tel quel.
 */
function messageForReturnedError(code: string | null): string | null {
  if (code === "github") {
    return "La connexion avec GitHub a été refusée ou n'a pas abouti. Réessayez, ou ouvrez un espace de démonstration sans compte.";
  }
  return null;
}

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, user, signInAsGuest, signInWithGitHub } = useSession();
  const [pending, setPending] = useState<"github" | "guest" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const next = safeNextPath(params.get("next"), "");
  // Le serveur renvoie ici avec ?error=github quand l'autorisation est refusée : le message reste affiché
  // jusqu'à la prochaine tentative.
  const returnedError = messageForReturnedError(params.get("error"));
  const shownError = error ?? (pending ? null : returnedError);

  const goAfterLogin = useCallback(
    (signedIn: SessionUser) => {
      router.replace(next || (signedIn.isGuest || isOnboarded() ? "/dashboard" : "/onboarding"));
    },
    [next, router],
  );

  // Déjà connecté (ou connexion qui vient d'aboutir) : on entre dans l'espace de travail.
  useEffect(() => {
    if (status === "authenticated" && user) goAfterLogin(user);
  }, [status, user, goAfterLogin]);

  const run = async (kind: "github" | "guest") => {
    setError(null);
    setPending(kind);
    try {
      if (kind === "guest") await signInAsGuest();
      else await signInWithGitHub();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La connexion a échoué. Réessayez.");
      setPending(null);
    }
  };

  const busy = pending !== null || status === "loading" || status === "authenticated";

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-2">
      <main id="contenu" className="flex flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeIconButton />
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Connexion</h1>
          <p className="mt-2 text-[15px] text-ink-2">Retrouvez vos projets d&apos;architecture et votre équipe.</p>

          <div className="mt-8 space-y-3">
            <Button
              variant="inverse"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => run("github")}
            >
              <GithubLogo size={20} weight="fill" />
              {pending === "github" ? "Redirection…" : "Continuer avec GitHub"}
            </Button>
            <p className="px-1 text-xs text-ink-3">
              Accès limité à votre profil et à vos dépôts publics. Aucun jeton n&apos;est conservé.
            </p>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-ink-3" aria-hidden="true">
            <span className="h-px flex-1 bg-edge" />
            ou
            <span className="h-px flex-1 bg-edge" />
          </div>

          <div className="space-y-3">
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => run("guest")}
            >
              <Play size={18} weight="fill" />
              {pending === "guest" ? "Ouverture…" : "Essayer sans compte"}
            </Button>
            <p className="px-1 text-xs text-ink-3">
              Un espace de démonstration avec un modèle déjà rempli, valable 24 heures.
            </p>
          </div>

          {shownError && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2.5 rounded-lg border border-danger bg-surface p-3 text-sm text-danger"
            >
              <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
              <span>{shownError}</span>
            </div>
          )}

          {IS_MOCK_SESSION && (
            <p className="mt-8 rounded-lg bg-subtle px-3 py-2 text-xs text-ink-2">
              Mode démonstration : la connexion est simulée dans ce navigateur.
            </p>
          )}
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 self-start text-sm text-ink-3 transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} />
          Retour à l&apos;accueil
        </Link>
      </main>

      <BrandPanel />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
      <LoginContent />
    </Suspense>
  );
}
