"use client";

import React, { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { DemoNotice } from "@/components/ui/DemoNotice";
import {
  WORKSPACE_PROJECTS,
  COMMUNITY_ARCHITECTS,
  type BlueprintItem,
  type BlueprintComment,
} from "@/lib/lonkoo-data";
import {
  GitFork,
  Star,
  Tag,
  GithubLogo,
  CheckCircle,
  Cube,
  ChatCircleDots,
  ArrowRight,
  LockKey,
  Globe,
  UserPlus,
  Check,
} from "@phosphor-icons/react";

export function BlueprintDetailClient({ blueprint }: { blueprint: BlueprintItem }) {
  const [forkMode, setForkMode] = useState<"full" | "partial">("partial");
  const [selectedModules, setSelectedModules] = useState<string[]>(
    blueprint.modules[0] ? [blueprint.modules[0].id] : []
  );
  const [targetProject, setTargetProject] = useState<string>("new-project");
  const [forkVisibility, setForkVisibility] = useState<"public" | "private">("private");
  const [forkSuccess, setForkSuccess] = useState<string | null>(null);
  const [forksCount, setForksCount] = useState<number>(blueprint.forks);

  const initialArch =
    COMMUNITY_ARCHITECTS.find(
      (a) => a.name.toLowerCase() === blueprint.author.toLowerCase()
    ) ?? COMMUNITY_ARCHITECTS[0]!;
  const [isFollowingAuthor, setIsFollowingAuthor] = useState<boolean>(
    initialArch.isFollowing
  );
  const [authorFollowers, setAuthorFollowers] = useState<number>(initialArch.followers);

  const [comments, setComments] = useState<BlueprintComment[]>(blueprint.comments);
  const [userRating, setUserRating] = useState<number>(5);
  const [commentText, setCommentText] = useState<string>("");

  const toggleModule = (modId: string) => {
    setSelectedModules((prev) =>
      prev.includes(modId) ? prev.filter((id) => id !== modId) : [...prev, modId]
    );
  };

  const handleToggleFollow = () => {
    setIsFollowingAuthor((prev) => {
      const next = !prev;
      setAuthorFollowers((f) => (next ? f + 1 : f - 1));
      return next;
    });
  };

  const handleFork = () => {
    setForksCount((c) => c + 1);
    if (forkMode === "full") {
      setForkSuccess(
        `Architecture "${blueprint.title}" (${blueprint.nodes.length} composants) forkée en mode ${
          forkVisibility === "public" ? "Public" : "Privé"
        }.`
      );
    } else {
      const names = blueprint.modules
        .filter((m) => selectedModules.includes(m.id))
        .map((m) => m.name)
        .join(" + ");
      setForkSuccess(
        `Sous-graphe (${names || "1 module"}) importé dans ${
          targetProject === "new-project" ? "un nouveau projet" : targetProject
        }.`
      );
    }
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    const newComment: BlueprintComment = {
      id: `c-${Date.now()}`,
      author: "Aminata S.",
      role: "Lead Architect",
      avatar: "AS",
      rating: userRating,
      date: "À l'instant",
      comment: commentText.trim(),
      versionTested: blueprint.gitTag,
    };
    setComments((prev) => [newComment, ...prev]);
    setCommentText("");
  };

  return (
    <>
      <PageHeader
        title={blueprint.title}
        actions={
          <Link
            href={`/studio?project=${blueprint.slug}`}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-brand hover:bg-brand-hover text-white transition-colors flex items-center gap-1.5"
          >
            <span>Ouvrir dans le Studio</span>
            <ArrowRight size={13} />
          </Link>
        }
      />
      <div className="max-w-6xl mx-auto space-y-6">
        <DemoNotice>cette architecture, ses notes et ses commentaires sont des exemples fictifs.</DemoNotice>
        {/* En-tête */}
        <div className="bg-surface rounded-xl p-6 border border-edge">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-5 border-b border-edge-soft">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Link
                  href="/palabre"
                  className="font-medium text-ink-3 hover:text-ink"
                >
                  ← Communauté
                </Link>
                <span className="text-ink-4">/</span>
                <span className="font-mono px-2 py-0.5 rounded bg-subtle text-ink-2 text-[11px] font-medium">
                  {blueprint.sector}
                </span>
                <span className="font-mono text-ink-3 text-[11px] flex items-center gap-1">
                  <Tag size={12} />
                  {blueprint.gitTag}
                </span>
              </div>

              <h1 className="text-lg sm:text-xl font-bold text-ink">
                {blueprint.title}
              </h1>
              <p className="text-xs sm:text-sm text-ink-2 max-w-3xl leading-relaxed">
                {blueprint.summary}
              </p>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="px-3 py-2 rounded-lg bg-sunken border border-edge text-xs font-mono flex items-center gap-1.5">
                <Star size={14} weight="fill" className="text-warn" />
                <span className="font-bold text-ink">{blueprint.stars.toFixed(1)}</span>
                <span className="text-ink-4">
                  ({blueprint.ratingsCount + comments.length - blueprint.comments.length})
                </span>
              </div>

              <div className="px-3 py-2 rounded-lg bg-sunken border border-edge text-xs font-mono flex items-center gap-1.5">
                <GitFork size={14} className="text-ink-3" />
                <span className="font-bold text-ink">{forksCount}</span>
                <span className="text-ink-4">forks</span>
              </div>
            </div>
          </div>

          {/* Barre Auteur + Métriques */}
          <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-3">
              <span
                style={{ backgroundColor: initialArch.color }}
                className="w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
              >
                {initialArch.initials}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink">{blueprint.author}</span>
                  <span className="font-mono text-ink-4">@{initialArch.handle}</span>
                </div>
                <div className="text-[11px] text-ink-3">
                  {blueprint.authorRole} · {authorFollowers} abonnés
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleFollow}
                className={`ml-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                  isFollowingAuthor
                    ? "bg-subtle text-ink-2 hover:bg-strong"
                    : "bg-brand hover:bg-brand-hover text-white"
                }`}
              >
                {isFollowingAuthor ? (
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

            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-ink-2">
              <span className="flex items-center gap-1.5">
                <GithubLogo size={14} className="text-ink" />
                {blueprint.githubRepo}
              </span>
              <span>Pattern: {blueprint.architecturePattern}</span>
            </div>
          </div>
        </div>

        {/* Section Fork & Composants */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Colonne Gauche : Fork Complet ou Partiel */}
          <div className="lg:col-span-7 bg-surface rounded-xl p-5 border border-edge space-y-5">
            <div className="pb-3 border-b border-edge-soft">
              <h2 className="text-sm font-bold text-ink">
                Réutiliser cette architecture (Fork)
              </h2>
              <p className="text-xs text-ink-3 mt-0.5">
                Importez l&apos;architecture complète ou sélectionnez uniquement certains sous-graphes.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <button
                type="button"
                onClick={() => setForkMode("partial")}
                className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  forkMode === "partial"
                    ? "bg-sunken border-2 border-accent"
                    : "bg-surface border-edge hover:bg-sunken"
                }`}
              >
                <div className="font-bold text-ink flex items-center justify-between mb-1">
                  <span>Fork partiel (Sous-graphes)</span>
                  <Cube size={15} className="text-accent" />
                </div>
                <p className="text-[11px] text-ink-3">
                  Extrayez uniquement les briques souhaitées dans un projet existant.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setForkMode("full")}
                className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  forkMode === "full"
                    ? "bg-sunken border-2 border-accent"
                    : "bg-surface border-edge hover:bg-sunken"
                }`}
              >
                <div className="font-bold text-ink flex items-center justify-between mb-1">
                  <span>Fork complet</span>
                  <GitFork size={15} className="text-accent" />
                </div>
                <p className="text-[11px] text-ink-3">
                  Clone les {blueprint.nodes.length} composants, la stack et la documentation.
                </p>
              </button>
            </div>

            {forkMode === "partial" && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-ink-2">
                  Sous-graphes disponibles :
                </div>
                {blueprint.modules.map((mod) => {
                  const checked = selectedModules.includes(mod.id);
                  return (
                    <label
                      key={mod.id}
                      onClick={() => toggleModule(mod.id)}
                      className={`p-3.5 rounded-lg border flex items-start justify-between gap-3 cursor-pointer transition-colors ${
                        checked
                          ? "bg-sunken border-accent"
                          : "bg-surface border-edge hover:border-edge-strong"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}}
                          className="mt-0.5 accent-accent"
                        />
                        <div>
                          <div className="text-xs font-bold text-ink">{mod.name}</div>
                          <p className="text-[11px] text-ink-3 mt-0.5">{mod.description}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {mod.stack.map((st) => (
                              <span
                                key={st}
                                className="text-[11px] font-mono px-2 py-0.5 rounded bg-subtle text-ink-2"
                              >
                                {st}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-ink-4 whitespace-nowrap">
                        {mod.estimatedSetup}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
              <div>
                <label className="block font-medium text-ink-2 mb-1">
                  Projet de destination
                </label>
                <select
                  value={targetProject}
                  onChange={(e) => setTargetProject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-ink font-mono"
                >
                  <option value="new-project">+ Nouveau projet</option>
                  {WORKSPACE_PROJECTS.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name} ({p.gitTag})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-ink-2 mb-1">
                  Visibilité
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForkVisibility("private")}
                    className={`py-2 px-3 rounded-lg border font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                      forkVisibility === "private"
                        ? "bg-inverse border-ink text-inverse-ink"
                        : "bg-sunken border-edge text-ink-2"
                    }`}
                  >
                    <LockKey size={13} />
                    <span>Privé</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForkVisibility("public")}
                    className={`py-2 px-3 rounded-lg border font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                      forkVisibility === "public"
                        ? "bg-inverse border-ink text-inverse-ink"
                        : "bg-sunken border-edge text-ink-2"
                    }`}
                  >
                    <Globe size={13} />
                    <span>Public</span>
                  </button>
                </div>
              </div>
            </div>

            {forkSuccess && (
              <div className="p-3 rounded-lg bg-sunken border border-edge text-ink text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle size={16} weight="fill" className="text-ok flex-shrink-0" />
                  <span>{forkSuccess}</span>
                </div>
                <Link
                  href="/studio"
                  className="px-3 py-1 rounded bg-brand text-white font-medium whitespace-nowrap"
                >
                  Ouvrir Studio →
                </Link>
              </div>
            )}

            <button
              type="button"
              onClick={handleFork}
              className="w-full py-2.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <GitFork size={15} weight="bold" />
              <span>
                {forkMode === "full"
                  ? "Forker l'architecture complète"
                  : `Importer (${selectedModules.length}) dans mon projet`}
              </span>
            </button>
          </div>

          {/* Colonne Droite : Composants */}
          <div className="lg:col-span-5 bg-surface rounded-xl p-5 border border-edge space-y-3">
            <h2 className="text-sm font-bold text-ink pb-3 border-b border-edge-soft">
              Composants ({blueprint.nodes.length})
            </h2>
            <div className="space-y-2.5">
              {blueprint.nodes.map((node) => (
                <div
                  key={node.id}
                  className="p-3 rounded-lg bg-sunken border border-edge flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="text-xs font-bold text-ink">{node.title}</div>
                    <p className="text-[11px] text-ink-3 mt-0.5">{node.description}</p>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface text-ink-2 border border-edge whitespace-nowrap">
                    {node.tech} {node.version}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Avis & Commentaires */}
        <div className="bg-surface rounded-xl p-5 border border-edge space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-edge-soft">
            <div className="flex items-center gap-2">
              <ChatCircleDots size={16} className="text-ink-2" weight="bold" />
              <h2 className="text-sm font-bold text-ink">
                Commentaires et retours ({comments.length})
              </h2>
            </div>
          </div>

          <form
            onSubmit={handleAddComment}
            className="p-3.5 rounded-lg bg-sunken border border-edge space-y-3 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-ink-2">Note :</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setUserRating(star)}
                    className="p-0.5 cursor-pointer"
                  >
                    <Star
                      size={16}
                      weight={star <= userRating ? "fill" : "regular"}
                      className={
                        star <= userRating ? "text-warn" : "text-ink-4"
                      }
                    />
                  </button>
                ))}
                <span className="ml-1.5 font-mono font-bold text-ink-2">
                  {userRating}/5
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Ajouter un commentaire technique..."
                className="flex-1 px-3 py-2 rounded-lg bg-surface border border-edge text-ink focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-hover text-white font-medium cursor-pointer whitespace-nowrap"
              >
                Commenter
              </button>
            </div>
          </form>

          <div className="space-y-2.5">
            {comments.map((c) => (
              <div
                key={c.id}
                className="p-3.5 rounded-lg border border-edge bg-surface flex items-start gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-inverse text-inverse-ink text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {c.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <div>
                      <span className="text-xs font-bold text-ink">{c.author}</span>
                      <span className="text-[11px] text-ink-4 ml-2">{c.role}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-ink-3">
                      <span className="text-ink font-bold flex items-center gap-0.5">
                        <Star size={11} weight="fill" className="text-warn" />
                        {c.rating}/5
                      </span>
                      <span>·</span>
                      <span>{c.versionTested}</span>
                      <span>·</span>
                      <span>{c.date}</span>
                    </div>
                  </div>
                  <p className="text-xs text-ink-2 leading-relaxed">{c.comment}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
