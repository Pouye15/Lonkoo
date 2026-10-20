"use client";

import React, { useState } from "react";
import { AppShell } from "@/components/layout/AppSidebar";
import {
  ARCHITECTURE_VERSIONS,
  CORE_STUDIO_NODES,
  WORKSPACE_PROJECTS,
  type ArchitectureVersion,
} from "@/lib/lonkoo-data";
import {
  PlugsConnected,
  Copy,
  CheckCircle,
  GithubLogo,
  Tag,
  GitBranch,
  RocketLaunch,
  Cube,
  ArrowsClockwise,
} from "@phosphor-icons/react";

const AI_AGENT_MODELS = [
  {
    id: "claude-code",
    name: "Claude Code",
    modelId: "claude-3-7-sonnet",
  },
  {
    id: "antigravity-gemini",
    name: "Antigravity / Gemini",
    modelId: "gemini-2.5-pro",
  },
  {
    id: "cursor-agent",
    name: "Cursor Composer",
    modelId: "gpt-4o-architecture",
  },
] as const;

export default function ImplementationBridgePage() {
  const [selectedProject, setSelectedProject] = useState(WORKSPACE_PROJECTS[0]!);
  const [selectedAgent, setSelectedAgent] = useState<(typeof AI_AGENT_MODELS)[number]>(
    AI_AGENT_MODELS[0]
  );
  const [copiedMcp, setCopiedMcp] = useState(false);
  const [orionSyncState, setOrionSyncState] = useState<"idle" | "syncing" | "done">("idle");
  const [versions, setVersions] = useState<ArchitectureVersion[]>(ARCHITECTURE_VERSIONS);
  const [newReleaseTag, setNewReleaseTag] = useState("v2.5.0");
  const [newReleaseNotes, setNewReleaseNotes] = useState("");

  const mcpConfigJson = JSON.stringify(
    {
      mcpServers: {
        "lonkoo-architecture": {
          url: `https://mcp.lonkoo.dev/v1/projects/${selectedProject.name}/sse`,
          headers: {
            Authorization: "Bearer lko_live_98a4f2c1e0b7d3",
            "X-Architecture-Tag": versions[0]?.versionTag ?? selectedProject.gitTag,
            "X-Target-Model": selectedAgent.modelId,
          },
          exposedResources: [
            `architecture://${selectedProject.name}/topology`,
            `architecture://${selectedProject.name}/stack-versions`,
            `architecture://${selectedProject.name}/adr-documentation`,
          ],
        },
      },
    },
    null,
    2
  );

  const handleCopyMcp = () => {
    navigator.clipboard?.writeText(mcpConfigJson);
    setCopiedMcp(true);
    setTimeout(() => setCopiedMcp(false), 2000);
  };

  const handleOrionLaunch = () => {
    setOrionSyncState("syncing");
    setTimeout(() => {
      setOrionSyncState("done");
    }, 500);
  };

  const handleBindGitRelease = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReleaseTag.trim()) return;
    const created: ArchitectureVersion = {
      id: `rel-${Date.now()}`,
      versionTag: newReleaseTag.trim(),
      gitCommit: Math.random().toString(16).slice(2, 9),
      gitReleaseUrl: `https://github.com/${selectedProject.githubRepo}/releases/tag/${newReleaseTag.trim()}`,
      branch: selectedProject.branch,
      title:
        newReleaseNotes.trim() ||
        `Synchronisation de ${selectedProject.name} avec la release ${newReleaseTag.trim()}`,
      author: "Aminata S.",
      createdAt: "À l'instant",
      changesSummary: ["Contrat MCP mis à jour", "Blueprint Orion aligné"],
      stackDelta: `${CORE_STUDIO_NODES.length} composants`,
      isCurrent: true,
    };
    setVersions((prev) => [
      created,
      ...prev.map((v) => ({ ...v, isCurrent: false })),
    ]);
    setNewReleaseNotes("");
  };

  return (
    <AppShell
      title="Déploiement & MCP"
      actions={
        <select
          value={selectedProject.id}
          onChange={(e) => {
            const found = WORKSPACE_PROJECTS.find((p) => p.id === e.target.value);
            if (found) setSelectedProject(found);
          }}
          aria-label="Choisir le projet"
          className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono font-semibold text-slate-900"
        >
          {WORKSPACE_PROJECTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.gitTag})
            </option>
          ))}
        </select>
      }
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Serveur MCP */}
          <div className="lg:col-span-7 bg-white rounded-xl p-5 border border-slate-200 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center">
                    <PlugsConnected size={17} weight="bold" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-950">
                      Serveur MCP (Model Context Protocol)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Exposez la topologie à vos agents de génération de code.
                    </p>
                  </div>
                </div>
                <span className="flex items-center gap-1.5 text-xs font-mono text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Actif
                </span>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-700 mb-2">
                  Agent cible :
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  {AI_AGENT_MODELS.map((agent) => {
                    const active = selectedAgent.id === agent.id;
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => setSelectedAgent(agent)}
                        className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                          active
                            ? "bg-slate-50 border-2 border-[#1265DD]"
                            : "bg-white border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <div className="font-bold text-slate-950">{agent.name}</div>
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                          {agent.modelId}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-1.5">
                  <span>Configuration MCP :</span>
                  <button
                    type="button"
                    onClick={handleCopyMcp}
                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-mono text-[11px] flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedMcp ? (
                      <>
                        <CheckCircle size={13} weight="fill" className="text-emerald-600" />
                        <span>Copié</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        <span>Copier</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3.5 rounded-lg bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto leading-relaxed">
                  {mcpConfigJson}
                </pre>
              </div>
            </div>
          </div>

          {/* Constructeur Orion */}
          <div className="lg:col-span-5 bg-white rounded-xl p-5 border border-slate-200 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center">
                    <RocketLaunch size={17} weight="bold" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-950">
                      Constructeur Orion
                    </h2>
                    <p className="text-xs text-slate-500">
                      Synchronisation directe avec Orion Site Builder.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="font-medium text-slate-700">
                  Composants synchronisés :
                </div>
                {CORE_STUDIO_NODES.slice(0, 4).map((node) => (
                  <div
                    key={node.id}
                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Cube size={14} className="text-slate-600" />
                      <span className="font-medium text-slate-900">{node.title}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {node.tech}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              {orionSyncState === "done" && (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-xs flex items-center gap-2 font-medium">
                  <CheckCircle size={15} weight="fill" className="text-emerald-600" />
                  <span>Modèle transmis à Orion.</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleOrionLaunch}
                className="w-full py-2.5 rounded-lg bg-[#1265DD] hover:bg-blue-700 text-white text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {orionSyncState === "syncing" ? (
                  <>
                    <ArrowsClockwise size={15} className="animate-spin" />
                    <span>Synchronisation...</span>
                  </>
                ) : (
                  <>
                    <RocketLaunch size={15} weight="fill" />
                    <span>Envoyer vers Orion</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Liaison Releases GitHub */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                <GithubLogo size={17} weight="fill" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-950">
                  Releases &amp; Tags GitHub — {selectedProject.githubRepo}
                </h2>
                <p className="text-xs text-slate-500">
                  Historique des versions d&apos;architecture liées aux tags Git.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
              <GitBranch size={13} />
              <span>{selectedProject.branch}</span>
              <span>·</span>
              <Tag size={13} />
              <span className="font-semibold text-slate-900">{versions[0]?.versionTag}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 space-y-2.5">
              {versions.map((ver) => (
                <div
                  key={ver.id}
                  className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-900 font-mono text-xs font-bold">
                        {ver.versionTag}
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        {ver.gitCommit}
                      </span>
                      {ver.isCurrent && (
                        <span className="text-[11px] font-medium text-[#1265DD]">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-slate-900 mt-1">{ver.title}</div>
                  </div>

                  <span className="text-[11px] font-mono text-slate-500">
                    {ver.createdAt}
                  </span>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleBindGitRelease}
              className="lg:col-span-4 p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3 text-xs"
            >
              <div className="font-bold text-slate-950">
                Associer un tag Git
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Tag GitHub
                </label>
                <input
                  type="text"
                  required
                  value={newReleaseTag}
                  onChange={(e) => setNewReleaseTag(e.target.value)}
                  placeholder="v2.5.0"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-900 font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Notes de version
                </label>
                <textarea
                  rows={2}
                  value={newReleaseNotes}
                  onChange={(e) => setNewReleaseNotes(e.target.value)}
                  placeholder="Changements associés..."
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-900"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-[#1265DD] hover:bg-blue-700 text-white font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Tag size={13} weight="bold" />
                <span>Lier la release</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
