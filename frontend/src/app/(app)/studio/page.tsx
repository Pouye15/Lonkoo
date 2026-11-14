"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/lib/workspace";
import { useProjectGraph } from "@/lib/project-graph";
import { IS_LIVE_API, type ApiRole } from "@/lib/api";
import { auditArchitecture, type Finding } from "@/lib/audit";
import { ArchitectureWhiteboard } from "@/components/studio/ArchitectureWhiteboard";
import { ExportDialog } from "@/components/studio/ExportDialog";
import { AuditPanel } from "@/components/studio/AuditPanel";
import { CanvasGate } from "@/components/studio/live/CanvasGate";
import { LiveTeamPanel } from "@/components/studio/live/LiveTeamPanel";
import { ShareDialog } from "@/components/studio/live/ShareDialog";
import { VersionsPanel } from "@/components/studio/live/VersionsPanel";
import { ChatbotPanel } from "@/components/studio/ChatbotPanel";
import { AiPanel } from "@/components/studio/live/AiPanel";
import {
  ARCHITECTURE_VERSIONS,
  AI_DOC_SECTIONS,
  COMMUNITY_ARCHITECTS,
  DEFAULT_PROJECT_TEAMS,
  type ArchitectureVersion,
  type AIDocSection,
  type GitHubRole,
  type ProjectCollaborator,
  type ProjectTeamGroup,
  type WorkspaceProject,
} from "@/lib/lonkoo-data";
import {
  SlidersHorizontal,
  Cpu,
  ChartLineUp,
  FileText,
  GitCommit,
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
  LinkSimple,
  DownloadSimple,
  Globe,
  ChatCircleDots,
} from "@phosphor-icons/react";

type StudioTab = "canvas" | "scanner" | "chat" | "simulator" | "docs" | "versions" | "team";

const STUDIO_TABS: ReadonlyArray<StudioTab> = ["canvas", "scanner", "chat", "simulator", "docs", "versions", "team"];

function parseTab(value: string | null): StudioTab {
  return STUDIO_TABS.find((tab) => tab === value) ?? "canvas";
}

const API_ROLE_BY_LABEL: Record<GitHubRole, ApiRole> = {
  Owner: "OWNER",
  Maintainer: "MAINTAINER",
  Write: "WRITE",
  Triage: "TRIAGE",
  Read: "READ",
};

export default function StudioPage() {
  const { activeProject, status, error, reload } = useWorkspace();
  if (!activeProject && IS_LIVE_API && (status === "idle" || status === "loading")) {
    return (
      <p role="status" className="mx-auto max-w-md py-20 text-center text-sm text-ink-3">
        Chargement du projet…
      </p>
    );
  }
  if (!activeProject && IS_LIVE_API && status === "error") {
    return (
      <div role="alert" className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-lg font-semibold text-ink">Impossible de lire vos projets</h1>
        <p className="mt-1 text-sm text-ink-3">{error}</p>
        <Button className="mt-5" onClick={() => void reload()}>
          Réessayer
        </Button>
      </div>
    );
  }
  if (!activeProject) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-lg font-semibold text-ink">Aucun projet</h1>
        <p className="mt-1 text-sm text-ink-3">Créez un projet pour ouvrir le studio.</p>
        <Button href="/dashboard?new=1" className="mt-5">
          Nouveau projet
        </Button>
      </div>
    );
  }
  // La clé réinitialise tout l'état local quand on change de projet.
  return <StudioWorkspace key={activeProject.slug} project={activeProject} />;
}

