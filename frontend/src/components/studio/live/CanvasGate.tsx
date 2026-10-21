"use client";

import React from "react";
import { CloudSlash, WarningCircle } from "@phosphor-icons/react";
import type { LiveCanvasInfo } from "@/lib/project-graph";
import { Button } from "@/components/ui/Button";

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
 */
export function CanvasGate({ live, children }: { live: LiveCanvasInfo; children: React.ReactNode }) {
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
          className="absolute left-1/2 top-16 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger shadow-card"
        >
          <WarningCircle size={16} weight="fill" />
          {live.error}
        </div>
      )}
      {children}
    </div>
  );
}
