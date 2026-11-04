"use client";

import React, { useMemo, useState } from "react";
import { Check, Copy, DownloadSimple } from "@phosphor-icons/react";
import { IS_LIVE_API, apiFetch, messageOf } from "@/lib/api";
import { snapshotFromGraph, toMermaid, toSvg } from "@/lib/canvas-export";
import { downloadBlob, downloadJson, downloadText, svgToPng } from "@/lib/download";
import type { ArchitectureEdge, ArchitectureNode } from "@/lib/lonkoo-data";
import { slugify } from "@/lib/workspace";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { textareaClass } from "@/components/ui/Field";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  projectName: string;
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  /** Mode API : le serveur fournit l'instantané du contrat (identifiants techniques stables). */
  canvasId?: string | null;
}

type Pending = "json" | "svg" | "png" | null;

/** Exports du canvas : code Mermaid, spécification JSON du contrat, images SVG et PNG. */
export function ExportDialog({ open, onClose, projectName, nodes, edges, canvasId }: ExportDialogProps) {
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const base = slugify(projectName) || "architecture";
  const mermaid = useMemo(() => (open ? toMermaid(nodes, edges) : ""), [open, nodes, edges]);
  const empty = nodes.length === 0;

  const run = async (kind: Exclude<Pending, null>, action: () => Promise<void> | void) => {
    setPending(kind);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setPending(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText("```mermaid\n" + mermaid + "```\n");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Le presse-papiers est refusé : sélectionnez le code à la main.");
    }
  };

  const exportJson = () =>
    run("json", async () => {
      // Mode API : l'instantané du serveur fait foi (le même que celui des versions et du générateur).
      const snapshot =
        IS_LIVE_API && canvasId
          ? await apiFetch<unknown>(`/api/canvases/${canvasId}/snapshot`)
          : snapshotFromGraph(nodes, edges, { name: projectName.slice(0, 80) });
      downloadJson(`${base}.canvas.json`, snapshot);
    });

  const exportSvg = () =>
    run("svg", () => {
      downloadText(`${base}.svg`, toSvg(nodes, edges, { title: `Architecture ${projectName}` }).svg, "image/svg+xml");
    });

  const exportPng = () =>
    run("png", async () => {
      const { svg, width, height } = toSvg(nodes, edges, { title: `Architecture ${projectName}` });
      downloadBlob(`${base}.png`, await svgToPng(svg, width, height));
    });

  const cards: { id: Exclude<Pending, null>; title: string; text: string; label: string; onClick: () => void }[] = [
    { id: "json", title: "Spécification JSON", text: "Le contrat du canvas : blocs, liens, tables et endpoints. Entrée du générateur et de l'IA.", label: "Télécharger .json", onClick: exportJson },
    { id: "svg", title: "Image vectorielle SVG", text: "Nette à toutes les tailles, pour un document ou un site.", label: "Télécharger .svg", onClick: exportSvg },
    { id: "png", title: "Image PNG", text: "Image sur fond blanc, pour une présentation ou un message.", label: "Télécharger .png", onClick: exportPng },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Exporter l'architecture" size="lg">
      <div className="space-y-5">
        {empty && (
          <p role="status" className="rounded-lg bg-sunken px-3 py-2 text-sm text-ink-2">
            Le canevas est vide : les fichiers exportés ne contiendraient aucun bloc.
          </p>
        )}

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-ink">Code Mermaid</h3>
              <p className="text-xs text-ink-3">Collé dans un README GitHub, le schéma s&apos;affiche tel quel.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => void copy()} disabled={empty}>
                {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
                {copied ? "Copié" : "Copier"}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => downloadText(`${base}.mmd`, mermaid)} disabled={empty}>
                <DownloadSimple size={14} />
                Télécharger .mmd
              </Button>
            </div>
          </div>
          <textarea
            readOnly
            aria-label="Code Mermaid"
            rows={8}
            value={mermaid}
            onFocus={(event) => event.currentTarget.select()}
            className={`${textareaClass} font-mono text-xs`}
          />
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {cards.map((card) => (
            <div key={card.id} className="flex flex-col justify-between gap-3 rounded-lg border border-edge bg-surface p-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">{card.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-3">{card.text}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={card.onClick} disabled={empty || pending !== null}>
                <DownloadSimple size={14} />
                {pending === card.id ? "Préparation…" : card.label}
              </Button>
            </div>
          ))}
        </section>

        {error && (
          <p role="alert" className="rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end border-t border-edge-soft pt-4">
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
