"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  IS_LIVE_API,
  apiFetch,
  messageOf,
  relativeTime,
  type ApiCanvas,
  type ApiProject,
  type ApiRole,
} from "@/lib/api";
import { initialsOf } from "@/lib/initials";
import { canChangeVisibility, isProjectId } from "@/lib/public-projects";
import { WORKSPACE_PROJECTS, type GitHubRole, type WorkspaceProject } from "@/lib/lonkoo-data";

/**
 * Projets de l'utilisateur et projet actif.
 *
 * Mode simulé (par défaut) : les projets viennent de lonkoo-data.ts et les modifications sont gardées dans
 * le navigateur. Mode API (`NEXT_PUBLIC_API_MODE=live`) : GET/POST/PATCH /api/projects, voir docs/openapi.yaml.
 */

const STORAGE_KEY = "lonkoo.workspace.v1";

/** `idle` : rien n'a encore été demandé ; `loading` : première lecture ; `ready` ; `error` : la lecture a échoué. */
export type WorkspaceStatus = "idle" | "loading" | "ready" | "error";

interface WorkspaceState {
  projects: WorkspaceProject[];
  activeSlug: string;
  status: WorkspaceStatus;
  error: string | null;
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
  status: "ready",
  error: null,
};

/** Mode API : aucun projet tant que le serveur n'a pas répondu (jamais ceux de démonstration). */
const LIVE_INITIAL: WorkspaceState = { projects: [], activeSlug: "", status: "idle", error: null };

let state: WorkspaceState = IS_LIVE_API ? LIVE_INITIAL : SEED_STATE;
let hydrated = false;
const listeners = new Set<() => void>();

/** Un projet lu dans le navigateur peut venir d'une ancienne version ou avoir été modifié à la main. */
function isValidProject(value: unknown): value is WorkspaceProject {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<WorkspaceProject>;
  return (
    typeof p.id === "string" &&
    typeof p.slug === "string" &&
    typeof p.name === "string" &&
    typeof p.description === "string" &&
    (p.visibility === "public" || p.visibility === "private") &&
    typeof p.githubRepo === "string" &&
    typeof p.branch === "string" &&
    typeof p.gitTag === "string" &&
    Array.isArray(p.stack) &&
    Array.isArray(p.collaborators) &&
    typeof p.nodesCount === "number"
  );
}

function readStored(): WorkspaceState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    if (!Array.isArray(parsed.projects)) return null;
    const projects = parsed.projects.filter(isValidProject);
    if (projects.length === 0) return null;
    const activeSlug = projects.some((p) => p.slug === parsed.activeSlug)
      ? (parsed.activeSlug as string)
      : (projects[0]?.slug ?? "");
    return { projects, activeSlug, status: "ready", error: null };
  } catch {
    return null;
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  if (IS_LIVE_API) return;
  state = readStored() ?? SEED_STATE;
}

function notify() {
  listeners.forEach((listener) => listener());
}

/** Applique un nouvel état ; en mode simulé il est aussi gardé dans le navigateur. */
function commit(next: WorkspaceState) {
  state = next;
  if (!IS_LIVE_API) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects: next.projects, activeSlug: next.activeSlug }));
    } catch {
      // Stockage indisponible : les changements durent le temps de la session.
    }
  }
  notify();
}

/** Remet l'état d'origine (déconnexion) : projets d'exemple en mode simulé, liste vide en mode API. */
export function resetWorkspace() {
  pendingProject = null;
  resetState();
}

function resetState() {
  loadToken += 1;
  state = IS_LIVE_API ? LIVE_INITIAL : SEED_STATE;
  hydrated = true;
  if (!IS_LIVE_API) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Stockage indisponible : rien à effacer.
    }
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (IS_LIVE_API) return () => void listeners.delete(listener);
  // Une autre fenêtre a modifié les projets : on repart de son état plutôt que de l'écraser.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    state = readStored() ?? SEED_STATE;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): WorkspaceState {
  hydrate();
  return state;
}

const getServerSnapshot = (): WorkspaceState => (IS_LIVE_API ? LIVE_INITIAL : SEED_STATE);

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ------------------------------------------------------------------ */
/* Mode API                                                             */
/* ------------------------------------------------------------------ */

interface LiveUser {
  id: string;
  login: string;
  displayName: string;
}

let me: LiveUser | null = null;
let loadToken = 0;
/** Projet demandé par l'URL (nom court ou identifiant) avant que la liste soit lue : retenu jusqu'à son arrivée. */
let pendingProject: string | null = null;

const matches = (project: WorkspaceProject, key: string) => project.slug === key || project.id === key;

const ROLE_LABEL: Record<ApiRole, GitHubRole> = {
  OWNER: "Owner",
  MAINTAINER: "Maintainer",
  WRITE: "Write",
  TRIAGE: "Triage",
  READ: "Read",
};

const DEFAULT_DESCRIPTION = "Architecture collaborative avec gestion de versions et d'équipe.";
const MAX_CANVAS_LOOKUPS = 30;

