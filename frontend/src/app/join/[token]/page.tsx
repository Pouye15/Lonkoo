"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, WarningCircle } from "@phosphor-icons/react";
import { ApiError, IS_LIVE_API, apiFetch, type ApiJoin } from "@/lib/api";
import { useSession } from "@/lib/session";
import { loadProjects } from "@/lib/workspace";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { ThemeIconButton } from "@/components/theme/ThemeToggle";

/**
 * Une seule demande par jeton, même si React monte la page deux fois (mode strict) : sans session, la
 * jonction crée un invité, et deux demandes en créeraient deux.
 */
const joins = new Map<string, Promise<ApiJoin>>();

function join(token: string): Promise<ApiJoin> {
  let pending = joins.get(token);
  if (!pending) {
    pending = apiFetch<ApiJoin>(`/api/join/${encodeURIComponent(token)}`, { method: "POST", quiet401: true });
    joins.set(token, pending);
    // Un échec ne reste pas en mémoire : « Réessayer » repart d'une nouvelle demande.
    pending.catch(() => joins.delete(token));
  }
  return pending;
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return "Ce lien de partage est inconnu ou a expiré. Demandez-en un nouveau à la personne qui vous l'a envoyé.";
    if (error.status === 429) return "Trop d'espaces ont été ouverts depuis cette adresse. Réessayez dans une heure.";
    if (error.status === 0) return "Le serveur est injoignable. Réessayez dans un instant.";
    return error.message;
  }
  return "Le lien n'a pas pu être ouvert. Réessayez.";
}

export default function JoinPage() {
  const router = useRouter();
  const { token } = useParams<{ token: string }>();
  const { refresh } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!IS_LIVE_API) return;
    let cancelled = false;
    (async () => {
      try {
        const joined = await join(token);
        // Le lien a pu ouvrir une session d'invité : on la relit, puis on relit les projets (celui-ci en fait partie).
        await refresh();
        await loadProjects();
        if (!cancelled) router.replace(`/studio?project=${joined.projectId}`);
      } catch (failure) {
        if (!cancelled) setError(messageFor(failure));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, attempt, refresh, router]);

  const unavailable = !IS_LIVE_API
    ? "Les liens de partage ne fonctionnent pas en mode démonstration : il n'y a pas de serveur auquel se connecter."
    : null;
  const shownError = unavailable ?? error;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas px-6 py-6 sm:px-10">
      <div className="flex items-center justify-between">
        <Logo />
        <ThemeIconButton />
      </div>

      <main id="contenu" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Rejoindre un projet</h1>

        {shownError ? (
          <>
            <div role="alert" className="mt-6 flex items-start gap-2.5 rounded-lg border border-danger bg-surface p-3 text-sm text-danger">
              <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
              <span>{shownError}</span>
            </div>
            <div className="mt-5 flex items-center gap-2">
              {!unavailable && (
                <Button
                  onClick={() => {
                    setError(null);
                    setAttempt((value) => value + 1);
                  }}
                >
                  Réessayer
                </Button>
              )}
              <Button href="/login" variant="secondary">
                Aller à la connexion
              </Button>
            </div>
          </>
        ) : (
          <p role="status" className="mt-3 text-[15px] text-ink-2">
            Ouverture du lien de partage…
          </p>
        )}
      </main>

      <Link href="/" className="inline-flex items-center gap-1.5 self-start text-sm text-ink-3 transition-colors hover:text-ink">
        <ArrowLeft size={14} />
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