function StudioWorkspace({ project: currentProject }: { project: WorkspaceProject }) {
  const router = useRouter();
  const search = useSearchParams();
  const activeTab = parseTab(search.get("tab"));
  const setActiveTab = (tab: StudioTab) =>
    router.replace(`/studio?project=${currentProject.slug}${tab === "canvas" ? "" : `&tab=${tab}`}`, {
      scroll: false,
    });

  const { nodes, edges, setNodes, setEdges, live } = useProjectGraph(currentProject.slug);
  const { reload: reloadProjects, error: workspaceError, clearError } = useWorkspace();
  // Mode API : projet public ouvert sans en être membre (lecture seule, ni équipe, ni déploiement).
  const visitor = Boolean(live && currentProject.visitor);
  const [shareOpen, setShareOpen] = useState(false);
  // Monte à chaque lien créé : la liste des liens actifs de l'onglet Équipe se relit.
  const [linksVersion, setLinksVersion] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  // Le ticket temps réel donne le rôle exact ; avant, celui lu avec la liste des canvas du projet.
  const role: ApiRole | null = live?.role ?? (currentProject.role ? API_ROLE_BY_LABEL[currentProject.role] : null);
  const canWrite = role === "OWNER" || role === "MAINTAINER" || role === "WRITE";
  const canShare = Boolean(live?.canvasId) && (role === "OWNER" || role === "MAINTAINER");
  const [selectedNodeId, setSelectedNodeId] = useState<string>(
    () => nodes.find((node) => node.id === "pg-primary")?.id ?? nodes[0]?.id ?? "",
  );
  const [simulatedRps, setSimulatedRps] = useState<number>(8500);

  const [docSections, setDocSections] = useState<AIDocSection[]>(AI_DOC_SECTIONS);
  const [isGeneratingDoc, setIsGeneratingDoc] = useState<boolean>(false);
  const [customDocPrompt, setCustomDocPrompt] = useState<string>("");

  const [versions, setVersions] = useState<ArchitectureVersion[]>(ARCHITECTURE_VERSIONS);
  const [newTagInput, setNewTagInput] = useState<string>("");
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

  // Audit par règles : le score et les constats viennent du schéma dessiné (lib/audit.ts), jamais du nombre de clics.
  const report = auditArchitecture(nodes, edges);

  const applyAuditFix = (finding: Finding) => {
    const fix = finding.autofix;
    if (!fix) return;
    setNodes((prev) => prev.map((node) => (node.id === fix.nodeId ? { ...node, replicas: fix.replicas } : node)));
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
          title: `Mise à jour de la topologie${versions[0] ? ` (${versions[0].versionTag})` : ""}`,
          badge: "À jour",
          lastGenerated: "À l'instant",
          content: customDocPrompt.trim()
            ? `Note d'architecture (${customDocPrompt}) : L'architecture comporte ${nodes.length} composants (${stackSummary}).`
            : `Synthèse de la topologie : Le graphe contient ${nodes.length} briques actives (${stackSummary}).`,
          highlights: [
            `${nodes.length} composants présents dans le graphe`,
            `Audit par règles : ${report.score === null ? "rien à auditer" : `${report.score}/100`}`,
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
    <>
      <PageHeader
        title="Studio"
        fullBleed={activeTab === "canvas"}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setExportOpen(true)} disabled={live ? !live.synced : false}>
              <DownloadSimple size={14} />
              <span className="hidden md:inline">Exporter</span>
            </Button>
            {live && canShare && (
              <Button variant="secondary" size="sm" onClick={() => setShareOpen(true)}>
                <LinkSimple size={14} />
                <span className="hidden md:inline">Partager</span>
              </Button>
            )}
            {!visitor && (
              <>
                <Button href="/reviews" variant="secondary" size="sm">
                  <GitPullRequest size={14} />
                  <span className="hidden md:inline">Créer une revue</span>
                </Button>
                <Button href={`/deploy?project=${currentProject.slug}`} size="sm">
                  <PlugsConnected size={14} />
                  <span className="hidden sm:inline">Déployer</span>
                </Button>
              </>
            )}
          </>
        }
      />

      <div
        className={cn(
          "flex flex-col",
          activeTab === "canvas" ? "h-full min-h-[28rem] gap-2" : "mx-auto w-full max-w-6xl space-y-5",
        )}
      >
        {/* Sections du studio : une seule ligne, défilement horizontal sur écran étroit */}
        <div
          role="tablist"
          aria-label="Sections du studio"
          className="flex flex-shrink-0 items-center gap-1 overflow-x-auto rounded-xl border border-edge bg-surface p-1"
        >
          {(
            [
              { id: "canvas", label: "Architecture", icon: SlidersHorizontal },
              {
                id: "scanner",
                label: `Audit (${report.findings.length})`,
                icon: Cpu,
              },
              { id: "chat", label: "Conseiller Systalink", icon: ChatCircleDots },
              { id: "simulator", label: "Simulateur", icon: ChartLineUp },
              { id: "docs", label: "Documentation", icon: FileText },
              { id: "versions", label: "Versions", icon: GitCommit },
              // En mode API, le nombre de membres est celui du panneau (lu au serveur) : pas de compteur ici.
              { id: "team", label: live ? "Équipe" : `Équipe (${collaborators.length})`, icon: Users },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-subtle text-ink" : "text-ink-3 hover:bg-sunken hover:text-ink",
                )}
              >
                <Icon size={15} weight={active ? "fill" : "regular"} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {workspaceError && (
          <div
            role="alert"
            className="flex flex-shrink-0 items-start justify-between gap-3 rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger"
          >
            <span>{workspaceError}</span>
            <button type="button" onClick={clearError} className="flex-shrink-0 font-medium underline">
              Fermer
            </button>
          </div>
        )}
        {visitor && (
          <p role="note" className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-sm text-ink-2">
            <Globe size={16} className="flex-shrink-0" />
            Projet public : vous le consultez en lecture seule. Pour partir de cette architecture, créez le vôtre.
          </p>
        )}

        {/* ONGLET 1 : ARCHITECTURE (TABLEAU BLANC) */}
        {activeTab === "canvas" && (
          <div className="flex-1 w-full min-h-0 flex flex-col">
            {live ? (
              <CanvasGate live={live}>
                <ArchitectureWhiteboard
                  nodes={nodes}
                  edges={edges}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                  onUpdateNodes={setNodes}
                  onUpdateEdges={setEdges}
                  readOnly={live.readOnly}
                  peers={live.peers}
                  onCursorMove={live.setCursor}
                />
              </CanvasGate>
            ) : (
              <ArchitectureWhiteboard
                nodes={nodes}
                edges={edges}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                onUpdateNodes={setNodes}
                onUpdateEdges={setEdges}
              />
            )}
          </div>
        )}

        {/* ONGLET 2 : AUDIT PAR RÈGLES (local et immédiat), puis ANALYSE PAR L'AGENT (appel au fournisseur) */}
        {activeTab === "scanner" && (
          <div className="space-y-4">
            <AuditPanel
              audit={report}
              nodes={nodes}
              edgeCount={edges.length}
              canFix={!live?.readOnly}
              onShow={(nodeId) => {
                setSelectedNodeId(nodeId);
                setActiveTab("canvas");
              }}
              onFix={applyAuditFix}
            />

            <AiPanel
              canvasId={live?.canvasId ?? null}
              live={Boolean(live)}
              canWrite={canWrite && !live?.readOnly}
              projectName={currentProject.name}
              nodes={nodes}
              edges={edges}
              setNodes={setNodes}
              setEdges={setEdges}
            />
          </div>
        )}

        {/* ONGLET CONSEILLER IA & SYSTALINK */}
        {activeTab === "chat" && (
          <ChatbotPanel
            canvasId={live?.canvasId}
            live={Boolean(live)}
            projectName={currentProject.name}
            nodesCount={nodes.length}
          />
        )}

        {/* ONGLET 3 : SIMULATEUR DE CHARGE */}
        {activeTab === "simulator" && (
          <div className="space-y-4">
            <div className="bg-surface rounded-xl p-5 border border-edge">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-edge-soft">
                <div>
                  <h2 className="text-base font-bold text-ink">
                    Simulation de charge et débit
                  </h2>
                  <p className="text-xs text-ink-3 mt-0.5">
                    Ajustez le trafic entrant pour tester les limites de chaque composant.
                  </p>
                </div>

                <div className="bg-sunken border border-edge rounded-lg px-4 py-2 text-right">
                  <div className="text-[11px] font-mono text-ink-3">Trafic cible</div>
                  <div className="text-xl font-bold font-mono text-ink">
                    {simulatedRps.toLocaleString("fr-FR")} req/s
                  </div>
                </div>
              </div>

              <div className="py-5">
                <div className="flex items-center justify-between text-xs font-mono text-ink-3 mb-2">
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
                  className="w-full accent-accent cursor-pointer h-2 bg-strong rounded-lg"
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
                      className="p-4 rounded-xl bg-sunken border border-edge flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-ink truncate">
                              {node.title}
                            </div>
                            <div className="text-[11px] font-mono text-ink-3 truncate">
                              {node.tech || "Bloc générique"} · {node.replicas} rép.
                            </div>
                          </div>
                          <span
                            className={`text-xs font-mono font-bold ${
                              saturated
                                ? "text-danger"
                                : high
                                ? "text-warn"
                                : "text-ink"
                            }`}
                          >
                            {loadPct}%
                          </span>
                        </div>

                        <div className="w-full h-1.5 rounded-full bg-strong overflow-hidden my-2.5">
                          <div
                            className={`h-full transition-all duration-300 ${
                              saturated
                                ? "bg-danger"
                                : high
                                ? "bg-warn-fill"
                                : "bg-brand"
                            }`}
                            style={{ width: `${Math.min(100, loadPct)}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-mono text-ink-3">
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
                          className="mt-3 w-full py-1.5 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-ink text-[11px] font-medium transition-colors cursor-pointer"
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
                  className="bg-surface rounded-xl p-5 border border-edge"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-edge-soft mb-3">
                    <h3 className="text-sm font-bold text-ink">{sec.title}</h3>
                    <span className="text-[11px] text-ink-4 font-mono">
                      {sec.lastGenerated}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-ink-2 leading-relaxed mb-4">
                    {sec.content}
                  </p>
                  <ul className="space-y-1.5 bg-sunken p-3.5 rounded-lg border border-edge text-xs text-ink-2">
                    {sec.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 flex-shrink-0" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="lg:col-span-4">
              <div className="bg-surface rounded-xl p-5 border border-edge">
                <h3 className="text-sm font-bold text-ink mb-1">
                  Génération documentaire
                </h3>
                <p className="text-xs text-ink-3 leading-relaxed mb-4">
                  Mettez à jour la documentation technique et les décisions d&apos;architecture (ADR) selon l&apos;état actuel du graphe.
                </p>

                <label className="block text-xs font-medium text-ink-2 mb-1.5">
                  Instruction spécifique
                </label>
                <textarea
                  rows={3}
                  value={customDocPrompt}
                  onChange={(e) => setCustomDocPrompt(e.target.value)}
                  placeholder="Préciser un point d'architecture à documenter..."
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-xs text-ink mb-3 focus:outline-none focus:border-accent focus:bg-surface"
                />

                <button
                  type="button"
                  disabled={isGeneratingDoc}
                  onClick={handleRegenerateDocs}
                  className="w-full py-2 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
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
        {activeTab === "versions" && live && (
          live.canvasId ? (
            <VersionsPanel canvasId={live.canvasId} projectName={currentProject.name} canWrite={canWrite && !live.readOnly} />
          ) : (
            <p role="status" className="rounded-xl border border-edge bg-surface p-5 text-sm text-ink-3">
              Chargement du canvas…
            </p>
          )
        )}
        {activeTab === "versions" && !live && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 space-y-3">
              {versions.map((ver) => (
                <div
                  key={ver.id}
                  className={`bg-surface rounded-xl p-5 border ${
                    ver.isCurrent ? "border-accent" : "border-edge"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-subtle text-ink text-xs font-mono font-bold">
                        {ver.versionTag}
                      </span>
                      <span className="text-xs font-mono text-ink-3">
                        {ver.gitCommit} · {ver.branch}
                      </span>
                      {ver.isCurrent && (
                        <span className="text-[11px] font-medium text-accent">
                          Actuelle
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-ink-4">
                      {ver.author} · {ver.createdAt}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-ink mb-2">{ver.title}</h3>

                  <ul className="space-y-1 text-xs text-ink-2 mb-3">
                    {ver.changesSummary.map((c) => (
                      <li key={c} className="flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-ink-4" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-2.5 border-t border-edge-soft flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-ink-3">
                    <span>{ver.stackDelta}</span>
                    <span className="flex items-center gap-1.5 text-ink-2">
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
                className="bg-surface rounded-xl p-5 border border-edge space-y-3.5 text-xs"
              >
                <div className="text-sm font-bold text-ink">
                  Créer une release
                </div>
                <p className="text-ink-3 leading-relaxed">
                  Enregistrez une version de l&apos;architecture et associez-la à un tag Git.
                </p>

                <div>
                  <label className="block font-medium text-ink-2 mb-1">
                    Tag Git
                  </label>
                  <input
                    type="text"
                    required
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    placeholder="v1.0.0"
                    className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-ink font-mono font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-medium text-ink-2 mb-1">
                    Note de version
                  </label>
                  <input
                    type="text"
                    required
                    value={newCommitTitle}
                    onChange={(e) => setNewCommitTitle(e.target.value)}
                    placeholder="Description des changements..."
                    className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-ink"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-brand hover:bg-brand-hover text-white font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
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
        {activeTab === "team" && visitor && (
          <div className="rounded-xl border border-edge bg-surface p-5 text-sm text-ink-3">
            L&apos;équipe d&apos;un projet public n&apos;est visible que de ses membres.
          </div>
        )}
        {activeTab === "team" && live && !visitor && (
          <LiveTeamPanel
            projectId={currentProject.id}
            canvasId={live.canvasId}
            canShare={canShare}
            onShare={() => setShareOpen(true)}
            linksVersion={linksVersion}
            onLeft={() => {
              // Plus d'accès à ce projet : retour à la liste, relue sans lui.
              router.replace("/dashboard");
              void reloadProjects();
            }}
          />
        )}
        {activeTab === "team" && !live && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Colonne principale : Membres de l'équipe & Invitation */}
            <div className="lg:col-span-8 space-y-5">
              {/* Ajouter des collaborateurs au projet */}
              <div className="bg-surface rounded-xl p-5 border border-edge space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-edge-soft">
                  <div>
                    <h2 className="text-sm font-bold text-ink">
                      Accès et collaborateurs — {currentProject.name}
                    </h2>
                    <p className="text-xs text-ink-3 mt-0.5">
                      Constituez votre équipe projet, attribuez les rôles d&apos;accès et gérez les permissions de fusion.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-ink-2">
                    {collaborators.length} membres actifs
                  </span>
                </div>

                {/* Barre de recherche d'utilisateurs ou invitation directe */}
                <form onSubmit={handleInviteCustomHandle} className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                  <div className="sm:col-span-6 relative">
                    <MagnifyingGlass
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4"
                    />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Rechercher un profil (@handle, nom, compétence)..."
                      className="w-full pl-8 pr-3 py-2 rounded-lg bg-sunken border border-edge text-ink focus:outline-none focus:border-accent focus:bg-surface"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as GitHubRole)}
                      aria-label="Rôle du collaborateur"
                      className="w-full px-2.5 py-2 rounded-lg bg-sunken border border-edge text-ink font-medium"
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
                    className="sm:col-span-3 py-2 px-3 rounded-lg bg-brand hover:bg-brand-hover text-white font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus size={14} weight="bold" />
                    <span>Ajouter</span>
                  </button>
                </form>

                {/* Suggestions rapides de profils de la communauté */}
                {candidateArchitects.length > 0 && (
                  <div className="pt-1">
                    <div className="text-[11px] font-medium text-ink-4 mb-2">
                      Membres de la communauté disponibles :
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {candidateArchitects.slice(0, 4).map((arch) => (
                        <div
                          key={arch.id}
                          className="p-2.5 rounded-lg bg-sunken border border-edge flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              style={{ backgroundColor: arch.color }}
                              className="w-7 h-7 rounded-full text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0"
                            >
                              {arch.initials}
                            </span>
                            <div className="min-w-0">
                              <div className="font-semibold text-ink truncate">
                                {arch.name}
                              </div>
                              <div className="text-[11px] font-mono text-ink-3 truncate">
                                @{arch.handle} · {arch.specialties.slice(0, 2).join(", ")}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddCollaborator(arch)}
                            className="px-2.5 py-1 rounded bg-surface hover:bg-subtle text-ink-2 border border-edge text-[11px] font-medium cursor-pointer flex-shrink-0"
                          >
                            + Inviter
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Liste des collaborateurs du projet */}
                <div className="divide-y divide-edge-soft pt-2">
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
                            <span className="font-bold text-ink">{collab.name}</span>
                            <span className="font-mono text-[11px] text-ink-4">
                              @{collab.handle}
                            </span>
                            {collab.status === "En attente" && (
                              <span className="text-[11px] px-1.5 py-0.2 rounded bg-subtle text-ink-2 font-mono">
                                Invitation envoyée
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-ink-3">{collab.jobTitle}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={collab.role}
                          onChange={(e) =>
                            handleRoleChange(collab.id, e.target.value as GitHubRole)
                          }
                          aria-label={`Rôle de ${collab.name}`}
                          className="px-2.5 py-1 rounded-md bg-sunken border border-edge text-xs font-mono font-medium text-ink-2"
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
                          className="p-1.5 rounded-md text-ink-4 hover:text-danger hover:bg-subtle transition-colors cursor-pointer"
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
              <div className="bg-surface rounded-xl p-5 border border-edge space-y-4 text-xs">
                <div>
                  <h3 className="text-sm font-bold text-ink">
                    Sous-équipes assignées
                  </h3>
                  <p className="text-xs text-ink-3 mt-0.5">
                    Groupes d&apos;architectes rattachés à ce dépôt.
                  </p>
                </div>

                <div className="space-y-2">
                  {teamGroups.map((tg) => (
                    <div
                      key={tg.id}
                      className="p-3 rounded-lg bg-sunken border border-edge space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-ink">
                          {tg.slug}
                        </span>
                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-surface border border-edge text-ink-2">
                          {tg.permission}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-3">{tg.description}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleCreateTeamGroup} className="pt-2 border-t border-edge-soft space-y-2">
                  <div className="font-medium text-ink-2">Créer une sous-équipe</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="ex: infra-sre"
                      className="min-w-0 flex-1 px-2.5 py-1.5 rounded-lg bg-sunken border border-edge text-ink"
                    />
                    <select
                      value={newTeamPerm}
                      onChange={(e) => setNewTeamPerm(e.target.value as GitHubRole)}
                      aria-label="Permission de la sous-équipe"
                      className="w-28 flex-shrink-0 px-2 py-1.5 rounded-lg bg-sunken border border-edge text-ink-2 font-mono"
                    >
                      <option value="Maintainer">Maintainer</option>
                      <option value="Write">Write</option>
                      <option value="Read">Read</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-1.5 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-ink font-medium cursor-pointer"
                  >
                    + Ajouter la sous-équipe
                  </button>
                </form>
              </div>

              {/* Protection de la branche d'architecture */}
              <div className="bg-surface rounded-xl p-5 border border-edge space-y-3 text-xs">
                <div className="flex items-center gap-2 text-sm font-bold text-ink">
                  <ShieldCheck size={17} className="text-accent" weight="fill" />
                  <span>Protection de branche ({currentProject.branch})</span>
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={requireTwoApprovals}
                    onChange={(e) => setRequireTwoApprovals(e.target.checked)}
                    className="mt-0.5 accent-accent"
                  />
                  <span className="text-ink-2 leading-snug">
                    Exiger l&apos;approbation d&apos;au moins 2 membres (Maintainer ou Owner) avant de fusionner une revue.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireAiCheck}
                    onChange={(e) => setRequireAiCheck(e.target.checked)}
                    className="mt-0.5 accent-accent"
                  />
                  <span className="text-ink-2 leading-snug">
                    Bloquer la fusion si l&apos;analyse de cohérence détecte un point critique.
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        projectName={currentProject.name}
        nodes={nodes}
        edges={edges}
        canvasId={live?.canvasId}
      />
      {live?.canvasId && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          canvasId={live.canvasId}
          onCreated={() => setLinksVersion((version) => version + 1)}
        />
      )}
    </>
  );
}
