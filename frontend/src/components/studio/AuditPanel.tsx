"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { PENALTY, RULE_COUNT, SEVERITIES, type Audit, type Finding, type Severity } from "@/lib/audit";
import type { ArchitectureNode } from "@/lib/lonkoo-data";

const SEVERITY_TEXT: Record<Severity, string> = {
  critique: "text-danger",
  important: "text-warn",
  mineur: "text-ink-3",
};

interface AuditPanelProps {
  audit: Audit;
  nodes: readonly ArchitectureNode[];
  edgeCount: number;
  /** Faux en lecture seule : la correction automatique modifierait le canvas. */
  canFix: boolean;
  onShow: (nodeId: string) => void;
  onFix: (finding: Finding) => void;
}

/** Audit par règles : le score et les constats viennent du schéma dessiné, jamais d'une IA. */
export function AuditPanel({ audit, nodes, edgeCount, canFix, onShow, onFix }: AuditPanelProps) {
  const titles = new Map(nodes.map((node) => [node.id, node.title || node.id]));

  return (
    <section aria-label="Audit par règles" className="space-y-4">
      <div className="bg-surface rounded-xl p-5 border border-edge flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-ink">Audit par règles</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            {nodes.length} blocs et {edgeCount} liens lus. Le même schéma donne toujours le même score.
          </p>
          <p className="text-xs text-ink-3 mt-0.5">
            100 moins {PENALTY.critique} par constat critique, {PENALTY.important} par important, {PENALTY.mineur} par mineur.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-sunken px-4 py-2.5 rounded-lg border border-edge">
          <div>
            <div className="text-[11px] text-ink-3">Score</div>
            <div data-audit-score aria-live="polite" className="text-xl font-bold font-mono text-ink">
              {audit.score === null ? "—" : `${audit.score}/100`}
            </div>
          </div>
          <div className="h-7 w-px bg-strong" />
          <dl className="flex gap-4">
            {SEVERITIES.map((severity) => (
              <div key={severity}>
                <dt className="text-[11px] text-ink-3">{severity}</dt>
                <dd className={cn("text-sm font-bold font-mono", audit.counts[severity] > 0 ? SEVERITY_TEXT[severity] : "text-ink-4")}>
                  {audit.counts[severity]}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="bg-surface rounded-xl p-5 border border-edge text-xs text-ink-3">Le canvas est vide : il n&apos;y a rien à auditer.</div>
      ) : audit.findings.length === 0 ? (
        <div className="bg-surface rounded-xl p-5 border border-edge flex items-center gap-2 text-xs text-ink-2">
          <CheckCircle size={16} weight="fill" className="text-ok" />
          <span>Aucun constat : les {RULE_COUNT} règles sont respectées.</span>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {audit.findings.map((finding, index) => (
            <li
              key={`${finding.rule}-${finding.nodeIds.join("-")}-${index}`}
              data-rule={finding.rule}
              className="bg-surface rounded-xl p-5 border border-edge"
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2 max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={cn("font-mono uppercase text-[11px] px-2 py-0.5 rounded bg-subtle font-semibold", SEVERITY_TEXT[finding.severity])}>
                      {finding.severity}
                    </span>
                    <span className="font-mono text-ink-3">−{PENALTY[finding.severity]}</span>
                  </div>

                  <h3 className="text-sm font-bold text-ink">{finding.title}</h3>
                  <p className="text-xs text-ink-2 leading-relaxed">{finding.detail}</p>
                  <p className="text-xs text-ink">
                    <span className="text-ink-3">Correction : </span>
                    {finding.fix}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs">
                    <span className="text-ink-3">{finding.nodeIds.length > 1 ? "Blocs :" : "Bloc :"}</span>
                    {finding.nodeIds.map((nodeId) => (
                      <button
                        key={nodeId}
                        type="button"
                        onClick={() => onShow(nodeId)}
                        className="text-accent hover:underline cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand rounded"
                      >
                        {titles.get(nodeId) ?? nodeId}
                      </button>
                    ))}
                  </div>
                </div>

                {finding.autofix && canFix ? (
                  <div className="flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => onFix(finding)}
                      className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-hover text-inverse-ink text-xs font-medium transition-colors cursor-pointer"
                    >
                      Passer à {finding.autofix.replicas} répliques
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
