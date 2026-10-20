"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppSidebar";
import {
  PALABRE_BLUEPRINTS,
  CORE_STUDIO_NODES,
  COMMUNITY_ARCHITECTS,
  type BlueprintItem,
  type CommunityArchitect,
} from "@/lib/lonkoo-data";
import {
  MagnifyingGlass,
  GitFork,
  Star,
  ChatCircleDots,
  UploadSimple,
  Tag,
  ArrowRight,
  Users,
  UserPlus,
  Check,
  MapPin,
  Buildings,
  X,
} from "@phosphor-icons/react";

const CATEGORIES = ["Tous", "FinTech", "IA & RAG", "Microservices", "E-Commerce"] as const;

type CommunityTab = "architectures" | "profiles" | "following";

export default function CommunityTemplatesPage() {
  const [activeView, setActiveView] = useState<CommunityTab>("architectures");
  const [templates, setTemplates] = useState<BlueprintItem[]>(PALABRE_BLUEPRINTS);
  const [architects, setArchitects] = useState<CommunityArchitect[]>(COMMUNITY_ARCHITECTS);
  const [category, setCategory] = useState<string>("Tous");
  const [search, setSearch] = useState<string>("");
  const [showPublishModal, setShowPublishModal] = useState<boolean>(false);
  const [selectedProfile, setSelectedProfile] = useState<CommunityArchitect | null>(null);

  // Formulaire de publication
  const [pubTitle, setPubTitle] = useState("");
  const [pubSector, setPubSector] = useState<BlueprintItem["sector"]>("Microservices");
  const [pubSummary, setPubSummary] = useState("");
  const [pubStack, setPubStack] = useState("Go 1.23, Redpanda, PostgreSQL 16, Valkey");
  const [pubTag, setPubTag] = useState("v1.0.0");

  // Suivre / Ne plus suivre un utilisateur
  const toggleFollow = (id: string) => {
    setArchitects((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const nextFollow = !a.isFollowing;
        const updated = {
          ...a,
          isFollowing: nextFollow,
          followers: nextFollow ? a.followers + 1 : a.followers - 1,
        };
        if (selectedProfile?.id === id) {
          setSelectedProfile(updated);
        }
        return updated;
      })
    );
  };

  const filteredTemplates = templates.filter((item) => {
    if (activeView === "following") {
      const authorArch = architects.find(
        (a) => a.name.toLowerCase() === item.author.toLowerCase()
      );
      if (authorArch && !authorArch.isFollowing) return false;
    }
    if (category !== "Tous" && item.sector !== category) return false;
    if (
      search.trim() &&
      !item.title.toLowerCase().includes(search.toLowerCase()) &&
      !item.summary.toLowerCase().includes(search.toLowerCase()) &&
      !item.author.toLowerCase().includes(search.toLowerCase()) &&
      !item.stack.some((s) => s.toLowerCase().includes(search.toLowerCase()))
    ) {
      return false;
    }
    return true;
  });

  const filteredArchitects = architects.filter((arch) => {
    if (activeView === "following" && !arch.isFollowing) return false;
    if (
      search.trim() &&
      !arch.name.toLowerCase().includes(search.toLowerCase()) &&
      !arch.handle.toLowerCase().includes(search.toLowerCase()) &&
      !arch.role.toLowerCase().includes(search.toLowerCase()) &&
      !arch.company.toLowerCase().includes(search.toLowerCase()) &&
      !arch.specialties.some((s) => s.toLowerCase().includes(search.toLowerCase()))
    ) {
      return false;
    }
    return true;
  });

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pubTitle.trim()) return;
    const slug = pubTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const created: BlueprintItem = {
      id: `bp-${Date.now()}`,
      slug,
      title: pubTitle.trim(),
      sector: pubSector,
      visibility: "public",
      stars: 5.0,
      ratingsCount: 1,
      forks: 1,
      summary:
        pubSummary.trim() ||
        "Architecture partagée avec sous-graphes modulaires et documentation.",
      stack: pubStack
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      gitTag: pubTag.trim() || "v1.0.0",
      githubRepo: `lonkoo-org/${slug}`,
      latencyMs: "4.2 ms",
      architecturePattern: "Event-Driven Modular",
      resilienceScore: 95,
      author: "Aminata S.",
      authorRole: "Principal Systems Architect",
      updatedAt: "À l'instant",
      nodes: CORE_STUDIO_NODES,
      modules: [
        {
          id: "mod-custom-1",
          name: "Passerelle & Authentification",
          description: "API Gateway et gestion des identités OIDC.",
          nodeIds: ["edge-gateway", "auth-service"],
          stack: ["Kong", "Keycloak"],
          estimatedSetup: "2 nœuds",
        },
        {
          id: "mod-custom-2",
          name: "Cœur Métier & Données",
          description: "Services applicatifs et persistance relationnelle.",
          nodeIds: ["core-orchestrator", "pg-primary"],
          stack: ["Go", "PostgreSQL 16"],
          estimatedSetup: "2 nœuds",
        },
      ],
      comments: [],
    };
    setTemplates((prev) => [created, ...prev]);
    setPubTitle("");
    setPubSummary("");
    setShowPublishModal(false);
  };

  const myFollowingCount = architects.filter((a) => a.isFollowing).length;

  return (
    <AppShell
      title="Communauté"
      actions={
        <button
          type="button"
          onClick={() => setShowPublishModal(true)}
          className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#1265DD] hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <UploadSimple size={14} weight="bold" />
          <span>Publier</span>
        </button>
      }
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Barre de Navigation Communautaire & Recherche */}
        <div className="bg-white rounded-xl p-3.5 border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Sélecteur de vue : Architectures / Profils / Abonnements */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveView("architectures")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeView === "architectures"
                  ? "bg-white text-slate-950 shadow-2xs"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              Architectures ({templates.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveView("profiles")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeView === "profiles"
                  ? "bg-white text-slate-950 shadow-2xs"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              <Users size={14} />
              <span>Profils &amp; Architectes ({architects.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView("following")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeView === "following"
                  ? "bg-white text-slate-950 shadow-2xs"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              Abonnements ({myFollowingCount})
            </button>
          </div>

          {/* Recherche universelle (Architectures + Utilisateurs) */}
          <div className="relative flex-1 md:max-w-xs lg:max-w-sm">
            <MagnifyingGlass
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un profil (@handle), une stack ou un modèle..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1265DD] focus:bg-white"
            />
          </div>
        </div>

        {/* =================================================================== */}
        {/* VUE 1 & 3 : ARCHITECTURES PUBLIÉES + APERÇU RÉSEAU D'ARCHITECTES     */}
        {/* =================================================================== */}
        {(activeView === "architectures" || activeView === "following") && (
          <div className="space-y-6">
            {/* Bandeau des profils d'architectes à suivre */}
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold text-slate-950">
                  {activeView === "following"
                    ? "Architectes que vous suivez"
                    : "Architectes actifs dans la communauté"}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveView("profiles")}
                  className="text-xs font-medium text-[#1265DD] hover:underline cursor-pointer"
                >
                  Voir tous les profils →
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredArchitects.slice(0, 3).map((arch) => (
                  <div
                    key={arch.id}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedProfile(arch)}
                      className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
                    >
                      <span
                        style={{ backgroundColor: arch.color }}
                        className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                      >
                        {arch.initials}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-950 group-hover:text-[#1265DD] truncate">
                          {arch.name}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 truncate">
                          @{arch.handle} · {arch.followers} abonnés
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleFollow(arch.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 flex-shrink-0 ${
                        arch.isFollowing
                          ? "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                          : "bg-[#1265DD] hover:bg-blue-700 text-white"
                      }`}
                    >
                      {arch.isFollowing ? (
                        <>
                          <Check size={12} weight="bold" />
                          <span>Abonné</span>
                        </>
                      ) : (
                        <>
                          <UserPlus size={12} weight="bold" />
                          <span>Suivre</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Filtres par catégorie */}
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    category === cat
                      ? "bg-slate-900 text-white"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Grille des Architectures */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredTemplates.map((bp) => {
                const authorProfile = architects.find(
                  (a) => a.name.toLowerCase() === bp.author.toLowerCase()
                );

                return (
                  <div
                    key={bp.id}
                    className="bg-white rounded-xl p-5 border border-slate-200 hover:border-slate-300 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-medium text-[11px]">
                            {bp.sector}
                          </span>
                          <span className="font-mono text-slate-400 text-[11px] flex items-center gap-1">
                            <Tag size={12} />
                            {bp.gitTag}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs font-mono text-slate-600">
                          <span className="flex items-center gap-1 font-semibold text-slate-900">
                            <Star size={13} weight="fill" className="text-amber-500" />
                            {bp.stars.toFixed(1)}
                          </span>
                          <span className="flex items-center gap-1">
                            <GitFork size={13} className="text-slate-400" />
                            {bp.forks}
                          </span>
                        </div>
                      </div>

                      <Link
                        href={`/palabre/${bp.slug}`}
                        className="text-base font-bold text-slate-950 hover:text-[#1265DD] transition-colors block mb-1.5"
                      >
                        {bp.title}
                      </Link>

                      <p className="text-xs text-slate-600 leading-relaxed mb-4">
                        {bp.summary}
                      </p>

                      {/* Stack */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-4">
                        {bp.stack.map((s) => (
                          <span
                            key={s}
                            className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700"
                          >
                            {s}
                          </span>
                        ))}
                      </div>

                      {/* Sous-graphes */}
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 mb-4">
                        <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1.5">
                          <span className="font-medium text-slate-800">
                            {bp.modules.length} sous-graphes réutilisables
                          </span>
                          <span className="font-mono text-slate-500">
                            Latence {bp.latencyMs}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {bp.modules.map((m) => (
                            <span
                              key={m.id}
                              className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200"
                            >
                              {m.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Pied de carte avec profil auteur & bouton Suivre */}
                    <div className="pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => authorProfile && setSelectedProfile(authorProfile)}
                          className="flex items-center gap-2 text-left cursor-pointer group"
                        >
                          <span
                            style={{ backgroundColor: authorProfile?.color ?? "#1265DD" }}
                            className="w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                          >
                            {authorProfile?.initials ?? bp.author.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="text-xs font-semibold text-slate-900 group-hover:text-[#1265DD]">
                            {bp.author}
                          </span>
                        </button>

                        {authorProfile && (
                          <button
                            type="button"
                            onClick={() => toggleFollow(authorProfile.id)}
                            className={`text-[11px] px-2 py-0.5 rounded font-medium cursor-pointer transition-colors ${
                              authorProfile.isFollowing
                                ? "bg-slate-100 text-slate-600"
                                : "text-[#1265DD] hover:bg-slate-100"
                            }`}
                          >
                            {authorProfile.isFollowing ? "Abonné" : "+ Suivre"}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          href={`/palabre/${bp.slug}`}
                          className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium flex items-center gap-1 transition-colors"
                        >
                          <ChatCircleDots size={13} />
                          <span>{bp.comments.length}</span>
                        </Link>
                        <Link
                          href={`/palabre/${bp.slug}`}
                          className="px-3 py-1.5 rounded-lg bg-[#1265DD] hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                        >
                          <GitFork size={13} weight="bold" />
                          <span>Forker</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* VUE 2 : ANNUAIRE DES PROFILS D'ARCHITECTES & MEMBRES                */}
        {/* =================================================================== */}
        {activeView === "profiles" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredArchitects.map((arch) => (
              <div
                key={arch.id}
                className="bg-white rounded-xl p-5 border border-slate-200 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedProfile(arch)}
                      className="flex items-center gap-3 text-left cursor-pointer group min-w-0"
                    >
                      <span
                        style={{ backgroundColor: arch.color }}
                        className="w-11 h-11 rounded-full text-white text-sm font-bold flex items-center justify-center flex-shrink-0"
                      >
                        {arch.initials}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-950 group-hover:text-[#1265DD] truncate">
                          {arch.name}
                        </h3>
                        <div className="text-xs font-mono text-slate-500 truncate">
                          @{arch.handle}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleFollow(arch.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 flex-shrink-0 ${
                        arch.isFollowing
                          ? "bg-slate-100 text-slate-800 hover:bg-slate-200"
                          : "bg-[#1265DD] hover:bg-blue-700 text-white"
                      }`}
                    >
                      {arch.isFollowing ? (
                        <>
                          <Check size={13} weight="bold" />
                          <span>Abonné</span>
                        </>
                      ) : (
                        <>
                          <UserPlus size={13} weight="bold" />
                          <span>Suivre</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="text-xs text-slate-600 leading-relaxed">
                    {arch.bio}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Buildings size={13} className="text-slate-400" />
                      {arch.company}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin size={13} className="text-slate-400" />
                      {arch.location}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {arch.specialties.map((spec) => (
                      <span
                        key={spec}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700"
                      >
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Compteurs Followers / Following / Publications */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3 font-mono text-[11px] text-slate-600">
                    <span>
                      <strong className="text-slate-950">{arch.followers}</strong> abonnés
                    </span>
                    <span>
                      <strong className="text-slate-950">{arch.following}</strong> suivis
                    </span>
                    <span>
                      <strong className="text-slate-950">{arch.publishedBlueprintsCount}</strong> archis
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedProfile(arch)}
                    className="text-xs font-medium text-[#1265DD] hover:underline cursor-pointer"
                  >
                    Profil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* FICHE PROFIL D'UN UTILISATEUR (Modal d'inspection & d'échange)      */}
      {/* =================================================================== */}
      {selectedProfile && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 border border-slate-200 shadow-xl space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <span
                  style={{ backgroundColor: selectedProfile.color }}
                  className="w-12 h-12 rounded-full text-white text-base font-bold flex items-center justify-center flex-shrink-0"
                >
                  {selectedProfile.initials}
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-950">
                    {selectedProfile.name}
                  </h2>
                  <div className="text-xs font-mono text-slate-500">
                    @{selectedProfile.handle} · {selectedProfile.role}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedProfile(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {selectedProfile.bio}
            </p>

            {/* Statistiques sociales */}
            <div className="grid grid-cols-4 gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-center font-mono">
              <div>
                <div className="text-sm font-bold text-slate-950">
                  {selectedProfile.followers}
                </div>
                <div className="text-[10px] text-slate-500">Abonnés</div>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-950">
                  {selectedProfile.following}
                </div>
                <div className="text-[10px] text-slate-500">Abonnements</div>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-950">
                  {selectedProfile.publishedBlueprintsCount}
                </div>
                <div className="text-[10px] text-slate-500">Modèles</div>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-950">
                  {selectedProfile.forksReceived}
                </div>
                <div className="text-[10px] text-slate-500">Forks</div>
              </div>
            </div>

            {/* Spécialités */}
            <div>
              <div className="text-xs font-semibold text-slate-800 mb-1.5">
                Stacks et spécialités
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedProfile.specialties.map((s) => (
                  <span
                    key={s}
                    className="text-[11px] font-mono px-2.5 py-1 rounded bg-slate-100 text-slate-800"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Actions sociales : Suivre ou Inviter dans une équipe projet */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2.5">
              <Link
                href="/studio?tab=team"
                className="flex-1 py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium text-center transition-colors"
              >
                Inviter dans mon équipe projet
              </Link>
              <button
                type="button"
                onClick={() => toggleFollow(selectedProfile.id)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  selectedProfile.isFollowing
                    ? "bg-slate-900 text-white"
                    : "bg-[#1265DD] hover:bg-blue-700 text-white"
                }`}
              >
                {selectedProfile.isFollowing ? (
                  <>
                    <Check size={14} weight="bold" />
                    <span>Abonné</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={14} weight="bold" />
                    <span>Suivre @{selectedProfile.handle}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de publication */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 border border-slate-200 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h2 className="text-base font-bold text-slate-950">
                Publier une architecture
              </h2>
              <button
                type="button"
                onClick={() => setShowPublishModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handlePublish} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-800 mb-1">
                  Titre
                </label>
                <input
                  type="text"
                  required
                  value={pubTitle}
                  onChange={(e) => setPubTitle(e.target.value)}
                  placeholder="ex: Architecture Event-Driven Multi-Tenant"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-[#1265DD] focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-800 mb-1">
                    Domaine
                  </label>
                  <select
                    value={pubSector}
                    onChange={(e) =>
                      setPubSector(e.target.value as BlueprintItem["sector"])
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900"
                  >
                    <option value="Microservices">Microservices</option>
                    <option value="FinTech">FinTech</option>
                    <option value="IA & RAG">IA &amp; RAG</option>
                    <option value="E-Commerce">E-Commerce</option>
                    <option value="Temps Réel">Temps Réel</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-800 mb-1">
                    Tag Git
                  </label>
                  <input
                    type="text"
                    value={pubTag}
                    onChange={(e) => setPubTag(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-800 mb-1">
                  Stack technique
                </label>
                <input
                  type="text"
                  value={pubStack}
                  onChange={(e) => setPubStack(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-800 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={pubSummary}
                  onChange={(e) => setPubSummary(e.target.value)}
                  placeholder="Décrivez les choix d'architecture et les sous-graphes réutilisables..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-[#1265DD] focus:bg-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPublishModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#1265DD] hover:bg-blue-700 text-white font-medium cursor-pointer"
                >
                  Publier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
