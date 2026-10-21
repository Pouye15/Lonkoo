"use client";

import React, { useEffect, useState } from "react";
import { ArrowCounterClockwise, DownloadSimple, FloppyDisk } from "@phosphor-icons/react";
import { ApiError, apiFetch, messageOf, relativeTime, type ApiVersion } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { inputClass, textareaClass } from "@/components/ui/Field";

interface VersionsPanelProps {
  canvasId: string;
  /** Nom du projet, pour nommer les fichiers exportés. */
  projectName: string;
  /** Peut enregistrer et restaurer une version (rôle Write et plus). */
  canWrite: boolean;
}

interface Problem {
  message: string;
  /** Erreurs détaillées du validateur de canvas (422). */
  errors: string[];
}

function toProblem(error: unknown): Problem {
  return { message: messageOf(error), errors: error instanceof ApiError ? error.errors : [] };
}

/** Télécharge un objet JSON comme fichier. */
function download(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Versions nommées du canvas partagé : enregistrer, restaurer, exporter (docs/openapi.yaml, tag « Versions »). */
export function VersionsPanel({ canvasId, projectName, canWrite }: VersionsPanelProps) {
  const [versions, setVersions] = useState<ApiVersion[] | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ApiVersion[]>(`/api/canvases/${canvasId}/versions`)
      .then((list) => {
        if (!cancelled) setVersions(list);
      })
      .catch((error) => {
        if (!cancelled) setProblem(toProblem(error));
      });
    return () => {
      cancelled = true;
    };
  }, [canvasId]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setProblem(null);
    setNotice(null);
    try {
      const created = await apiFetch<ApiVersion>(`/api/canvases/${canvasId}/versions`, {
        method: "POST",
        body: { name: name.trim(), message: message.trim() || undefined },
      });
      setVersions((current) => [created, ...(current ?? [])]);
      setNotice(`Version « ${created.name} » enregistrée.`);
      setName("");
      setMessage("");
    } catch (error) {
      // Canvas invalide (422, avec la liste des erreurs), limite de versions (409), temps réel indisponible (503)…
      setProblem(toProblem(error));
    } finally {
      setSaving(false);
    }
  };

  const restore = async (version: ApiVersion) => {
    setRestoring(version.id);
    setProblem(null);
    setNotice(null);
    try {
      await apiFetch(`/api/canvases/${canvasId}/versions/${version.id}/restore`, { method: "POST" });
      setNotice(`Version « ${version.name} » restaurée : le canvas partagé a été remplacé pour toutes les personnes connectées.`);
    } catch (error) {
      setProblem(toProblem(error));
    } finally {
      setRestoring(null);
      setConfirming(null);
    }
  };

  const exportVersion = async (version: ApiVersion) => {
    setProblem(null);
    try {
      const detail = await apiFetch<{ snapshot: unknown }>(`/api/canvases/${canvasId}/versions/${version.id}`);
      download(`${projectName}-${version.name}.canvas.json`, detail.snapshot);
    } catch (error) {
      setProblem(toProblem(error));
    }
  };

  const exportCurrent = async () => {
    setProblem(null);
    try {
      download(`${projectName}.canvas.json`, await apiFetch(`/api/canvases/${canvasId}/snapshot`));
    } catch (error) {
      setProblem(toProblem(error));
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <div className="space-y-3 lg:col-span-8">
        {problem && (
          <div role="alert" className="rounded-xl border border-edge-strong bg-sunken p-4 text-sm text-ink">
            <p>{problem.message}</p>
            {problem.errors.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-2">
                {problem.errors.slice(0, 8).map((line) => (
                  <li key={line}>{line}</li>
                ))}
                {problem.errors.length > 8 && <li>… et {problem.errors.length - 8} autres.</li>}
              </ul>
            )}
          </div>
        )}
        {notice && (
          <p role="status" className="rounded-xl border border-edge bg-surface p-4 text-sm text-ink">
            {notice}
          </p>
        )}

        {versions === null && !problem && (
          <p role="status" className="rounded-xl border border-edge bg-surface p-5 text-sm text-ink-3">
            Chargement des versions…
          </p>
        )}

        {versions?.length === 0 && (
          <div className="rounded-xl border border-dashed border-edge-strong bg-surface p-8 text-center">
            <h3 className="text-sm font-semibold text-ink">Aucune version enregistrée</h3>
            <p className="mt-1 text-sm text-ink-3">
              Enregistrez une version pour garder une copie nommée de l&apos;architecture et pouvoir y revenir.
            </p>
          </div>
        )}

        {versions?.map((version, index) => (
          <div key={version.id} className={cn("rounded-xl border bg-surface p-5", index === 0 ? "border-accent" : "border-edge")}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-subtle px-2 py-0.5 font-mono text-xs font-bold text-ink">{version.name}</span>
                {index === 0 && <span className="text-[11px] font-medium text-accent">Plus récente</span>}
              </div>
              <span className="text-xs text-ink-4">{relativeTime(version.createdAt)}</span>
            </div>

            <h3 className="mb-3 text-sm font-bold text-ink">{version.message || "Sans note"}</h3>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge-soft pt-2.5">
              <span className="font-mono text-[11px] text-ink-3">Contrat version {version.schemaVersion}</span>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => void exportVersion(version)}>
                  <DownloadSimple size={14} />
                  Exporter
                </Button>
                {canWrite &&
                  (confirming === version.id ? (
                    <>
                      <span className="text-xs text-ink-2">Remplacer le canvas actuel ?</span>
                      <Button size="sm" disabled={restoring === version.id} onClick={() => void restore(version)}>
                        {restoring === version.id ? "Restauration…" : "Confirmer"}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setConfirming(null)}>
                        Annuler
                      </Button>
                    </>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => setConfirming(version.id)}>
                      <ArrowCounterClockwise size={14} />
                      Restaurer
                    </Button>
                  ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 lg:col-span-4">
        <form onSubmit={save} className="space-y-3.5 rounded-xl border border-edge bg-surface p-5 text-xs">
          <div className="text-sm font-bold text-ink">Enregistrer une version</div>
          <p className="leading-relaxed text-ink-3">
            Garde une copie nommée de l&apos;architecture actuelle, que vous pourrez restaurer ou exporter.
          </p>

          {canWrite ? (
            <>
              <div>
                <label htmlFor="version-name" className="mb-1 block font-medium text-ink-2">
                  Nom de la version
                </label>
                <input
                  id="version-name"
                  type="text"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="v1"
                  className={cn(inputClass, "font-mono")}
                />
              </div>
              <div>
                <label htmlFor="version-message" className="mb-1 block font-medium text-ink-2">
                  Note <span className="font-normal text-ink-3">(facultatif)</span>
                </label>
                <textarea
                  id="version-message"
                  rows={2}
                  maxLength={500}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Ce qui a changé"
                  className={textareaClass}
                />
              </div>
              <Button type="submit" className="w-full" disabled={!name.trim() || saving}>
                <FloppyDisk size={14} weight="bold" />
                {saving ? "Enregistrement…" : "Enregistrer la version"}
              </Button>
            </>
          ) : (
            <p className="rounded-lg bg-sunken px-3 py-2 text-ink-2">
              Votre rôle (lecture seule) ne permet pas d&apos;enregistrer ni de restaurer une version. Vous pouvez les exporter.
            </p>
          )}
        </form>

        <Button variant="secondary" className="w-full" onClick={() => void exportCurrent()}>
          <DownloadSimple size={15} />
          Exporter le canvas actuel (JSON)
        </Button>
      </div>
    </div>
  );
}
