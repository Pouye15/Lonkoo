"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppSidebar";
import { ArchitectureWhiteboard } from "@/components/studio/ArchitectureWhiteboard";
import {
  CORE_STUDIO_NODES,
  STUDIO_EDGES,
  AI_SUGGESTIONS,
  ARCHITECTURE_VERSIONS,
  AI_DOC_SECTIONS,
  WORKSPACE_PROJECTS,
  PALABRE_BLUEPRINTS,
  COMMUNITY_ARCHITECTS,
  DEFAULT_PROJECT_TEAMS,
  type ArchitectureNode,
  type ArchitectureEdge,
  type ArchitectureVersion,
  type AIDocSection,
  type GitHubRole,
  type ProjectCollaborator,
  type ProjectTeamGroup,
} from "@/lib/lonkoo-data";
import {
  SlidersHorizontal,
  Cpu,
  ChartLineUp,
  FileText,
  GitCommit,
  Plus,
  CheckCircle,
  Sparkle,
  Tag,
  GitBranch,
  PlugsConnected,
  Users,
  ArrowsClockwise,
  GitPullRequest,
  GithubLogo,
  FloppyDisk,
  Trash,
  MagnifyingGlass,
  ShieldCheck,
  UserPlus,
} from "@phosphor-icons/react";

type StudioTab = "canvas" | "scanner" | "simulator" | "docs" | "versions" | "team";