/** Comme un dépôt, un projet est désigné par son identifiant : le nom, puis le début de l'identifiant du serveur. */
function slugOf(api: ApiProject): string {
  return `${slugify(api.name) || "projet"}-${api.id.slice(0, 6)}`;
}

function toProject(api: ApiProject, previous?: WorkspaceProject): WorkspaceProject {
  const slug = slugOf(api);
  const ownerIsMe = me?.id === api.ownerId;
  const role = previous?.role ?? (ownerIsMe ? "Owner" : undefined);
  const mine = me
    ? { initials: initialsOf(me.displayName), name: me.displayName, color: "#1265DD" }
    : { initials: "?", name: "Moi", color: "#1265DD" };
  const collaborators = ownerIsMe
    ? [{ ...mine, role: "Owner" }]
    : [
        { initials: "··", name: "Propriétaire", role: "Owner", color: "#64748B" },
        ...(role ? [{ ...mine, role }] : []),
      ];

  return {
    id: api.id,
    slug,
    name: api.name,
    description: api.description?.trim() || DEFAULT_DESCRIPTION,
    visibility: api.visibility,
    branch: "main",
    gitTag: "",
    githubRepo: `${api.ownerLogin || me?.login || "lonkoo"}/${slugify(api.name) || "projet"}`,
    stack: [],
    aiScore: 0,
    updatedAt: relativeTime(api.updatedAt),
    collaborators,
    nodesCount: previous?.nodesCount ?? 0,
    openReviewsCount: 0,
    mcpActive: false,
    orionSynced: false,
    canvasId: previous?.canvasId,
    role,
  };
}

function patchProject(id: string, patch: Partial<WorkspaceProject>) {
  commit({ ...state, projects: state.projects.map((project) => (project.id === id ? { ...project, ...patch } : project)) });
}

/** Lit le canvas principal d'un projet (le plus ancien) et le rôle de l'utilisateur dans ce projet. */
async function resolveCanvasOf(project: WorkspaceProject): Promise<void> {
  const canvases = await apiFetch<ApiCanvas[]>(`/api/projects/${project.id}/canvases`);
  const first = canvases[0];
  if (!first) return;
  const current = state.projects.find((p) => p.id === project.id);
  if (!current) return;
  const role = ROLE_LABEL[first.role];
  const collaborators = current.collaborators.some((c) => c.name === "Propriétaire")
    ? [current.collaborators[0]!, { ...(current.collaborators[1] ?? { initials: "?", name: "Moi", color: "#1265DD" }), role }]
    : current.collaborators;
  patchProject(project.id, { canvasId: first.id, role, collaborators });
}

const resolving = new Set<string>();

/** Mode API : s'assure que le canvas principal du projet est connu (une seule lecture à la fois par projet). */
export function ensureCanvas(projectId: string) {
  if (!IS_LIVE_API || resolving.has(projectId)) return;
  const project = state.projects.find((p) => p.id === projectId);
  if (!project || project.canvasId) return;
  resolving.add(projectId);
  void resolveCanvasOf(project)
    .catch((error) => commit({ ...state, error: messageOf(error) }))
    .finally(() => resolving.delete(projectId));
}

/** Mode API : le nombre de blocs n'est connu qu'une fois le canvas ouvert ; on le retient pour le tableau de bord. */
export function noteBlockCount(projectId: string, count: number) {
  const project = state.projects.find((p) => p.id === projectId);
  if (project && project.nodesCount !== count) patchProject(projectId, { nodesCount: count });
}

/** Lit la liste des projets de l'utilisateur sur le serveur. */
export async function loadProjects(): Promise<void> {
  if (!IS_LIVE_API) return;
  const token = ++loadToken;
  commit({ ...state, status: state.projects.length > 0 ? state.status : "loading", error: null });
  try {
    const list = await apiFetch<ApiProject[]>("/api/projects");
    if (token !== loadToken) return;
    const before = new Map(state.projects.map((project) => [project.id, project]));
    const mine = list.map((api) => toProject(api, before.get(api.id)));
    // Les projets publics ouverts sans en être membre ne sont pas dans cette liste : on les garde tant qu'on est là.
    const visited = state.projects.filter((p) => p.visitor && !mine.some((m) => m.id === p.id));
    const projects = [...mine, ...visited];
    const requested = pendingProject;
    const wanted = requested ? projects.find((p) => matches(p, requested)) : undefined;
    pendingProject = null;
    const activeSlug =
      wanted?.slug ?? (projects.some((p) => p.slug === state.activeSlug) ? state.activeSlug : (mine[0]?.slug ?? ""));
    commit({ projects, activeSlug, status: "ready", error: null });
    // Un lien direct vers un projet public (fiche de la galerie) : il n'est pas dans la liste, on va le lire.
    if (requested && !wanted && isProjectId(requested)) void visitPublic(requested);
    await Promise.allSettled(mine.slice(0, MAX_CANVAS_LOOKUPS).map((project) => resolveCanvasOf(project)));
  } catch (error) {
    if (token === loadToken) commit({ ...state, status: "error", error: messageOf(error) });
  }
}

