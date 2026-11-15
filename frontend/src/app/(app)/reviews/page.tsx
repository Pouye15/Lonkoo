"use client";

import React, { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { ProjectDiscussion } from "@/components/team/ProjectDiscussion";
import { IS_LIVE_API } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import {
  ARCHITECTURE_REVIEWS,
  TEAM_CHANNELS,
  TEAM_MESSAGES,
  type ArchitectureReviewPR,
  type TeamChatMessage,
} from "@/lib/lonkoo-data";
import {
  GitPullRequest,
  GitMerge,
  GitBranch,
  Tag,
  CheckCircle,
  WarningCircle,
  PaperPlaneRight,
  Hash,
  PlusCircle,
  ArrowsLeftRight,
} from "@phosphor-icons/react";

export default function ArchitectureReviewsAndChatPage() {
  const { activeProject, status: workspaceStatus } = useWorkspace();
  const [prs, setPrs] = useState<ArchitectureReviewPR[]>(ARCHITECTURE_REVIEWS);
  const [selectedPrId, setSelectedPrId] = useState<string>(
    ARCHITECTURE_REVIEWS[0]?.id ?? "pr-42"
  );

  const [activeChannel, setActiveChannel] = useState<string>("architecture-core");
  const [messages, setMessages] = useState<TeamChatMessage[]>(TEAM_MESSAGES);
  const [chatInput, setChatInput] = useState<string>("");

  const selectedPr = prs.find((p) => p.id === selectedPrId) ?? prs[0]!;

  const handleUpdatePrStatus = (newStatus: ArchitectureReviewPR["status"]) => {
    setPrs((prev) =>
      prev.map((p) => (p.id === selectedPr.id ? { ...p, status: newStatus } : p))
    );
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg: TeamChatMessage = {
      id: `m-${Date.now()}`,
      channelId: activeChannel,
      author: "Aminata S.",
      initials: "AS",
      role: "Lead Architect",
      time: "À l'instant",
      text: chatInput.trim(),
      linkedVersion: selectedPr.gitTagTarget,
    };
    setMessages((prev) => [...prev, msg]);
    setChatInput("");
  };

  const channelMessages = messages.filter((m) => m.channelId === activeChannel);

  return (
    <>
      <PageHeader title="Revues" />
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* COLONNE GAUCHE : REVUES D'ARCHITECTURE */}
        <div className="lg:col-span-7 space-y-4">
          <DemoNotice>
            {IS_LIVE_API
              ? "ces propositions de modification sont des exemples fictifs : « Fusionner » ne change aucun projet. La discussion d'équipe, à côté, est réelle."
              : "ces propositions de modification sont des exemples fictifs : « Fusionner » ne change aucun projet."}
          </DemoNotice>
          <div className="bg-surface rounded-xl p-4 border border-edge space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-edge-soft">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <GitPullRequest size={15} className="text-ink-2" weight="bold" />
                <span>Propositions ({prs.length})</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {prs.map((pr) => {
                const active = pr.id === selectedPr.id;
                return (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => setSelectedPrId(pr.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                      active
                        ? "bg-sunken border-2 border-accent"
                        : "bg-surface border-edge hover:bg-sunken"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-accent">
                          #{pr.number}
                        </span>
                        <span className="font-semibold text-ink truncate">
                          {pr.title}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-ink-4 mt-0.5 flex items-center gap-2">
                        <span>{pr.project}</span>
                        <span>·</span>
                        <span>
                          {pr.sourceBranch} → {pr.targetBranch}
                        </span>
                      </div>
                    </div>

                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-subtle text-ink-2 font-medium flex-shrink-0">
                      {pr.status === "merged"
                        ? "Fusionnée"
                        : pr.status === "approved"
                        ? "Approuvée"
                        : pr.status === "changes_requested"
                        ? "Modifications"
                        : "Ouverte"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Détail de la proposition */}
          <div className="bg-surface rounded-xl p-5 border border-edge space-y-5">
            <div className="pb-4 border-b border-edge-soft">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs font-mono">
                <div className="flex items-center gap-2 text-ink-2">
                  <span className="font-bold text-ink">#{selectedPr.number}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <GitBranch size={13} className="text-ink-4" />
                    {selectedPr.sourceBranch} → {selectedPr.targetBranch}
                  </span>
                </div>

                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-subtle text-ink-2 font-semibold">
                  <Tag size={12} />
                  {selectedPr.gitTagTarget}
                </span>
              </div>

              <h2 className="text-base font-bold text-ink">{selectedPr.title}</h2>
              <p className="text-xs text-ink-2 mt-1 leading-relaxed">
                {selectedPr.summary}
              </p>
            </div>

            {/* Vérification */}
            <div className="p-3 rounded-lg bg-sunken border border-edge flex items-start gap-2.5 text-xs">
              <CheckCircle
                size={16}
                weight="fill"
                className="text-ok flex-shrink-0 mt-0.5"
              />
              <div>
                <div className="font-semibold text-ink">Vérification de cohérence</div>
                <p className="text-[11px] text-ink-2 mt-0.5">{selectedPr.aiSummary}</p>
              </div>
            </div>

            {/* Différentiel */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-ink">
                Changements ({selectedPr.diffs.length})
              </div>
              {selectedPr.diffs.map((d, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-sunken border border-edge text-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-bold text-ink flex items-center gap-1.5">
                      {d.type === "added" ? (
                        <PlusCircle size={14} weight="fill" className="text-ok" />
                      ) : (
                        <ArrowsLeftRight size={14} weight="bold" className="text-accent" />
                      )}
                      {d.component}
                    </span>
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-surface border border-edge text-ink-2">
                      {d.type === "added" ? "Ajout" : "Modification"}
                    </span>
                  </div>

                  <div className="font-mono text-[11px] space-y-0.5 mt-1">
                    {d.before && (
                      <div className="text-ink-4 line-through">- {d.before}</div>
                    )}
                    <div className="text-ink font-semibold">+ {d.after}</div>
                  </div>
                  <p className="text-[11px] text-ink-3 mt-1">{d.detail}</p>
                </div>
              ))}
            </div>

            {/* Approbations de l'équipe */}
            <div className="space-y-2 pt-1">
              <div className="text-xs font-bold text-ink">
                Approbations de l&apos;équipe
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {selectedPr.reviewers.map((rev) => (
                  <div
                    key={rev.name}
                    className="p-2.5 rounded-lg bg-sunken border border-edge text-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-ink">{rev.name}</span>
                      <span className="text-[11px] font-mono text-ink-3">
                        {rev.verdict === "approved" ? "Approuvé" : "En attente"}
                      </span>
                    </div>
                    {rev.comment && (
                      <p className="text-[11px] text-ink-3 leading-snug">{rev.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Décision */}
            <div className="pt-3.5 border-t border-edge-soft flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdatePrStatus("approved")}
                  className="px-3 py-1.5 rounded-lg bg-surface hover:bg-sunken text-ink-2 border border-edge text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle size={14} weight="fill" className="text-ok" />
                  <span>Approuver</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdatePrStatus("changes_requested")}
                  className="px-3 py-1.5 rounded-lg bg-surface hover:bg-sunken text-ink-2 border border-edge text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <WarningCircle size={14} weight="fill" className="text-warn" />
                  <span>Demander des modifications</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleUpdatePrStatus("merged")}
                className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <GitMerge size={15} weight="bold" />
                <span>Fusionner ({selectedPr.gitTagTarget})</span>
              </button>
            </div>
          </div>
        </div>

        {/* COLONNE DROITE : DISCUSSION D'ÉQUIPE */}
        {/* Mode API : la vraie discussion du projet actif, réservée à ses membres, jamais les messages fictifs.
            Mode simulé : la démonstration. */}
        {IS_LIVE_API ? (
          activeProject && !activeProject.visitor ? (
            <ProjectDiscussion key={activeProject.id} projectId={activeProject.id} />
          ) : (
            <div className="order-first flex h-[660px] items-center justify-center rounded-xl border border-edge bg-surface p-6 text-center text-xs text-ink-3 lg:order-none lg:col-span-5">
              {activeProject
                ? "La discussion est réservée aux membres du projet."
                : workspaceStatus === "loading" || workspaceStatus === "idle"
                  ? "Chargement…"
                  : "Ouvrez ou créez un projet pour discuter avec son équipe."}
            </div>
          )
        ) : (
        <div className="lg:col-span-5 bg-surface rounded-xl border border-edge flex flex-col h-[660px] overflow-hidden">
          <div className="p-3.5 border-b border-edge bg-surface">
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-xs font-bold text-ink">
                Discussion d&apos;équipe
              </h2>
              <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
                <span className="w-1.5 h-1.5 rounded-full bg-ok-fill" />
                4 membres actifs
              </span>
            </div>

            <div className="flex items-center gap-1 bg-subtle p-1 rounded-lg overflow-x-auto">
              {TEAM_CHANNELS.map((ch) => {
                const active = activeChannel === ch.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setActiveChannel(ch.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? "bg-surface text-ink shadow-2xs"
                        : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    <Hash size={12} />
                    <span>{ch.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 p-3.5 overflow-y-auto space-y-2.5 bg-sunken">
            {channelMessages.map((msg) => (
              <div
                key={msg.id}
                className="p-3 rounded-lg bg-surface border border-edge space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-inverse text-inverse-ink text-[11px] font-bold flex items-center justify-center">
                      {msg.initials}
                    </span>
                    <span className="text-xs font-bold text-ink">{msg.author}</span>
                    <span className="text-[11px] text-ink-4">{msg.role}</span>
                  </div>
                  <span className="text-[11px] font-mono text-ink-4">{msg.time}</span>
                </div>

                <p className="text-xs text-ink-2 leading-relaxed">{msg.text}</p>

                {(msg.linkedNode || msg.linkedVersion) && (
                  <div className="pt-1 flex flex-wrap items-center gap-1.5">
                    {msg.linkedNode && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-subtle text-ink-2">
                        {msg.linkedNode}
                      </span>
                    )}
                    {msg.linkedVersion && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-subtle text-ink-2">
                        {msg.linkedVersion}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <form
            onSubmit={handleSendMessage}
            className="p-3 border-t border-edge bg-surface flex items-center gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={`Message dans #${activeChannel}...`}
              className="flex-1 px-3 py-2 rounded-lg bg-sunken border border-edge text-xs text-ink focus:outline-none focus:border-accent focus:bg-surface"
            />
            <button
              type="submit"
              aria-label="Envoyer"
              className="px-3.5 py-2 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <PaperPlaneRight size={14} weight="fill" />
              <span>Envoyer</span>
            </button>
          </form>
        </div>
        )}
      </div>
    </>
  );
}
