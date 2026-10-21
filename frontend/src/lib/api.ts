/**
 * Client de l'API LONKOO (docs/openapi.yaml). Toutes les erreurs du backend sont du
 * `application/problem+json` : on les lit une fois ici et le reste de l'interface ne manipule que
 * {@link ApiError}.
 *
 * Le mode « live » (NEXT_PUBLIC_API_MODE=live, lu au build) branche l'interface sur l'API réelle ;
 * sans lui, les données simulées du navigateur tiennent lieu de backend.
 */

export const IS_LIVE_API = process.env.NEXT_PUBLIC_API_MODE === "live";

export class ApiError extends Error {
  /** 0 quand le serveur n'a pas répondu. */
  readonly status: number;
  readonly title: string;
  /** Erreurs détaillées du validateur de canvas (422). */
  readonly errors: string[];

  constructor(status: number, title: string, detail: string, errors: string[] = []) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.title = title;
    this.errors = errors;
  }
}

/** Message à montrer à l'utilisateur : le texte du serveur quand il parle de l'usage, une phrase claire sinon. */
export function messageOf(error: unknown): string {
  if (!(error instanceof ApiError)) return "Une erreur inattendue s'est produite.";
  switch (error.status) {
    case 0:
      return "Le serveur est injoignable. Réessayez dans un instant.";
    case 401:
      return "Votre session a expiré. Reconnectez-vous.";
    case 422:
      return error.errors.length > 0
        ? `Le canvas ne respecte pas le contrat : ${error.errors.slice(0, 3).join(" ; ")}${error.errors.length > 3 ? " …" : ""}`
        : error.message;
    case 429:
      return "Trop de demandes. Réessayez dans un instant.";
    case 502:
    case 503:
    case 504:
      return "Le temps réel est indisponible pour le moment. Réessayez dans un instant.";
    default:
      return error.message || "Une erreur inattendue s'est produite.";
  }
}

const UNAUTHORIZED = "lonkoo:unauthorized";

/** Abonnement aux réponses 401 (session expirée) : la session repasse alors en « anonyme ». */
export function onUnauthorized(listener: () => void): () => void {
  window.addEventListener(UNAUTHORIZED, listener);
  return () => window.removeEventListener(UNAUTHORIZED, listener);
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Un 401 est la réponse normale (ex. « suis-je connecté ? ») : il n'est pas signalé comme session expirée. */
  quiet401?: boolean;
}

async function readProblem(response: Response): Promise<ApiError> {
  let title = response.statusText || "Erreur";
  let detail = "";
  let errors: string[] = [];
  try {
    const problem = (await response.json()) as { title?: unknown; detail?: unknown; errors?: unknown };
    if (typeof problem.title === "string") title = problem.title;
    if (typeof problem.detail === "string") detail = problem.detail;
    if (Array.isArray(problem.errors)) errors = problem.errors.filter((e): e is string => typeof e === "string");
  } catch {
    // Corps absent ou illisible : le statut suffit.
  }
  return new ApiError(response.status, title, detail || title, errors);
}

/** Appelle l'API (chemin commençant par /api) et rend le JSON, ou `undefined` pour un 204. */
export async function apiFetch<T = undefined>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, quiet401 = false } = options;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(0, "Serveur injoignable", "Le serveur est injoignable.");
  }

  if (response.status === 401 && !quiet401) window.dispatchEvent(new Event(UNAUTHORIZED));
  if (!response.ok) throw await readProblem(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/* ------------------------------------------------------------------ */
/* Formes des réponses (voir docs/openapi.yaml)                         */
/* ------------------------------------------------------------------ */

export type ApiRole = "OWNER" | "MAINTAINER" | "WRITE" | "TRIAGE" | "READ";

export interface ApiProject {
  id: string;
  name: string;
  description: string | null;
  visibility: "private" | "public";
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiCanvas {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  role: ApiRole;
}

export interface ApiVersion {
  id: string;
  canvasId: string;
  name: string;
  message: string | null;
  schemaVersion: number;
  authorId: string | null;
  createdAt: string;
}

export interface ApiTicket {
  ticket: string;
  expiresAt: string;
  role: ApiRole;
  user: { name: string; color: string };
}

export interface ApiJoin {
  projectId: string;
  canvasId: string;
  role: ApiRole;
}

/** Les rôles qui n'ont pas le droit de modifier le canvas (le serveur ignore leurs écritures). */
export function isReadOnlyRole(role: ApiRole | null | undefined): boolean {
  return role === "READ" || role === "TRIAGE";
}

/** « Il y a 3 min » à partir d'une date ISO. */
export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return "À l'instant";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Hier" : `Il y a ${days} j`;
}
