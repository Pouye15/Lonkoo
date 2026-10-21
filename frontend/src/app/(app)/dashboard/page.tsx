"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  FolderSimplePlus,
  GitBranch,
  GitFork,
  GithubLogo,
  Globe,
  LockKey,
  MagnifyingGlass,
  Plus,
  Tag,
  Users,
} from "@phosphor-icons/react";
import { ARCHITECTURE_REVIEWS } from "@/lib/lonkoo-data";
import { IS_LIVE_API, messageOf } from "@/lib/api";
import { cn } from "@/lib/cn";
import { initialsOf, useSession } from "@/lib/session";
import { slugify, useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, inputClass, textareaClass } from "@/components/ui/Field";

type FilterVisibility = "all" | "public" | "private" | "forks";

function StatTile({ label, value, hint }: { label: string; value: React.ReactNode; hint: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-edge bg-surface p-4">
      <div className="text-sm text-ink-3">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</div>
      <div className="mt-1 text-xs text-ink-3">{hint}</div>
    </div>
  );
}

function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useSession();
  const { createProject } = useWorkspace();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !user || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createProject({
        name,
        description,
        visibility,
        stack: [],
        owner: { login: user.login, initials: initialsOf(user.displayName), name: user.displayName },
      });
      setName("");
      setDescription("");
      setVisibility("private");
      onClose();
      router.push(`/studio?project=${created.slug}`);
    } catch (failure) {
      // Limite atteinte (409), session expirée, serveur injoignable : le dialogue reste ouvert avec le message.
      setError(messageOf(failure));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nouveau projet">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field
          label="Nom du projet"
          htmlFor="project-name"
          hint={name.trim() ? `Identifiant du projet : ${slugify(name) || "projet"}` : "Comme un dépôt : minuscules et tirets."}
        >
          <input
            id="project-name"
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="ex. marketplace-mobile"
            className={cn(inputClass, "font-mono")}
          />
        </Field>

        <Field label="Description" htmlFor="project-description" hint="Facultatif.">
          <textarea
            id="project-description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ce que le système doit faire"
            className={textareaClass}
          />
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">Visibilité</legend>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { value: "private", label: "Privé", hint: "Réservé à votre équipe", icon: LockKey },
                { value: "public", label: "Public", hint: "Visible par la communauté", icon: Globe },
              ] as const
            ).map(({ value, label, hint, icon: Icon }) => {
              const selected = visibility === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setVisibility(value)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    selected ? "border-accent bg-sunken ring-1 ring-accent" : "border-edge bg-surface hover:border-edge-strong",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Icon size={16} />
                    {label}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-3">{hint}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-lg border border-edge-strong bg-sunken px-3 py-2 text-sm text-ink">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-edge-soft pt-4">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={!name.trim() || submitting}>
            {submitting ? "Création…" : "Créer le projet"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function DashboardPage() {
  const { projects, toggleVisibility, status, error, clearError, reload } = useWorkspace();
  const router = useRouter();
  const search = useSearchParams();
  const [filter, setFilter] = useState<FilterVisibility>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const openFromUrl = search.get("new") === "1";
  const modalOpen = creating || openFromUrl;
  const closeModal = () => {
    setCreating(false);
    if (openFromUrl) router.replace("/dashboard");
  };

  const counts = useMemo(
    () => ({
      all: projects.length,
      public: projects.filter((p) => p.visibility === "public").length,
      private: projects.filter((p) => p.visibility === "private").length,
      forks: projects.filter((p) => Boolean(p.forkedFrom)).length,
    }),
    [projects],
  );

  const stats = useMemo(() => {
    const members = new Set(projects.flatMap((p) => p.collaborators.map((c) => c.name)));
    return {
      blocks: projects.reduce((sum, p) => sum + p.nodesCount, 0),
      members: members.size,
      openReviews: ARCHITECTURE_REVIEWS.filter((review) => review.status === "open").length,
    };
  }, [projects]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (filter === "public" && p.visibility !== "public") return false;
      if (filter === "private" && p.visibility !== "private") return false;
      if (filter === "forks" && !p.forkedFrom) return false;
      if (!needle) return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle) ||
        p.stack.some((tech) => tech.toLowerCase().includes(needle))
      );
    });
  }, [projects, filter, query]);

  return (
    <>
      <PageHeader
        title="Projets"
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} weight="bold" />
            Nouveau projet
          </Button>
        }
      />

      <div className="mx-auto max-w-6xl space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatTile
            label="Projets"
            value={counts.all}
            hint={`${counts.public} public${counts.public > 1 ? "s" : ""} · ${counts.private} privé${counts.private > 1 ? "s" : ""}`}
          />
          <StatTile label="Blocs modélisés" value={stats.blocks} hint="Tous projets confondus" />
          <StatTile label="Collaborateurs" value={stats.members} hint="Personnes dans vos équipes" />
          <StatTile
            label="Revues ouvertes"
            value={stats.openReviews}
            hint={
              <Link href="/reviews" className="font-medium text-accent hover:underline">
                Voir les revues
              </Link>
            }
          />
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-edge bg-surface p-3 md:flex-row md:items-center md:justify-between">
          <div role="group" aria-label="Filtrer les projets" className="flex items-center gap-1 overflow-x-auto rounded-lg bg-subtle p-1">
            {(
              [
                { id: "all", label: "Tous" },
                { id: "public", label: "Publics" },
                { id: "private", label: "Privés" },
                { id: "forks", label: "Forks" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={filter === tab.id}
                onClick={() => setFilter(tab.id)}
                className={cn(
                  "flex-shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  filter === tab.id ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink",
                )}
              >
                {tab.label} <span className="ml-0.5 font-mono text-xs text-ink-3">{counts[tab.id]}</span>
              </button>
            ))}
          </div>

          <div className="relative md:w-80">
            <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un projet ou une technologie"
              aria-label="Rechercher un projet ou une technologie"
              className={cn(inputClass, "h-9 pl-9")}
            />
          </div>
        </div>

        {error && status === "ready" && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-edge-strong bg-sunken px-4 py-2.5 text-sm text-ink">
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={clearError}>
              Fermer
            </Button>
          </div>
        )}

        {status === "loading" || status === "idle" ? (
          <p role="status" className="rounded-xl border border-edge bg-surface px-6 py-14 text-center text-sm text-ink-3">
            Chargement de vos projets…
          </p>
        ) : status === "error" ? (
          <div role="alert" className="flex flex-col items-center rounded-xl border border-dashed border-edge-strong bg-surface px-6 py-14 text-center">
            <h2 className="text-base font-semibold text-ink">Impossible de lire vos projets</h2>
            <p className="mt-1 max-w-sm text-sm text-ink-3">{error}</p>
            <Button size="sm" className="mt-5" onClick={() => void reload()}>
              Réessayer
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-edge-strong bg-surface px-6 py-14 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-subtle text-ink-2">
              <FolderSimplePlus size={22} />
            </span>
            <h2 className="mt-4 text-base font-semibold text-ink">Aucun projet ne correspond</h2>
            <p className="mt-1 max-w-sm text-sm text-ink-3">
              Modifiez les filtres ou créez un projet pour commencer à dessiner votre architecture.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {(filter !== "all" || query) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  Réinitialiser les filtres
                </Button>
              )}
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus size={14} weight="bold" />
                Nouveau projet
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-5">
            {filtered.map((project) => {
              const Visibility = project.visibility === "public" ? Globe : LockKey;
              return (
                <article
                  key={project.id}
                  className="flex flex-col justify-between rounded-xl border border-edge bg-surface p-5 transition-colors hover:border-edge-strong"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/studio?project=${project.slug}`}
                            className="truncate font-mono text-base font-semibold text-ink transition-colors hover:text-accent"
                          >
                            {project.name}
                          </Link>
                          <button
                            type="button"
                            onClick={() => toggleVisibility(project.id)}
                            title="Basculer entre public et privé"
                            className="inline-flex items-center gap-1 rounded-md bg-subtle px-2 py-0.5 text-xs font-medium text-ink-2 transition-colors hover:bg-strong"
                          >
                            <Visibility size={12} />
                            {project.visibility === "public" ? "Public" : "Privé"}
                          </button>
                        </div>
                        {project.forkedFrom && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-3">
                            <GitFork size={12} />
                            Fork de
                            <Link href="/palabre" className="font-mono font-medium text-ink-2 hover:text-accent hover:underline">
                              {project.forkedFrom}
                            </Link>
                          </div>
                        )}
                      </div>
                      {(!IS_LIVE_API || project.nodesCount > 0) && (
                        <span className="flex-shrink-0 font-mono text-xs text-ink-3">{project.nodesCount} blocs</span>
                      )}
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-ink-2">{project.description}</p>

                    {project.stack.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {project.stack.map((tech) => (
                          <span key={tech} className="rounded-md bg-subtle px-2 py-0.5 font-mono text-xs text-ink-2">
                            {tech}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sunken px-3 py-2 font-mono text-xs text-ink-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <GithubLogo size={14} className="flex-shrink-0 text-ink" />
                        <span className="truncate">{project.githubRepo}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <GitBranch size={13} className="text-ink-3" />
                          {project.branch}
                        </span>
                        {project.gitTag && (
                          <span className="flex items-center gap-1">
                            <Tag size={13} className="text-ink-3" />
                            {project.gitTag}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-edge-soft pt-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex -space-x-1.5">
                        {project.collaborators.map((member) => (
                          <span
                            key={member.initials + member.name}
                            title={`${member.name} (${member.role})`}
                            style={{ backgroundColor: member.color }}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-surface"
                          >
                            {member.initials}
                          </span>
                        ))}
                      </div>
                      <span className="text-xs text-ink-3">{project.updatedAt}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button href={`/studio?project=${project.slug}&tab=team`} variant="secondary" size="sm">
                        <Users size={14} />
                        Équipe ({project.collaborators.length})
                      </Button>
                      <Button href={`/studio?project=${project.slug}`} size="sm">
                        Ouvrir
                        <ArrowRight size={13} weight="bold" />
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <NewProjectModal open={modalOpen} onClose={closeModal} />
    </>
  );
}
