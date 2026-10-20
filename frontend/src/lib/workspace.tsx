"use client";

import { useCallback, useSyncExternalStore } from "react";
import { WORKSPACE_PROJECTS, type WorkspaceProject } from "@/lib/lonkoo-data";

/**
 * Projets de l'utilisateur et projet actif.
 *
 * Tant que l'API n'est pas branchée (GET/POST/PATCH /api/projects, voir docs/ROADMAP-BACKEND.md),
 * les projets viennent de lonkoo-data.ts et les modifications sont gardées dans le navigateur.
 */

const STORAGE_KEY = "lonkoo.workspace.v1";

interface WorkspaceState {
  projects: WorkspaceProject[];
  activeSlug: string;
}

export interface NewProjectInput {
  name: string;
  description?: string;
  visibility: "public" | "private";
  githubRepo?: string;
  stack: string[];
  owner: { login: string; initials: string; name: string };
}

const SEED_STATE: WorkspaceState = {
  projects: WORKSPACE_PROJECTS,
  activeSlug: WORKSPACE_PROJECTS[0]?.slug ?? "",
};

let state: WorkspaceState = SEED_STATE;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    if (Array.isArray(parsed.projects) && parsed.projects.length > 0) {
      const activeSlug = parsed.projects.some((p) => p.slug === parsed.activeSlug)
        ? (parsed.activeSlug as string)
        : (parsed.projects[0]?.slug ?? "");
      state = { projects: parsed.projects, activeSlug };
    }
  } catch {
    // Données illisibles : on repart des projets d'exemple.
  }
}

function commit(next: WorkspaceState) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Stockage indisponible : les changements durent le temps de la session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): WorkspaceState {
  hydrate();
  return state;
}

const getServerSnapshot = (): WorkspaceState => SEED_STATE;

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function useWorkspace() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const activeProject =
    snapshot.projects.find((project) => project.slug === snapshot.activeSlug) ?? snapshot.projects[0] ?? null;

  const setActiveProjectSlug = useCallback((slug: string) => {
    if (slug === state.activeSlug || !state.projects.some((project) => project.slug === slug)) return;
    commit({ ...state, activeSlug: slug });
  }, []);

  const createProject = useCallback((input: NewProjectInput): WorkspaceProject => {
    const base = slugify(input.name) || "projet";
    let slug = base;
    for (let n = 2; state.projects.some((project) => project.slug === slug); n++) slug = `${base}-${n}`;

    const created: WorkspaceProject = {
      id: `proj-${slug}`,
      slug,
      name: slug,
      description:
        input.description?.trim() || "Architecture collaborative avec gestion de versions et d'équipe.",
      visibility: input.visibility,
      branch: "main",
      gitTag: "", // aucune release tant qu'une version n'est pas publiée
      githubRepo: input.githubRepo?.includes("/") ? input.githubRepo : `${input.owner.login}/${slug}`,
      stack: input.stack,
      aiScore: 0,
      updatedAt: "À l'instant",
      collaborators: [{ initials: input.owner.initials, name: input.owner.name, role: "Owner", color: "#1265DD" }],
      nodesCount: 0,
      openReviewsCount: 0,
      mcpActive: false,
      orionSynced: false,
    };
    commit({ projects: [created, ...state.projects], activeSlug: created.slug });
    return created;
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    commit({
      ...state,
      projects: state.projects.map((project) =>
        project.id === id
          ? { ...project, visibility: project.visibility === "public" ? "private" : "public" }
          : project,
      ),
    });
  }, []);

  return {
    projects: snapshot.projects,
    activeProject,
    setActiveProjectSlug,
    createProject,
    toggleVisibility,
  };
}