export default function StudioPage() {
  const [activeTab, setActiveTab] = useState<StudioTab>("canvas");
  const [activeProjectSlug, setActiveProjectSlug] = useState<string>(
    WORKSPACE_PROJECTS[0]?.slug ?? "passerelle-paiement-uemoa"
  );

  const [nodes, setNodes] = useState<ArchitectureNode[]>(CORE_STUDIO_NODES);
  const [edges, setEdges] = useState<ArchitectureEdge[]>(STUDIO_EDGES);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("pg-primary");
  const [appliedSuggestionIds, setAppliedSuggestionIds] = useState<string[]>([]);

  const [simulatedRps, setSimulatedRps] = useState<number>(8500);

  const [docSections, setDocSections] = useState<AIDocSection[]>(AI_DOC_SECTIONS);
  const [isGeneratingDoc, setIsGeneratingDoc] = useState<boolean>(false);
  const [customDocPrompt, setCustomDocPrompt] = useState<string>("");

  const [versions, setVersions] = useState<ArchitectureVersion[]>(ARCHITECTURE_VERSIONS);
  const [newTagInput, setNewTagInput] = useState<string>("v2.5.0");
  const [newCommitTitle, setNewCommitTitle] = useState<string>("");

  // État de l'équipe du projet (Modèle GitHub Collaborators & Teams)
  const [collaborators, setCollaborators] = useState<ProjectCollaborator[]>([
    {
      id: "collab-1",
      handle: "aminata-arch",
      initials: "AS",
      name: "Aminata S.",
      role: "Owner",
      jobTitle: "Principal Systems Architect",
      color: "#1265DD",
      status: "Actif",
    },
    {
      id: "collab-2",
      handle: "koffi-dev",
      initials: "KD",
      name: "Koffi D.",
      role: "Maintainer",
      jobTitle: "Staff Backend Engineer",
      color: "#2563EB",
      status: "Actif",
    },
    {
      id: "collab-3",
      handle: "cheikh-sec",
      initials: "CT",
      name: "Dr. Cheikh Tidiane",
      role: "Write",
      jobTitle: "Chief Security Architect",
      color: "#0D9488",
      status: "Actif",
    },
  ]);
  const [teamGroups, setTeamGroups] = useState<ProjectTeamGroup[]>(DEFAULT_PROJECT_TEAMS);
  const [memberSearch, setMemberSearch] = useState<string>("");
  const [inviteRole, setInviteRole] = useState<GitHubRole>("Write");
  const [newTeamName, setNewTeamName] = useState<string>("");
  const [newTeamPerm, setNewTeamPerm] = useState<GitHubRole>("Write");
  const [requireTwoApprovals, setRequireTwoApprovals] = useState<boolean>(true);
  const [requireAiCheck, setRequireAiCheck] = useState<boolean>(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const proj = params.get("project");
    if (tab === "scanner" || tab === "nianthio") setActiveTab("scanner");
    else if (tab === "simulator") setActiveTab("simulator");
    else if (tab === "docs") setActiveTab("docs");
    else if (tab === "versions") setActiveTab("versions");
    else if (tab === "team") setActiveTab("team");
    if (proj) setActiveProjectSlug(proj);
  }, []);

  useEffect(() => {
    const foundBlueprint = PALABRE_BLUEPRINTS.find((b) => b.slug === activeProjectSlug);
    if (foundBlueprint && foundBlueprint.nodes) {
      setNodes(foundBlueprint.nodes);
      if (foundBlueprint.nodes[0]) setSelectedNodeId(foundBlueprint.nodes[0].id);
    }
  }, [activeProjectSlug]);

  const currentProject =
    WORKSPACE_PROJECTS.find((p) => p.slug === activeProjectSlug) ?? WORKSPACE_PROJECTS[0]!;

  const aiHealthScore = Math.min(100, 86 + appliedSuggestionIds.length * 5);

  const applySuggestion = (sugId: string) => {
    const sug = AI_SUGGESTIONS.find((s) => s.id === sugId);
    if (!sug || appliedSuggestionIds.includes(sugId)) return;

    setNodes((prev) =>
      prev.map((node) =>
        node.id === sug.targetNodeId
          ? {
              ...node,
              tech: sug.patch.tech ?? node.tech,
              version: sug.patch.version ?? node.version,
              replicas: sug.patch.replicas ?? node.replicas,
              status: sug.patch.status ?? node.status,
              metricValue: sug.patch.metricValue ?? node.metricValue,
              maxRpsCapacity: Math.round(node.maxRpsCapacity * 1.45),
            }
          : node
      )
    );
    setAppliedSuggestionIds((prev) => [...prev, sugId]);
    setSelectedNodeId(sug.targetNodeId);
  };

  const handleRegenerateDocs = () => {
    setIsGeneratingDoc(true);
    setTimeout(() => {
      const stackSummary = nodes
        .map((n) => (n.tech ? `${n.title} (${n.tech} ${n.version})` : n.title))
        .join(", ");
      setDocSections((prev) => [
        {
          id: `doc-auto-${Date.now()}`,
          title: `Mise à jour — Topologie (${versions[0]?.versionTag ?? "v2.4.0"})`,
          badge: "À jour",
          lastGenerated: "À l'instant",
          content: customDocPrompt.trim()
            ? `Note d'architecture (${customDocPrompt}) : L'architecture comporte ${nodes.length} composants (${stackSummary}).`
            : `Synthèse de la topologie : Le graphe contient ${nodes.length} briques actives (${stackSummary}).`,
          highlights: [
            `${nodes.length} composants présents dans le graphe`,
            `Score de cohérence évalué à ${aiHealthScore}%`,
            `Synchronisé avec le dépôt ${currentProject.githubRepo}`,
          ],
        },
        ...prev,
      ]);
      setCustomDocPrompt("");
      setIsGeneratingDoc(false);
    }, 350);
  };

  const handleCreateVersion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagInput.trim() || !newCommitTitle.trim()) return;
    const created: ArchitectureVersion = {
      id: `ver-${Date.now()}`,
      versionTag: newTagInput.trim(),
      gitCommit: Math.random().toString(16).slice(2, 9),
      gitReleaseUrl: `https://github.com/${currentProject.githubRepo}/releases/tag/${newTagInput.trim()}`,
      branch: currentProject.branch,
      title: newCommitTitle.trim(),
      author: "Aminata S.",
      createdAt: "À l'instant",
      changesSummary: [
        `Snapshot de ${nodes.length} composants`,
        `Associé au tag Git ${newTagInput.trim()}`,
      ],
      stackDelta: `${nodes.length} blocs`,
      isCurrent: true,
    };
    setVersions((prev) => [
      created,
      ...prev.map((v) => ({ ...v, isCurrent: false })),
    ]);
    setNewCommitTitle("");
  };

  // Ajouter un membre de la communauté ou par identifiant dans l'équipe du projet
  const handleAddCollaborator = (arch: (typeof COMMUNITY_ARCHITECTS)[number]) => {
    if (collaborators.some((c) => c.handle === arch.handle)) return;
    setCollaborators((prev) => [
      ...prev,
      {
        id: `collab-${Date.now()}`,
        handle: arch.handle,
        initials: arch.initials,
        name: arch.name,
        role: inviteRole,
        jobTitle: arch.role,
        color: arch.color,
        status: "Actif",
      },
    ]);
    setMemberSearch("");
  };

  const handleInviteCustomHandle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberSearch.trim()) return;
    const clean = memberSearch.trim().replace(/^@/, "");
    const found = COMMUNITY_ARCHITECTS.find(
      (a) =>
        a.handle.toLowerCase() === clean.toLowerCase() ||
        a.name.toLowerCase().includes(clean.toLowerCase())
    );
    if (found) {
      handleAddCollaborator(found);
      return;
    }
    setCollaborators((prev) => [
      ...prev,
      {
        id: `collab-${Date.now()}`,
        handle: clean.toLowerCase().replace(/[^a-z0-9-_]/g, ""),
        initials: clean.slice(0, 2).toUpperCase(),
        name: clean,
        role: inviteRole,
        jobTitle: "Architecte invité",
        color: "#475569",
        status: "En attente",
      },
    ]);
    setMemberSearch("");
  };

  const handleRoleChange = (id: string, newRole: GitHubRole) => {
    setCollaborators((prev) =>
      prev.map((c) => (c.id === id ? { ...c, role: newRole } : c))
    );
  };

  const handleRemoveCollaborator = (id: string) => {
    if (collaborators.length <= 1) return;
    setCollaborators((prev) => prev.filter((c) => c.id !== id));
  };

  const handleCreateTeamGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    const slug = `@lonkoo-org/${newTeamName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    setTeamGroups((prev) => [
      ...prev,
      {
        id: `tg-${Date.now()}`,
        slug,
        name: newTeamName.trim(),
        description: "Sous-équipe projet assignée aux revues et à la modélisation.",
        membersCount: 1,
        permission: newTeamPerm,
      },
    ]);
    setNewTeamName("");
  };

  const candidateArchitects = COMMUNITY_ARCHITECTS.filter(
    (a) =>
      !collaborators.some((c) => c.handle === a.handle) &&
      (memberSearch.trim() === "" ||
        a.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
        a.handle.toLowerCase().includes(memberSearch.toLowerCase()) ||
        a.specialties.some((s) => s.toLowerCase().includes(memberSearch.toLowerCase())))
  );

  return (
    <AppShell
      title="Studio"
      fullHeight={activeTab === "canvas"}
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/reviews"
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-950 bg-white hover:bg-slate-50 border border-slate-200 transition-colors flex items-center gap-1.5"
          >
            <GitPullRequest size={14} />
            <span className="hidden md:inline">Créer une revue</span>
          </Link>
          <Link
            href="/deploy"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1265DD] hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5"
          >
            <PlugsConnected size={14} />
            <span className="hidden sm:inline">Déployer</span>
          </Link>
        </div>
      }
    >
      <div
        className={`flex flex-col ${
          activeTab === "canvas"
            ? "w-full flex-1 h-[calc(100vh-5.5rem)] min-h-[600px] gap-2.5"
            : "max-w-6xl mx-auto w-full space-y-5"
        }`}
      >
        {/* BARRE DE NAVIGATION DU PROJET (Responsive Medium & Desktop) */}
        <div className="bg-white rounded-xl px-3 py-2 border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 flex-shrink-0">
          <div className="flex items-center justify-between md:justify-start gap-2.5 min-w-0">
            <select
              value={activeProjectSlug}
              onChange={(e) => setActiveProjectSlug(e.target.value)}
              aria-label="Sélectionner un projet"
              className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:border-[#1265DD] cursor-pointer truncate max-w-[200px] sm:max-w-xs"
            >
              {WORKSPACE_PROJECTS.map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.name} ({p.gitTag})
                </option>
              ))}
            </select>

            <div className="hidden xl:flex items-center gap-2 text-xs font-mono text-slate-500">
              <GitBranch size={13} className="text-slate-400" />
              <span>{currentProject.branch}</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-800 font-medium">
                {versions[0]?.versionTag ?? currentProject.gitTag}
              </span>
            </div>
          </div>

          {/* Onglets compacts avec scroll horizontal fluide sur petits/moyens écrans */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto">
            {(
              [
                { id: "canvas", label: "Architecture", icon: SlidersHorizontal },
                {
                  id: "scanner",
                  label: `Analyse IA (${AI_SUGGESTIONS.length - appliedSuggestionIds.length})`,
                  icon: Cpu,
                },
                { id: "simulator", label: "Simulateur", icon: ChartLineUp },
                { id: "docs", label: "Documentation", icon: FileText },
                { id: "versions", label: "Versions", icon: GitCommit },
                { id: "team", label: `Équipe (${collaborators.length})`, icon: Users },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap flex-shrink-0 ${
                    active
                      ? "bg-white text-slate-950 shadow-2xs"
                      : "text-slate-600 hover:text-slate-950"
                  }`}
                >
                  <Icon size={14} weight={active ? "bold" : "regular"} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ONGLET 1 : ARCHITECTURE (TABLEAU BLANC) */}
        {activeTab === "canvas" && (
          <div className="flex-1 w-full min-h-0 flex flex-col">
            <ArchitectureWhiteboard
              nodes={nodes}
              edges={edges}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onUpdateNodes={setNodes}
              onUpdateEdges={setEdges}
            />
          </div>
        )}

        {/* ONGLET 2 : ANALYSE IA */}
        {activeTab === "scanner" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-5 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-950">
                  Diagnostic de topologie et recommandations
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Analyse des {nodes.length} blocs du projet {currentProject.name}.
                </p>
              </div>

              <div className="flex items-center gap-4 bg-slate-50 px-4 py-2.5 rounded-lg border border-slate-200">
                <div>
                  <div className="text-[11px] text-slate-500">Score de cohérence</div>
                  <div className="text-xl font-bold font-mono text-slate-950">
                    {aiHealthScore}%
                  </div>
                </div>
                <div className="h-7 w-px bg-slate-200" />
                <div>
                  <div className="text-[11px] text-slate-500">Correctifs</div>
                  <div className="text-sm font-bold font-mono text-[#1265DD]">
                    {appliedSuggestionIds.length} / {AI_SUGGESTIONS.length}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {AI_SUGGESTIONS.map((sug) => {
                const isApplied = appliedSuggestionIds.includes(sug.id);
                return (
                  <div
                    key={sug.id}
                    className="bg-white rounded-xl p-5 border border-slate-200"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-2 max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono uppercase text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold">
                            {sug.severity}
                          </span>
                          <span className="text-slate-500">{sug.category}</span>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono text-[#1265DD] font-medium">
                            {sug.impactScore}
                          </span>
                        </div>

                        <h3 className="text-sm font-bold text-slate-950">{sug.title}</h3>
                        <p className="text-xs text-slate-600 leading-relaxed">{sug.rationale}</p>

                        <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono">
                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">
                            <span className="block text-[10px] text-slate-400 mb-0.5">
                              Actuel
                            </span>
                            {sug.currentConfig}
                          </div>
                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-semibold">
                            <span className="block text-[10px] text-[#1265DD] mb-0.5">
                              Proposition
                            </span>
                            {sug.proposedConfig}
                          </div>
                        </div>
                      </div>

                      <div className="flex-shrink-0">
                        {isApplied ? (
                          <div className="px-3.5 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium flex items-center gap-1.5">
                            <CheckCircle size={15} weight="fill" className="text-emerald-600" />
                            <span>Appliqué</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => applySuggestion(sug.id)}
                            className="px-4 py-2 rounded-lg bg-[#1265DD] hover:bg-blue-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <Sparkle size={14} weight="fill" />
                            <span>Appliquer</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ONGLET 3 : SIMULATEUR DE CHARGE */}
        {activeTab === "simulator" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-5 border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-950">
                    Simulation de charge et débit
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ajustez le trafic entrant pour tester les limites de chaque composant.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-right">
                  <div className="text-[10px] font-mono text-slate-500">Trafic cible</div>
                  <div className="text-xl font-bold font-mono text-slate-950">
                    {simulatedRps.toLocaleString("fr-FR")} req/s
                  </div>
                </div>
              </div>

              <div className="py-5">
                <div className="flex items-center justify-between text-xs font-mono text-slate-500 mb-2">
                  <span>1 000 req/s</span>
                  <span>10 000 req/s</span>
                  <span>20 000 req/s</span>
                </div>
                <input
                  type="range"
                  min={1000}
                  max={20000}
                  step={500}
                  value={simulatedRps}
                  onChange={(e) => setSimulatedRps(Number(e.target.value))}
                  className="w-full accent-[#1265DD] cursor-pointer h-2 bg-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {nodes.map((node) => {
                  const loadPct = Math.min(
                    140,
                    Math.round((simulatedRps / node.maxRpsCapacity) * 100)
                  );
                  const saturated = loadPct >= 95;
                  const high = loadPct >= 75 && loadPct < 95;
                  const dynamicLatency = (
                    node.baseLatencyMs * (saturated ? 3.4 : high ? 1.6 : 1)
                  ).toFixed(1);

                  return (
                    <div
                      key={node.id}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-950 truncate">
                              {node.title}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 truncate">
                              {node.tech || "Bloc générique"} · {node.replicas} rép.
                            </div>
                          </div>
                          <span
                            className={`text-xs font-mono font-bold ${
                              saturated
                                ? "text-red-600"
                                : high
                                ? "text-amber-600"
                                : "text-slate-900"
                            }`}
                          >
                            {loadPct}%
                          </span>
                        </div>

                        <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden my-2.5">
                          <div
                            className={`h-full transition-all duration-300 ${
                              saturated
                                ? "bg-red-600"
                                : high
                                ? "bg-amber-500"
                                : "bg-[#1265DD]"
                            }`}
                            style={{ width: `${Math.min(100, loadPct)}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                          <span>Max: {node.maxRpsCapacity} req/s</span>
                          <span>Latence: {dynamicLatency} ms</span>
                        </div>
                      </div>

                      {saturated && (
                        <button
                          type="button"
                          onClick={() =>
                            setNodes((prev) =>
                              prev.map((n) =>
                                n.id === node.id
                                  ? {
                                      ...n,
                                      replicas: n.replicas + 2,
                                      maxRpsCapacity: Math.round(n.maxRpsCapacity * 1.6),
                                      status: "Optimisé",
                                    }
                                  : n
                              )
                            )
                          }
                          className="mt-3 w-full py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          + Ajouter 2 répliques
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ONGLET 4 : DOCUMENTATION */}
        {activeTab === "docs" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 space-y-4">
              {docSections.map((sec) => (
                <div
                  key={sec.id}
                  className="bg-white rounded-xl p-5 border border-slate-200"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 mb-3">
                    <h3 className="text-sm font-bold text-slate-950">{sec.title}</h3>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {sec.lastGenerated}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">
                    {sec.content}
                  </p>
                  <ul className="space-y-1.5 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs text-slate-700">
                    {sec.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1265DD] mt-1.5 flex-shrink-0" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="lg:col-span-4">
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h3 className="text-sm font-bold text-slate-950 mb-1">
                  Génération documentaire
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Mettez à jour la documentation technique et les décisions d&apos;architecture (ADR) selon l&apos;état actuel du graphe.
                </p>

                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Instruction spécifique
                </label>
                <textarea
                  rows={3}
                  value={customDocPrompt}
                  onChange={(e) => setCustomDocPrompt(e.target.value)}
                  placeholder="Préciser un point d'architecture à documenter..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 mb-3 focus:outline-none focus:border-[#1265DD] focus:bg-white"
                />

                <button
                  type="button"
                  disabled={isGeneratingDoc}
                  onClick={handleRegenerateDocs}
                  className="w-full py-2 rounded-lg bg-[#1265DD] hover:bg-blue-700 text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <ArrowsClockwise
                    size={14}
                    weight="bold"
                    className={isGeneratingDoc ? "animate-spin" : ""}
                  />
                  <span>{isGeneratingDoc ? "Génération..." : "Actualiser la documentation"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ONGLET 5 : VERSIONS & RELEASES GIT */}
        {activeTab === "versions" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 space-y-3">
              {versions.map((ver) => (
                <div
                  key={ver.id}
                  className={`bg-white rounded-xl p-5 border ${
                    ver.isCurrent ? "border-[#1265DD]" : "border-slate-200"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-900 text-xs font-mono font-bold">
                        {ver.versionTag}
                      </span>
                      <span className="text-xs font-mono text-slate-500">
                        {ver.gitCommit} · {ver.branch}
                      </span>
                      {ver.isCurrent && (
                        <span className="text-[11px] font-medium text-[#1265DD]">
                          Actuelle
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">
                      {ver.author} · {ver.createdAt}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-950 mb-2">{ver.title}</h3>

                  <ul className="space-y-1 text-xs text-slate-600 mb-3">
                    {ver.changesSummary.map((c) => (
                      <li key={c} className="flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-slate-400" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500">
                    <span>{ver.stackDelta}</span>
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <GithubLogo size={13} />
                      <span>Release {ver.versionTag}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="lg:col-span-4">
              <form
                onSubmit={handleCreateVersion}
                className="bg-white rounded-xl p-5 border border-slate-200 space-y-3.5 text-xs"
              >
                <div className="text-sm font-bold text-slate-950">
                  Créer une release
                </div>
                <p className="text-slate-500 leading-relaxed">
                  Enregistrez une version de l&apos;architecture et associez-la à un tag Git.
                </p>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Tag Git
                  </label>
                  <input
                    type="text"
                    required
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    placeholder="v2.5.0"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Note de version
                  </label>
                  <input
                    type="text"
                    required
                    value={newCommitTitle}
                    onChange={(e) => setNewCommitTitle(e.target.value)}
                    placeholder="Description des changements..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-[#1265DD] hover:bg-blue-700 text-white font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <FloppyDisk size={14} weight="bold" />
                  <span>Publier la version</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* ONGLET 6 : ÉQUIPE & COLLABORATEURS DU PROJET (COMME SUR GITHUB)       */}
        {/* ===================================================================== */}
        {activeTab === "team" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Colonne principale : Membres de l'équipe & Invitation */}
            <div className="lg:col-span-8 space-y-5">
              {/* Ajouter des collaborateurs au projet */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <h2 className="text-sm font-bold text-slate-950">
                      Accès et collaborateurs — {currentProject.name}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Constituez votre équipe projet, attribuez les rôles d&apos;accès et gérez les permissions de fusion.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-slate-600">
                    {collaborators.length} membres actifs
                  </span>
                </div>

                {/* Barre de recherche d'utilisateurs ou invitation directe */}
                <form onSubmit={handleInviteCustomHandle} className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                  <div className="sm:col-span-6 relative">
                    <MagnifyingGlass
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Rechercher un profil (@handle, nom, compétence)..."
                      className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-[#1265DD] focus:bg-white"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as GitHubRole)}
                      aria-label="Rôle du collaborateur"
                      className="w-full px-2.5 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-medium"
                    >
                      <option value="Maintainer">Maintainer</option>
                      <option value="Write">Write (Écriture)</option>
                      <option value="Triage">Triage</option>
                      <option value="Read">Read (Lecture)</option>
                      <option value="Owner">Owner</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="sm:col-span-3 py-2 px-3 rounded-lg bg-[#1265DD] hover:bg-blue-700 text-white font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus size={14} weight="bold" />
                    <span>Ajouter</span>
                  </button>
                </form>

                {/* Suggestions rapides de profils de la communauté */}
                {candidateArchitects.length > 0 && (
                  <div className="pt-1">
                    <div className="text-[11px] font-medium text-slate-400 mb-2">
                      Membres de la communauté disponibles :
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {candidateArchitects.slice(0, 4).map((arch) => (
                        <div
                          key={arch.id}
                          className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              style={{ backgroundColor: arch.color }}
                              className="w-7 h-7 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                            >
                              {arch.initials}
                            </span>
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 truncate">
                                {arch.name}
                              </div>
                              <div className="text-[10px] font-mono text-slate-500 truncate">
                                @{arch.handle} · {arch.specialties.slice(0, 2).join(", ")}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddCollaborator(arch)}
                            className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-medium cursor-pointer flex-shrink-0"
                          >
                            + Inviter
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Liste des collaborateurs du projet */}
                <div className="divide-y divide-slate-100 pt-2">
                  {collaborators.map((collab) => (
                    <div
                      key={collab.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          style={{ backgroundColor: collab.color }}
                          className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                        >
                          {collab.initials}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-950">{collab.name}</span>
                            <span className="font-mono text-[11px] text-slate-400">
                              @{collab.handle}
                            </span>
                            {collab.status === "En attente" && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono">
                                Invitation envoyée
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">{collab.jobTitle}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={collab.role}
                          onChange={(e) =>
                            handleRoleChange(collab.id, e.target.value as GitHubRole)
                          }
                          aria-label={`Rôle de ${collab.name}`}
                          className="px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-xs font-mono font-medium text-slate-800"
                        >
                          <option value="Owner">Owner</option>
                          <option value="Maintainer">Maintainer</option>
                          <option value="Write">Write</option>
                          <option value="Triage">Triage</option>
                          <option value="Read">Read</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => handleRemoveCollaborator(collab.id)}
                          title="Retirer du projet"
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Colonne droite : Sous-équipes (Teams) & Règles de branche */}
            <div className="lg:col-span-4 space-y-5">
              {/* Groupes d'équipes */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-4 text-xs">
                <div>
                  <h3 className="text-sm font-bold text-slate-950">
                    Sous-équipes assignées
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Groupes d&apos;architectes rattachés à ce dépôt.
                  </p>
                </div>

                <div className="space-y-2">
                  {teamGroups.map((tg) => (
                    <div
                      key={tg.id}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-slate-900">
                          {tg.slug}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                          {tg.permission}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">{tg.description}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleCreateTeamGroup} className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="font-medium text-slate-700">Créer une sous-équipe</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="ex: infra-sre"
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900"
                    />
                    <select
                      value={newTeamPerm}
                      onChange={(e) => setNewTeamPerm(e.target.value as GitHubRole)}
                      className="px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-mono"
                    >
                      <option value="Maintainer">Maintainer</option>
                      <option value="Write">Write</option>
                      <option value="Read">Read</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium cursor-pointer"
                  >
                    + Ajouter la sous-équipe
                  </button>
                </form>
              </div>

              {/* Protection de la branche d'architecture */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-3 text-xs">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
                  <ShieldCheck size={17} className="text-[#1265DD]" weight="fill" />
                  <span>Protection de branche ({currentProject.branch})</span>
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={requireTwoApprovals}
                    onChange={(e) => setRequireTwoApprovals(e.target.checked)}
                    className="mt-0.5 accent-[#1265DD]"
                  />
                  <span className="text-slate-600 leading-snug">
                    Exiger l&apos;approbation d&apos;au moins 2 membres (Maintainer ou Owner) avant de fusionner une revue.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireAiCheck}
                    onChange={(e) => setRequireAiCheck(e.target.checked)}
                    className="mt-0.5 accent-[#1265DD]"
                  />
                  <span className="text-slate-600 leading-snug">
                    Bloquer la fusion si l&apos;analyse de cohérence détecte un point critique.
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
