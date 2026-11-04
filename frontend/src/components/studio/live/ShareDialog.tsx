"use client";

import React, { useState } from "react";
import { Check, Copy, LinkSimple } from "@phosphor-icons/react";
import { apiFetch, messageOf } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Field, inputClass, selectClass } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  canvasId: string;
  /** Appelé après chaque lien créé, pour que la liste des liens actifs de l'onglet Équipe se relise. */
  onCreated?: () => void;
}

interface CreatedLink {
  id: string;
  url: string;
  expiresAt: string;
}

const DURATIONS = [
  { hours: 1, label: "1 heure" },
  { hours: 6, label: "6 heures" },
  { hours: 24, label: "24 heures" },
  { hours: 72, label: "72 heures" },
] as const;

const ROLES = [
  { value: "WRITE", label: "Peut modifier", hint: "Dessine avec vous, enregistre et restaure des versions" },
  { value: "READ", label: "Lecture seule", hint: "Regarde le canvas en direct, sans le modifier" },
] as const;

/** Création d'un lien de partage du canvas (rôle et durée au choix, 72 heures au plus). */
export function ShareDialog({ open, onClose, canvasId, onCreated }: ShareDialogProps) {
  const [role, setRole] = useState<"WRITE" | "READ">("WRITE");
  const [hours, setHours] = useState<number>(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<CreatedLink | null>(null);
  const [copied, setCopied] = useState(false);

  const close = () => {
    setLink(null);
    setError(null);
    setCopied(false);
    onClose();
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setLink(
        await apiFetch<CreatedLink>(`/api/canvases/${canvasId}/share-links`, {
          method: "POST",
          body: { role, ttlHours: hours },
        }),
      );
      onCreated?.();
    } catch (failure) {
      // Limite de liens actifs (409), rôle insuffisant (403), session expirée…
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      // Presse-papiers refusé : le champ reste sélectionnable à la main.
      setCopied(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Partager le canvas">
      <form onSubmit={create} className="space-y-5">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">Ce que la personne pourra faire</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ROLES.map((option) => {
              const selected = role === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setRole(option.value)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    selected ? "border-accent bg-sunken ring-1 ring-accent" : "border-edge bg-surface hover:border-edge-strong",
                  )}
                >
                  <span className="block text-sm font-semibold text-ink">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-3">{option.hint}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field label="Validité du lien" htmlFor="share-duration" hint="Au-delà, le lien cesse de fonctionner. 72 heures au plus.">
          <select
            id="share-duration"
            value={hours}
            onChange={(event) => setHours(Number(event.target.value))}
            className={selectClass}
          >
            {DURATIONS.map((duration) => (
              <option key={duration.hours} value={duration.hours}>
                {duration.label}
              </option>
            ))}
          </select>
        </Field>

        {error && (
          <p role="alert" className="rounded-lg border border-edge-strong bg-sunken px-3 py-2 text-sm text-ink">
            {error}
          </p>
        )}

        {link && (
          <div className="space-y-2 rounded-lg bg-sunken p-3">
            <label htmlFor="share-url" className="block text-xs font-medium text-ink-2">
              Lien à envoyer
            </label>
            <div className="flex items-center gap-2">
              <input
                id="share-url"
                readOnly
                value={link.url}
                onFocus={(event) => event.currentTarget.select()}
                className={cn(inputClass, "h-9 font-mono text-xs")}
              />
              <Button variant="secondary" size="sm" onClick={() => void copy()}>
                {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
                {copied ? "Copié" : "Copier"}
              </Button>
            </div>
            <p className="text-xs text-ink-3">
              Valable jusqu&apos;au{" "}
              {new Date(link.expiresAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}. Sans compte, la
              personne rejoint avec un espace d&apos;invité de 24 heures.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-edge-soft pt-4">
          <Button variant="secondary" onClick={close}>
            Fermer
          </Button>
          <Button type="submit" disabled={busy}>
            <LinkSimple size={15} />
            {busy ? "Création…" : link ? "Créer un autre lien" : "Créer le lien"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
