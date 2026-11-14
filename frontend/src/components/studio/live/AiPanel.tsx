"use client";

import React, { useRef, useState } from "react";
import { ArrowsClockwise, Cpu, GitDiff, Sparkle, WarningCircle } from "@phosphor-icons/react";
import { ApiError } from "@/lib/api";
import {
  aiErrorMessage,
  backupVersionName,
  categoryLabel,
  correctionInstruction,
  demoAuditResult,
  discardedNotice,
  findingsSummary,
  graphFromSnapshot,
  severityLabel,
  sortFindings,
  type AiAuditResult,
  type AiFinding,
  type AiProposal,
  type AiSeverity,
} from "@/lib/ai";
import { auditCanvas, canvasSnapshot, completeCanvas, saveVersion, sketchCanvas } from "@/lib/ai-api";
import { diffSnapshots, type ChangeKind, type SnapshotDiff } from "@/lib/canvas-diff";
import { cn } from "@/lib/cn";
import type { ArchitectureEdge, ArchitectureNode } from "@/lib/lonkoo-data";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { textareaClass } from "@/components/ui/Field";

/** Le cahier des charges accepté par le serveur (`AI_MAX_INPUT_CHARS`). */
const MAX_BRIEF = 8000;

interface AiPanelProps {
  /** Canvas partagé du projet, en mode API ; `null` tant qu'il n'est pas connu ou en mode démonstration. */
  canvasId: string | null;
  /** Mode API : l'agent IA du serveur est joignable. Sinon, l'onglet montre un exemple étiqueté démonstration. */
  live: boolean;
  /** La personne peut écrire dans le canvas (rôle Write et plus) : elle seule peut demander puis appliquer une proposition. */
  canWrite: boolean;
  projectName: string;
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  setNodes: (next: ArchitectureNode[]) => void;
  setEdges: (next: ArchitectureEdge[]) => void;
}

type AuditState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; result: AiAuditResult }
  | { phase: "error"; message: string; errors: string[] };

/** Une proposition demandée à l'agent : en cours, prête à relire, ou en échec. */
type ProposalState =
  | { phase: "running"; label: string }
  | { phase: "ready"; label: string; proposal: AiProposal; diff: SnapshotDiff }
  | { phase: "error"; label: string; message: string; errors: string[] };

const SEVERITY_DOT: Record<AiSeverity, string> = {
  CRITICAL: "bg-danger",
  RECOMMENDED: "bg-warn-fill",
  OPTIMIZATION: "bg-ok-fill",
};

const KIND_LABEL: Record<ChangeKind, { plural: string; dot: string }> = {
  added: { plural: "Ajoutés", dot: "bg-ok-fill" },
  removed: { plural: "Supprimés", dot: "bg-danger" },
  modified: { plural: "Modifiés", dot: "bg-warn-fill" },
};

function Dot({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn("inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full", className)} />;
}

function errorsOf(error: unknown): string[] {
  return error instanceof ApiError ? error.errors : [];
}

/** Liste des erreurs détaillées du validateur (502 : proposition refusée). */
function Details({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-2">
      {lines.slice(0, 8).map((line) => (
        <li key={line}>{line}</li>
      ))}
      {lines.length > 8 && <li>… et {lines.length - 8} autres.</li>}
    </ul>
  );
}

