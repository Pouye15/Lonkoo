"use client";

import React, { useEffect, useState } from "react";
import { CloudSlash, WarningCircle } from "@phosphor-icons/react";
import type { LiveCanvasInfo } from "@/lib/project-graph";
import { Button } from "@/components/ui/Button";

/** Au-delà, la connexion au serveur de collaboration est « plus longue que prévu » : le premier échange dure d'ordinaire une ou deux secondes. */
const SLOW_CONNECTION_MS = 12_000;

function Placeholder({ title, children, alert = false }: { title: string; children?: React.ReactNode; alert?: boolean }) {
  return (
    <div
      role={alert ? "alert" : "status"}
      className="flex h-full min-h-[28rem] w-full flex-1 flex-col items-center justify-center rounded-xl border border-edge bg-board p-6 text-center"
    >
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {children && <div className="mt-1 max-w-sm text-sm text-ink-3">{children}</div>}
    </div>
  );
}

/**
 * Montre le tableau une fois le document partagé chargé. Avant : chargement, accès refusé ou erreur (le tableau
 * ne s'affiche jamais vide « en attendant », ce qui laisserait croire que le canvas est vide). Après : un
 * bandeau signale une connexion perdue, sans retirer le tableau (les modifications partent au retour du réseau).
 *
 * Si le premier échange n'a pas lieu au bout de {@link SLOW_CONNECTION_MS} (serveur de collaboration arrêté ou
 * injoignable : aucune erreur n'arrive alors du navigateur, la connexion réessaie en silence), le message le dit et
 * propose de réessayer, au lieu de laisser un chargement sans fin. La connexion continue en arrière-plan : si elle
 * aboutit enfin, le tableau s'affiche tout seul.
 */
export function CanvasGate({ live, children }: { live: LiveCanvasInfo; children: React.ReactNode }) {
  const waiting = !live.synced && live.status === "connecting";
  const [slowFor, setSlowFor] = useState<string | null>(null);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setSlowFor(live.canvasId ?? ""), SLOW_CONNECTION_MS);
    return () => window.clearTimeout(timer);
  }, [waiting, live.canvasId]);

  if (!live.synced) {
    if (live.status === "denied") {
      return (
        <Placeholder title="Ce canvas n'est pas accessible" alert>
          <p>{live.error ?? "Il n'existe pas, ou vous n'en êtes pas membre."}</p>
          <Button href="/dashboard" variant="secondary" size="sm" className="mt-4">
            Retour aux projets
          </Button>
        </Placeholder>
      );
    }
    if (live.status === "error") {
      return (
        <Placeholder title="Connexion impossible" alert>
          <p>{live.error ?? "Le canvas partagé n'a pas pu être ouvert."}</p>
          <Button size="sm" className="mt-4" onClick={() => window.location.reload()}>
            Réessayer
          </Button>
        </Placeholder>
      );
    }
    if (waiting && slowFor === (live.canvasId ?? "")) {
      return (
        <Placeholder title="Connexion au canvas partagé…">
          <p>Cela prend plus de temps que d&apos;habitude : le serveur de collaboration ne répond pas encore.</p>
          {process.env.NODE_ENV !== "production" && (
            <p className="mt-2">
              En local, le serveur temps réel doit tourner (<code>npm run dev</code> dans <code>realtime/</code>, port 1234) et{" "}
              <code>frontend/.env.local</code> doit contenir <code>NEXT_PUBLIC_REALTIME_URL=ws://localhost:1234</code> (relancez
              l&apos;interface après l&apos;avoir modifié).
            </p>
          )}
          <Button size="sm" className="mt-4" onClick={() => window.location.reload()}>
            Réessayer
          </Button>
        </Placeholder>
      );
    }
    return <Placeholder title="Connexion au canvas partagé…" />;
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {live.status === "offline" && (
        <div
          role="status"
          className="absolute left-1/2 top-16 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-edge-strong bg-surface px-3 py-2 text-sm text-ink shadow-card"
        >
          <CloudSlash size={16} />
          Connexion perdue, reconnexion en cours… vos modifications sont conservées.
        </div>
      )}
      {live.error && live.status !== "offline" && (
        <div
          role="alert"
          className="absolute left-1/2 top-16 z-30 flex max-w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-2 rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger shadow-card"
        >
          <WarningCircle size={16} weight="fill" className="shrink-0" />
          <span>{live.error}</span>
          {live.status === "stopped" && (
            <Button size="sm" className="shrink-0" onClick={() => window.location.reload()}>
              Recharger
            </Button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
