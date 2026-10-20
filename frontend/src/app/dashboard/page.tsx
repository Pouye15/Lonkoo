"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppSidebar";
import { WORKSPACE_PROJECTS, type WorkspaceProject } from "@/lib/lonkoo-data";
import {
  Plus,
  MagnifyingGlass,
  Globe,
  LockKey,
  GitBranch,
  Tag,
  GitFork,
  ArrowRight,
  GithubLogo,
  Users,
  X,
} from "@phosphor-icons/react";

type FilterVisibility = "all" | "public" | "private" | "forks";

export default function DashboardPage() {
  const [projects, setProjects] = useState<WorkspaceProject[]>(WORKSPACE_PROJECTS);
  const [filter, setFilter] = useState<FilterVisibility>("all");
  const [search, setSearch] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newVisibility, setNewVisibility] = useState<"public" | "private">("private");
  const [newRepo, setNewRepo] = useState("lonkoo-org/");
  const [newStack, setNewStack] = useState("Go 1.23, PostgreSQL 16, Valkey, Kong");

  const filteredProjects = projects.filter((p) => {
    if (filter === "public" && p.visibility !== "public") return false;
    if (filter === "private" && p.visibility !== "private") return false;
    if (filter === "forks" && !p.forkedFrom) return false;
    if (
      search.trim() &&
      !p.name.toLowerCase().includes(search.toLowerCase()) &&
      !p.description.toLowerCase().includes(search.toLowerCase()) &&
      !p.stack.some((s) => s.toLowerCase().includes(search.toLowerCase()))
    ) {
      return false;
    }
    return true;
  });

  const toggleVisibility = (id: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, visibility: p.visibility === "public" ? "private" : "public" }
          : p
      )
    );
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const slug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const created: WorkspaceProject = {
      id: `proj-${Date.now()}`,
      slug,
      name: slug,
      description:
        newDesc.trim() ||
        "Architecture collaborative avec gestion de versions et d'équipe.",
      visibility: newVisibility,
      branch: "main",
      gitTag: "v0.1.0",
      githubRepo: newRepo.includes("/") ? newRepo : `lonkoo-org/${slug}`,
      stack: newStack
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      aiScore: 92,
      updatedAt: "À l'instant",
      collaborators: [
        { initials: "AS", name: "Aminata S.", role: "Owner", color: "#1265DD" },
      ],
      nodesCount: 4,
      openReviewsCount: 0,
      mcpActive: true,
      orionSynced: false,
    };
    setProjects((prev) => [created, ...prev]);
    setNewName("");
    setNewDesc("");
    setShowNewModal(false);
  };

  return (
    <AppShell
      title="Projets"
      actions={
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#1265DD] hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <Plus size={14} weight="bold" />
          <span>Nouveau projet</span>
        </button>
      }
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Métriques synthétiques */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <div className="text-xs text-slate-500 mb-1">Dépôts d&apos;architecture</div>
            <div className="text-2xl font-bold text-slate-950 font-mono">
              {projects.length}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              {projects.filter((p) => p.visibility === "public").length} publics ·{" "}
              {projects.filter((p) => p.visibility === "private").length} privés
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <div className="text-xs text-slate-500 mb-1">Indice de cohérence</div>
            <div className="text-2xl font-bold text-slate-950 font-mono">94.5%</div>
            <div className="mt-1 text-[11px] text-slate-400">
              Topologies validées
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <div className="text-xs text-slate-500 mb-1">Releases publiées</div>
            <div className="text-2xl font-bold text-slate-950 font-mono">14</div>
            <div className="mt-1 text-[11px] text-slate-400 font-mono">
              Dernier tag : v2.4.0
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <div className="text-xs text-slate-500 mb-1">Revues en cours</div>
            <div className="text-2xl font-bold text-slate-950 font-mono">2</div>
            <div className="mt-1 text-[11px]">
              <Link href="/reviews" className="text-[#1265DD] hover:underline font-medium">
                Voir les revues →
              </Link>
            </div>
          </div>
        </div>

        {/* Barre de Filtres et Recherche */}
        <div className="bg-white rounded-xl p-3.5 border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto">
            {(
              [
                { id: "all", label: `Tous (${projects.length})` },
                {
                  id: "public",
                  label: `Publics (${projects.filter((p) => p.visibility === "public").length})`,
                },
                {
                  id: "private",
                  label: `Privés (${projects.filter((p) => p.visibility === "private").length})`,
                },
                {
                  id: "forks",
                  label: `Forks (${projects.filter((p) => Boolean(p.forkedFrom)).length})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  filter === tab.id
                    ? "bg-white text-slate-950 shadow-2xs"
                    : "text-slate-600 hover:text-slate-950"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 md:max-w-xs lg:max-w-sm">
            <MagnifyingGlass
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un projet ou une stack..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1265DD] focus:bg-white"
            />
          </div>
        </div>

        {/* Grille des Projets */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredProjects.map((proj) => (
            <div
              key={proj.id}
              className="bg-white rounded-xl p-5 border border-slate-200 hover:border-slate-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/studio?project=${proj.slug}`}
                        className="text-base font-bold text-slate-950 hover:text-[#1265DD] transition-colors font-mono truncate"
                      >
                        {proj.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() => toggleVisibility(proj.id)}
                        title="Basculer Public / Privé"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-mono font-medium transition-colors cursor-pointer flex-shrink-0"
                      >
                        {proj.visibility === "public" ? (
                          <>
                            <Globe size={11} />
                            <span>Public</span>
                          </>
                        ) : (
                          <>
                            <LockKey size={11} />
                            <span>Privé</span>
                          </>
                        )}
                      </button>
                    </div>

                    {proj.forkedFrom && (
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                        <GitFork size={12} />
                        <span>Fork de</span>
                        <Link
                          href="/palabre"
                          className="text-slate-700 hover:text-[#1265DD] hover:underline font-medium"
                        >
                          {proj.forkedFrom}
                        </Link>
                      </div>
                    )}
                  </div>

                  <span className="text-xs font-mono text-slate-500 flex-shrink-0">
                    {proj.nodesCount} blocs
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                  {proj.description}
                </p>

                {/* Stack Technique */}
                <div className="flex flex-wrap items-center gap-1.5 mb-4">
                  {proj.stack.map((tech) => (
                    <span
                      key={tech}
                      className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700"
                    >
                      {tech}
                    </span>
                  ))}
                </div>

                {/* Métadonnées Dépôt & Tag Git */}
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-600">
                  <div className="flex items-center gap-1.5 truncate">
                    <GithubLogo size={13} className="text-slate-900 flex-shrink-0" />
                    <span className="truncate">{proj.githubRepo}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <GitBranch size={12} className="text-slate-400" />
                      {proj.branch}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="flex items-center gap-1 text-slate-900 font-semibold">
                      <Tag size={11} className="text-slate-400" />
                      {proj.gitTag}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pied de carte : Équipe & Actions */}
              <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center -space-x-1.5">
                    {proj.collaborators.map((c) => (
                      <span
                        key={c.initials}
                        title={`${c.name} (${c.role})`}
                        style={{ backgroundColor: c.color }}
                        className="w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white"
                      >
                        {c.initials}
                      </span>
                    ))}
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {proj.updatedAt}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/studio?project=${proj.slug}&tab=team`}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-950 bg-white hover:bg-slate-50 border border-slate-200 transition-colors flex items-center gap-1.5"
                  >
                    <Users size={13} />
                    <span>Équipe ({proj.collaborators.length})</span>
                  </Link>
                  <Link
                    href={`/studio?project=${proj.slug}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1265DD] hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5"
                  >
                    <span>Ouvrir</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal de création de projet */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 border border-slate-200 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h2 className="text-base font-bold text-slate-950">
                Nouveau projet
              </h2>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-800 mb-1">
                  Nom du projet
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ex: realtime-notification-engine"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono focus:outline-none focus:border-[#1265DD] focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-800 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Objectif du système..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-[#1265DD] focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setNewVisibility("private")}
                  className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                    newVisibility === "private"
                      ? "bg-slate-50 border-2 border-[#1265DD] text-slate-950"
                      : "bg-white border-slate-200 text-slate-600"
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold mb-0.5">
                    <LockKey size={14} className="text-slate-800" />
                    <span>Privé</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Réservé à votre équipe.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setNewVisibility("public")}
                  className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                    newVisibility === "public"
                      ? "bg-slate-50 border-2 border-[#1265DD] text-slate-950"
                      : "bg-white border-slate-200 text-slate-600"
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold mb-0.5">
                    <Globe size={14} className="text-slate-800" />
                    <span>Public</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Partagé avec la communauté.
                  </p>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-800 mb-1">
                    Dépôt GitHub
                  </label>
                  <input
                    type="text"
                    value={newRepo}
                    onChange={(e) => setNewRepo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-800 mb-1">
                    Stack (optionnel)
                  </label>
                  <input
                    type="text"
                    value={newStack}
                    onChange={(e) => setNewStack(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#1265DD] hover:bg-blue-700 text-white font-medium cursor-pointer"
                >
                  Créer le projet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