const visiting = new Set<string>();

/**
 * Mode API : ouvre un projet public dont la personne n'est pas membre (lien d'une fiche de la galerie), en lecture
 * seule. Il reste hors de « mes projets » (voir {@link useWorkspace}) ; s'il est privé ou inconnu, le serveur répond 404.
 */
async function visitPublic(id: string): Promise<void> {
  if (visiting.has(id)) return;
  visiting.add(id);
  try {
    const api = await apiFetch<ApiProject>(`/api/projects/${id}`);
    if (state.projects.some((p) => p.id === api.id)) return;
    const project: WorkspaceProject = { ...toProject(api), role: "Read", visitor: true };
    commit({ ...state, projects: [...state.projects, project], activeSlug: project.slug, error: null });
    void resolveCanvasOf(project).catch(() => undefined);
  } catch (error) {
    commit({ ...state, error: messageOf(error) });
  } finally {
    visiting.delete(id);
  }
}

/** À appeler à chaque changement d'utilisateur : en mode API la liste est celle de la personne connectée. */
export function setWorkspaceUser(user: LiveUser | null) {
  if (!IS_LIVE_API) return;
  const changed = me?.id !== user?.id;
  me = user;
  if (!changed) return;
  resetState();
  if (user) void loadProjects();
}

async function createLive(input: NewProjectInput): Promise<WorkspaceProject> {
  const api = await apiFetch<ApiProject>("/api/projects", {
    method: "POST",
    body: {
      name: slugify(input.name) || "projet",
      description: input.description?.trim() || undefined,
      visibility: input.visibility,
    },
  });
  const project = toProject(api);
  commit({ projects: [project, ...state.projects], activeSlug: project.slug, status: "ready", error: null });
  void resolveCanvasOf(project).catch(() => undefined);
  return project;
}

async function toggleVisibilityLive(id: string): Promise<void> {
  const current = state.projects.find((project) => project.id === id);
  if (!current) return;
  if (!canChangeVisibility(current.role)) {
    commit({ ...state, error: "Seul le propriétaire du projet peut changer sa visibilité." });
    return;
  }
  const visibility = current.visibility === "public" ? "private" : "public";
  patchProject(id, { visibility });
  try {
    await apiFetch(`/api/projects/${id}`, { method: "PATCH", body: { visibility } });
  } catch (error) {
    patchProject(id, { visibility: current.visibility });
    commit({ ...state, error: messageOf(error) });
  }
}

/* ------------------------------------------------------------------ */
/* Hook                                                                 */
/* ------------------------------------------------------------------ */

export function useWorkspace() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Les projets publics ouverts sans en être membre ne sont jamais dans « mes projets » (liste, sélecteur, compteurs),
  // mais ils peuvent être le projet actif.
  const mine = snapshot.projects.filter((project) => !project.visitor);
  const activeProject =
    snapshot.projects.find((project) => project.slug === snapshot.activeSlug) ?? mine[0] ?? null;

  const setActiveProjectSlug = useCallback((key: string) => {
    const target = state.projects.find((project) => matches(project, key));
    if (!target) {
      // La liste n'est peut-être pas encore arrivée (lien direct vers un projet) : on s'en souvient.
      if (IS_LIVE_API && state.status !== "ready") pendingProject = key;
      // Liste lue et projet absent : si c'est un identifiant, peut-être un projet public d'une autre personne.
      else if (IS_LIVE_API && isProjectId(key)) void visitPublic(key);
      return;
    }
    pendingProject = null;
    if (target.slug !== state.activeSlug) commit({ ...state, activeSlug: target.slug });
  }, []);

  const createProject = useCallback(async (input: NewProjectInput): Promise<WorkspaceProject> => {
    if (IS_LIVE_API) return createLive(input);

    const base = slugify(input.name) || "projet";
    let slug = base;
    for (let n = 2; state.projects.some((project) => project.slug === slug); n++) slug = `${base}-${n}`;

    // Comme un dépôt, un projet est désigné par son identifiant (minuscules et tirets).
    const created: WorkspaceProject = {
      id: `proj-${slug}`,
      slug,
      name: slug,
      description: input.description?.trim() || DEFAULT_DESCRIPTION,
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
    commit({ ...state, projects: [created, ...state.projects], activeSlug: created.slug });
    return created;
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    if (IS_LIVE_API) {
      void toggleVisibilityLive(id);
      return;
    }
    commit({
      ...state,
      projects: state.projects.map((project) =>
        project.id === id
          ? { ...project, visibility: project.visibility === "public" ? "private" : "public" }
          : project,
      ),
    });
  }, []);

  const clearError = useCallback(() => {
    if (state.error) commit({ ...state, error: null });
  }, []);

  return {
    projects: mine,
    /** Avec les projets publics ouverts sans en être membre : pour retrouver un projet par son nom court. */
    allProjects: snapshot.projects,
    activeProject,
    status: snapshot.status,
    error: snapshot.error,
    clearError,
    reload: loadProjects,
    setActiveProjectSlug,
    createProject,
    toggleVisibility,
  };
}
