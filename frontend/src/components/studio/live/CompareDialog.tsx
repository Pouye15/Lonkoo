"use client";

import React, { useEffect, useMemo, useState } from "react";
import { apiFetch, messageOf, type ApiVersion } from "@/lib/api";
import { diffSnapshots, type ChangeKind, type NodeChange, type SnapshotDiff } from "@/lib/canvas-diff";
import { toSvg } from "@/lib/canvas-export";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { selectClass } from "@/components/ui/Field";

interface CompareDialogProps {
  open: boolean;
  onClose: () => void;
  canvasId: string;
  /** La version à comparer (l'état « avant »). */
  version: ApiVersion | null;
  /** Les autres versions du canvas, proposées comme point de comparaison. */
  versions: ApiVersion[];
}

const CURRENT = "current";

const KIND: Record<ChangeKind, { label: string; plural: string; dot: string }> = {
  added: { label: "ajouté", plural: "Ajoutés", dot: "var(--ok-fill)" },
  removed: { label: "supprimé", plural: "Supprimés", dot: "var(--danger)" },
  modified: { label: "modifié", plural: "Modifiés", dot: "var(--warn-fill)" },
};

interface Loaded {
  key: string;
  diff?: SnapshotDiff;
  error?: string;
}

function Dot({ color, hollow = false }: { color?: string; hollow?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={hollow ? undefined : { backgroundColor: color }}
      className={`inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${hollow ? "border border-ink-3" : ""}`}
    />
  );
}

function Legend({ diff }: { diff: SnapshotDiff }) {
  const items: { kind: ChangeKind; count: number }[] = [
    { kind: "added", count: diff.counts.added },
    { kind: "removed", count: diff.counts.removed },
    { kind: "modified", count: diff.counts.modified },
  ];
  return (
    <ul aria-label="Légende" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
      {items.map(({ kind, count }) => (
        <li key={kind} className="flex items-center gap-1.5">
          <Dot color={KIND[kind].dot} />
          {KIND[kind].plural} <span className="font-mono text-xs text-ink-3">{count}</span>
        </li>
      ))}
      {diff.counts.moved > 0 && (
        <li className="flex items-center gap-1.5">
          <Dot hollow />
          Déplacés <span className="font-mono text-xs text-ink-3">{diff.counts.moved}</span>
        </li>
      )}
    </ul>
  );
}

function NodeList({ kind, changes }: { kind: ChangeKind; changes: NodeChange[] }) {
  if (changes.length === 0) return null;
  return (
    <section>
      <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Dot color={KIND[kind].dot} />
        Blocs {KIND[kind].plural.toLowerCase()} ({changes.length})
      </h4>
      <ul className="space-y-2">
        {changes.map((change) => (
          <li key={change.id} className="rounded-lg border border-edge bg-surface px-3 py-2">
            <div className="text-sm font-medium text-ink">{change.title}</div>
            {change.details.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-2">
                {change.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Comparateur visuel des versions : le schéma des deux états superposés, les blocs ajoutés en vert, supprimés en
 * rouge (pointillés) et modifiés en orange, et la liste de ce qui a changé (tables, champs, endpoints…).
 */
export function CompareDialog({ open, onClose, canvasId, version, versions }: CompareDialogProps) {
  const [against, setAgainst] = useState<string>(CURRENT);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const key = open && version ? `${version.id}|${against}` : null;

  useEffect(() => {
    if (!key || !version) return;
    let cancelled = false;
    (async () => {
      try {
        const before = (await apiFetch<{ snapshot: unknown }>(`/api/canvases/${canvasId}/versions/${version.id}`)).snapshot;
        const after =
          against === CURRENT
            ? await apiFetch<unknown>(`/api/canvases/${canvasId}/snapshot`)
            : (await apiFetch<{ snapshot: unknown }>(`/api/canvases/${canvasId}/versions/${against}`)).snapshot;
        if (!cancelled) setLoaded({ key, diff: diffSnapshots(before as never, after as never) });
      } catch (failure) {
        if (!cancelled) setLoaded({ key, error: messageOf(failure) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, version, against, canvasId]);

  const current = key !== null && loaded?.key === key ? loaded : null;
  const diff = current?.diff ?? null;

  const svg = useMemo(
    () =>
      diff
        ? toSvg(diff.graph.nodes, diff.graph.edges, {
            title: `Comparaison de la version ${version?.name ?? ""}`,
            status: { nodes: diff.graph.nodeStatus, edges: diff.graph.edgeStatus },
          }).svg
        : null,
    [diff, version],
  );

  const others = versions.filter((v) => v.id !== version?.id);
  const againstName = against === CURRENT ? "le canvas actuel" : (versions.find((v) => v.id === against)?.name ?? "");
  const titleOf = (id: string) => diff?.graph.nodes.find((n) => n.id === id)?.title ?? id;

  return (
    <Modal open={open} onClose={onClose} title={version ? `Comparer la version « ${version.name} »` : "Comparer"} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="compare-against" className="text-sm text-ink-2">
            avec
          </label>
          <div className="w-72 max-w-full">
            <select id="compare-against" value={against} onChange={(event) => setAgainst(event.target.value)} className={selectClass}>
              <option value={CURRENT}>le canvas actuel</option>
              {others.map((other) => (
                <option key={other.id} value={other.id}>
                  la version « {other.name} »
                </option>
              ))}
            </select>
          </div>
        </div>

        {current?.error && (
          <p role="alert" className="rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger">
            {current.error}
          </p>
        )}

        {!current && (
          <p role="status" className="rounded-lg bg-sunken px-3 py-6 text-center text-sm text-ink-3">
            Chargement de la comparaison…
          </p>
        )}

        {diff && (
          <>
            <p className="text-sm text-ink-3">
              Ce qui a changé entre « {version?.name} » et {againstName}.
            </p>
            <Legend diff={diff} />

            {diff.identical ? (
              <p role="status" className="rounded-lg bg-sunken px-3 py-3 text-sm text-ink-2">
                Aucune différence : ces deux états sont identiques.
              </p>
            ) : null}

            {svg && (
              <div
                aria-label="Schéma de la comparaison"
                role="img"
                className="max-h-[50vh] overflow-auto rounded-lg border border-edge [&>svg]:h-auto [&>svg]:w-full [&>svg]:min-w-[40rem]"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            )}

            <div className="space-y-4">
              <NodeList kind="added" changes={diff.nodes.filter((n) => n.kind === "added")} />
              <NodeList kind="removed" changes={diff.nodes.filter((n) => n.kind === "removed")} />
              <NodeList kind="modified" changes={diff.nodes.filter((n) => n.kind === "modified")} />

              {diff.moved.length > 0 && (
                <section>
                  <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <Dot hollow />
                    Blocs déplacés ({diff.moved.length})
                  </h4>
                  <p className="text-xs text-ink-2">{diff.moved.map(titleOf).join(", ")}</p>
                </section>
              )}

              {diff.edges.length > 0 && (
                <section>
                  <h4 className="mb-1.5 text-sm font-semibold text-ink">Liens ({diff.edges.length})</h4>
                  <ul className="space-y-1 text-xs text-ink-2">
                    {diff.edges.map((edge) => (
                      <li key={edge.id} className="flex flex-wrap items-center gap-1.5">
                        <Dot color={KIND[edge.kind].dot} />
                        <span>
                          Lien {KIND[edge.kind].label} : {edge.from} → {edge.to}
                          {edge.details.length > 0 ? ` (${edge.details.join(" ; ")})` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </>
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