function DiffLists({ diff }: { diff: SnapshotDiff }) {
  const sections: { kind: ChangeKind; changes: SnapshotDiff["nodes"] }[] = [
    { kind: "added", changes: diff.nodes.filter((n) => n.kind === "added") },
    { kind: "removed", changes: diff.nodes.filter((n) => n.kind === "removed") },
    { kind: "modified", changes: diff.nodes.filter((n) => n.kind === "modified") },
  ];
  return (
    <div className="space-y-4">
      {sections.map(({ kind, changes }) =>
        changes.length === 0 ? null : (
          <section key={kind}>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Dot className={KIND_LABEL[kind].dot} />
              Blocs {KIND_LABEL[kind].plural.toLowerCase()} ({changes.length})
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
        ),
      )}

      {diff.edges.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-sm font-semibold text-ink">Liens ({diff.edges.length})</h4>
          <ul className="space-y-1 text-xs text-ink-2">
            {diff.edges.map((edge) => (
              <li key={edge.id} className="flex flex-wrap items-center gap-1.5">
                <Dot className={KIND_LABEL[edge.kind].dot} />
                <span>
                  {edge.from} → {edge.to}
                  {edge.details.length > 0 ? ` (${edge.details.join(" ; ")})` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Onglet « Analyse IA » : l'audit consultatif de l'architecture (`POST /ai/audit`), et les propositions de
 * l'agent (`/ai/complete`, `/ai/sketch`) relues en différences avant d'être écrites dans le canvas partagé.
 *
 * Deux règles tiennent tout l'écran : rien n'est inventé (pas de score, pas de gain chiffré, aucune remarque
 * fabriquée quand l'appel échoue — l'erreur est affichée telle qu'elle est) et rien n'est écrit sans
 * acceptation explicite (le serveur ne modifie jamais le canvas ; une version de retour est enregistrée avant
 * d'appliquer une proposition).
 */
export function AiPanel({ canvasId, live, canWrite, projectName, nodes, edges, setNodes, setEdges }: AiPanelProps) {
  // Mode démonstration du front : un exemple figé, jamais présenté comme une analyse.
  const demo = !live;
  const [audit, setAudit] = useState<AuditState>(() => (demo ? { phase: "done", result: demoAuditResult() } : { phase: "idle" }));
  const [proposal, setProposal] = useState<ProposalState | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sketchOpen, setSketchOpen] = useState(false);
  const [brief, setBrief] = useState("");
  // Numéro de la demande en cours : une réponse arrivée après la fermeture du panneau ne le réouvre pas.
  const askRef = useRef(0);

  const closeProposal = () => {
    askRef.current += 1;
    setProposal(null);
  };

  const titleOf = (nodeId: string | null) => (nodeId ? (nodes.find((node) => node.id === nodeId)?.title ?? nodeId) : "");
  const canAsk = Boolean(canvasId) && live;

  const runAudit = async () => {
    if (!canvasId) return;
    setAudit({ phase: "running" });
    setNotice(null);
    try {
      setAudit({ phase: "done", result: await auditCanvas(canvasId) });
    } catch (error) {
      setAudit({ phase: "error", message: aiErrorMessage(error), errors: errorsOf(error) });
    }
  };

  /**
   * Demande une proposition. L'instantané courant est lu d'abord (il sert de point de comparaison) : si cette
   * lecture échoue, aucun appel payant n'est lancé.
   */
  const ask = async (label: string, request: (id: string) => Promise<AiProposal>) => {
    if (!canvasId) return;
    askRef.current += 1;
    const token = askRef.current;
    setProposal({ phase: "running", label });
    setApplyError(null);
    setNotice(null);
    try {
      const before = await canvasSnapshot(canvasId);
      const received = await request(canvasId);
      if (askRef.current !== token) return;
      setProposal({ phase: "ready", label, proposal: received, diff: diffSnapshots(before, received.canvas) });
    } catch (error) {
      if (askRef.current !== token) return;
      setProposal({ phase: "error", label, message: aiErrorMessage(error), errors: errorsOf(error) });
    }
  };

  const requestCorrection = (finding: AiFinding) => {
    if (!finding.targetNodeId) return;
    const target = finding.targetNodeId;
    return ask(`Correction proposée pour « ${titleOf(target)} »`, (id) =>
      completeCanvas(id, { nodeIds: [target], instruction: correctionInstruction(finding) }),
    );
  };

  const requestSketch = async () => {
    const text = brief.trim();
    if (!text) return;
    setSketchOpen(false);
    await ask("Esquisse proposée", (id) => sketchCanvas(id, text));
  };

  /** Écrit la proposition dans le canvas partagé, après une version de retour. Rien n'est écrit sans elle. */
  const apply = async (state: Extract<ProposalState, { phase: "ready" }>) => {
    if (!canvasId || !canWrite || !state.proposal.canvas) return;
    setApplying(true);
    setApplyError(null);
    try {
      await saveVersion(canvasId, backupVersionName(new Date()), "État du canvas avant l'application d'une proposition de l'IA.");
    } catch (error) {
      setApplying(false);
      setApplyError(`La version de retour n'a pas pu être enregistrée (${aiErrorMessage(error)}) : rien n'a été modifié.`);
      return;
    }
    const next = graphFromSnapshot(state.proposal.canvas, nodes);
    setNodes(next.nodes);
    setEdges(next.edges);
    setApplying(false);
    closeProposal();
    setNotice("Proposition appliquée au canvas partagé. La version de retour enregistrée juste avant est dans l'onglet « Versions ».");
  };

  const findings = audit.phase === "done" ? sortFindings(audit.result.findings) : [];
  const discarded = audit.phase === "done" ? discardedNotice(audit.result.discarded) : null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-edge bg-surface p-5">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-bold text-ink">Analyse de l&apos;architecture</h2>
            <p className="mt-0.5 text-xs text-ink-3">
              {nodes.length} bloc{nodes.length > 1 ? "s" : ""} et {edges.length} lien{edges.length > 1 ? "s" : ""} dans {projectName}.
              Les remarques sont consultatives : rien n&apos;est modifié sans votre accord.
            </p>
          </div>
          {canAsk && (
            <div className="flex flex-wrap items-center gap-2">
              {canWrite && (
                <Button variant="secondary" size="sm" onClick={() => setSketchOpen(true)} disabled={audit.phase === "running"}>
                  <Sparkle size={14} />
                  Esquisser avec l&apos;IA
                </Button>
              )}
              <Button size="sm" onClick={() => void runAudit()} disabled={audit.phase === "running"}>
                {audit.phase === "running" ? <Cpu size={14} /> : <ArrowsClockwise size={14} />}
                {audit.phase === "running" ? "Analyse en cours…" : audit.phase === "idle" ? "Lancer l'analyse" : "Relancer l'analyse"}
              </Button>
            </div>
          )}
        </div>

        {demo && (
          <p role="note" className="mt-4 rounded-lg border border-edge-strong bg-sunken px-3 py-2 text-sm text-ink-2">
            Démonstration : les remarques ci-dessous sont un exemple figé. Aucune analyse n&apos;a été demandée à un agent et rien
            ne décrit votre architecture.
          </p>
        )}

        {live && !canvasId && (
          <p role="status" className="mt-4 rounded-lg bg-sunken px-3 py-2 text-sm text-ink-3">
            Connexion au canvas du projet en cours… L&apos;analyse sera possible dès qu&apos;il est ouvert.
          </p>
        )}

        {audit.phase === "idle" && canAsk && (
          <p className="mt-4 rounded-lg bg-sunken px-3 py-2 text-sm text-ink-2">
            L&apos;analyse interroge l&apos;agent IA sur l&apos;état courant du canvas. Chaque appel compte dans votre quota
            journalier.
          </p>
        )}

        {audit.phase === "running" && (
          <p role="status" className="mt-4 rounded-lg bg-sunken px-3 py-2 text-sm text-ink-2">
            L&apos;agent analyse l&apos;architecture…
          </p>
        )}

        {audit.phase === "error" && (
          <div role="alert" className="mt-4 rounded-lg border border-danger bg-surface px-3 py-2.5 text-sm text-ink">
            <p className="font-medium text-danger">L&apos;analyse n&apos;a pas abouti</p>
            <p className="mt-0.5 text-ink-2">{audit.message}</p>
            <Details lines={audit.errors} />
          </div>
        )}

        {audit.phase === "done" && (
          <div className="mt-4 space-y-2">
            {audit.result.demo && !demo && (
              <p role="note" className="rounded-lg border border-edge-strong bg-sunken px-3 py-2 text-sm text-ink-2">
                Réponse de démonstration : le serveur a répondu par un exemple figé, ce n&apos;est pas l&apos;analyse d&apos;un agent.
              </p>
            )}
            <p className="text-sm font-medium text-ink">{findingsSummary(findings)}</p>
            {discarded && <p className="text-xs text-ink-3">{discarded}</p>}
          </div>
        )}
      </section>

      {notice && (
        <p role="status" className="rounded-xl border border-edge bg-surface px-4 py-3 text-sm text-ink">
          {notice}
        </p>
      )}

      {audit.phase === "done" && findings.length === 0 && (
        <div className="rounded-xl border border-dashed border-edge-strong bg-surface p-8 text-center">
          <h3 className="text-sm font-semibold text-ink">Aucune remarque</h3>
          <p className="mt-1 text-sm text-ink-3">L&apos;agent n&apos;a rien signalé sur cette architecture.</p>
        </div>
      )}

      {findings.map((finding) => (
        <article key={finding.id} className="rounded-xl border border-edge bg-surface p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div className="max-w-3xl space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="flex items-center gap-1.5 font-semibold uppercase text-ink-2">
                  <Dot className={finding.severity ? SEVERITY_DOT[finding.severity] : "bg-strong"} />
                  {severityLabel(finding.severity)}
                </span>
                <span className="text-ink-3">{categoryLabel(finding.category)}</span>
                {finding.targetNodeId && (
                  <>
                    <span className="text-ink-4">·</span>
                    <span className="text-ink-3">Bloc {titleOf(finding.targetNodeId)}</span>
                  </>
                )}
              </div>

              <h3 className="text-sm font-bold text-ink">{finding.title || "Remarque sans titre"}</h3>
              {finding.rationale && <p className="text-xs leading-relaxed text-ink-2">{finding.rationale}</p>}

              {(finding.currentConfig || finding.proposedConfig) && (
                <div className="grid grid-cols-1 gap-2.5 pt-1 text-xs sm:grid-cols-2">
                  {finding.currentConfig && (
                    <div className="rounded-lg border border-edge bg-sunken p-2.5 text-ink-2">
                      <span className="mb-0.5 block text-[11px] text-ink-4">Actuel</span>
                      {finding.currentConfig}
                    </div>
                  )}
                  {finding.proposedConfig && (
                    <div className="rounded-lg border border-edge bg-sunken p-2.5 font-medium text-ink">
                      <span className="mb-0.5 block text-[11px] text-ink-4">Proposition</span>
                      {finding.proposedConfig}
                    </div>
                  )}
                </div>
              )}
            </div>

            {canAsk && canWrite && finding.targetNodeId && (
              <Button
                variant="secondary"
                size="sm"
                className="flex-shrink-0"
                disabled={proposal?.phase === "running"}
                onClick={() => void requestCorrection(finding)}
              >
                <GitDiff size={14} />
                Demander une correction
              </Button>
            )}
          </div>
        </article>
      ))}

      {findings.length > 0 && canAsk && !canWrite && (
        <p className="text-xs text-ink-3">
          Votre rôle (lecture seule) ne permet pas de demander une correction ni de modifier le canvas.
        </p>
      )}

      {/* Cahier des charges de l'esquisse */}
      <Modal open={sketchOpen} onClose={() => setSketchOpen(false)} title="Esquisser avec l'IA">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void requestSketch();
          }}
        >
          <p className="text-sm text-ink-2">
            Décrivez l&apos;application à concevoir. L&apos;agent proposera une architecture complète ; vous la relirez en
            différences avant qu&apos;elle ne remplace le canvas.
          </p>
          <div>
            <label htmlFor="ai-brief" className="mb-1 block text-sm font-medium text-ink">
              Cahier des charges
            </label>
            <textarea
              id="ai-brief"
              rows={8}
              maxLength={MAX_BRIEF}
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="Une boutique en ligne avec paiement mobile, un espace vendeur et des notifications…"
              className={textareaClass}
            />
            <p className="mt-1 text-right text-xs text-ink-3">
              {brief.length} / {MAX_BRIEF}
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-edge-soft pt-4">
            <Button variant="secondary" onClick={() => setSketchOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!brief.trim()}>
              <Sparkle size={15} />
              Demander une esquisse
            </Button>
          </div>
        </form>
      </Modal>

      {/* Relecture d'une proposition : différences, avertissements, puis acceptation explicite */}
      <Modal open={proposal !== null} onClose={closeProposal} title={proposal?.label ?? "Proposition de l'IA"} size="lg">
        <div className="space-y-4">
          {proposal?.phase === "running" && (
            <p role="status" className="rounded-lg bg-sunken px-3 py-6 text-center text-sm text-ink-3">
              L&apos;agent prépare une proposition…
            </p>
          )}

          {proposal?.phase === "error" && (
            <div role="alert" className="rounded-lg border border-danger bg-surface px-3 py-2.5 text-sm text-ink">
              <p className="font-medium text-danger">Aucune proposition</p>
              <p className="mt-0.5 text-ink-2">{proposal.message}</p>
              <Details lines={proposal.errors} />
            </div>
          )}

          {proposal?.phase === "ready" && (
            <>
              {proposal.proposal.demo && (
                <p role="note" className="rounded-lg border border-edge-strong bg-sunken px-3 py-2 text-sm text-ink-2">
                  Réponse de démonstration : cette proposition est un exemple figé du serveur, ce n&apos;est pas celle d&apos;un agent.
                </p>
              )}

              {proposal.proposal.summary && <p className="text-sm text-ink-2">{proposal.proposal.summary}</p>}

              {proposal.proposal.warnings && proposal.proposal.warnings.length > 0 && (
                <div role="alert" className="rounded-lg border border-danger bg-surface px-3 py-2.5 text-sm text-ink">
                  <p className="flex items-center gap-1.5 font-medium text-danger">
                    <WarningCircle size={16} weight="fill" />
                    Cette proposition fait disparaître des éléments
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs text-ink-2">
                    {proposal.proposal.warnings.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              <ul aria-label="Légende" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
                {(["added", "removed", "modified"] as ChangeKind[]).map((kind) => (
                  <li key={kind} className="flex items-center gap-1.5">
                    <Dot className={KIND_LABEL[kind].dot} />
                    {KIND_LABEL[kind].plural}{" "}
                    <span className="font-mono text-xs text-ink-3">
                      {kind === "added" ? proposal.diff.counts.added : kind === "removed" ? proposal.diff.counts.removed : proposal.diff.counts.modified}
                    </span>
                  </li>
                ))}
              </ul>

              {proposal.diff.identical ? (
                <p role="status" className="rounded-lg bg-sunken px-3 py-3 text-sm text-ink-2">
                  La proposition ne change rien au canvas actuel.
                </p>
              ) : (
                <DiffLists diff={proposal.diff} />
              )}

              {applyError && (
                <p role="alert" className="rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger">
                  {applyError}
                </p>
              )}

              {!canWrite && (
                <p className="rounded-lg bg-sunken px-3 py-2 text-sm text-ink-2">
                  Votre rôle ne permet pas de modifier le canvas : cette proposition reste consultative.
                </p>
              )}
            </>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-edge-soft pt-4">
            <Button variant="secondary" onClick={closeProposal}>
              {proposal?.phase === "ready" ? "Ne pas appliquer" : "Fermer"}
            </Button>
            {proposal?.phase === "ready" && canWrite && !proposal.diff.identical && (
              <Button disabled={applying} onClick={() => void apply(proposal)}>
                {applying ? "Application…" : "Appliquer au canvas"}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
