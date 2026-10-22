/**
 * Appels de l'API de génération, d'envoi sur GitHub et de déploiement (lot R8, docs/openapi.yaml). Mode API
 * seulement : en mode simulé, la page « Déployer » garde son parcours de démonstration.
 */

import { ApiError, apiFetch } from "./api";
import type { Deployment, Generation, GithubStatus } from "./generation";

export function githubStatus(signal?: AbortSignal): Promise<GithubStatus> {
  return apiFetch<GithubStatus>("/api/github/status", { signal });
}

/** Lance une génération (l'état courant du canvas, ou la version donnée) et rend son identifiant. */
export async function startGeneration(canvasId: string, versionId?: string): Promise<string> {
  const result = await apiFetch<{ generationId: string }>(`/api/canvases/${canvasId}/generate`, {
    method: "POST",
    body: versionId ? { versionId } : {},
  });
  return result.generationId;
}

/** La dernière génération du canvas, avec sa liste de fichiers si elle est terminée. */
export async function latestGeneration(canvasId: string, signal?: AbortSignal): Promise<Generation | null> {
  const list = await apiFetch<Generation[]>(`/api/canvases/${canvasId}/generations`, { signal });
  const latest = list[0];
  return latest ? generation(latest.id, signal) : null;
}

export function generation(id: string, signal?: AbortSignal): Promise<Generation> {
  return apiFetch<Generation>(`/api/generations/${id}`, { signal });
}

export function pushToGithub(id: string, repoName: string, isPrivate: boolean): Promise<Generation> {
  return apiFetch<Generation>(`/api/generations/${id}/push-github`, {
    method: "POST",
    body: { repoName, visibility: isPrivate ? "private" : "public" },
  });
}

export function deploy(id: string, mode: "auto" | "manual", publicUrl?: string): Promise<Deployment> {
  return apiFetch<Deployment>(`/api/generations/${id}/deploy`, {
    method: "POST",
    body: { mode, ...(publicUrl ? { publicUrl } : {}) },
  });
}

/** Le dernier déploiement du projet généré, rafraîchi depuis GitHub s'il est en cours. */
export async function latestDeployment(generationId: string, signal?: AbortSignal): Promise<Deployment | null> {
  const list = await apiFetch<Deployment[]>(`/api/generations/${generationId}/deployments`, { signal });
  const latest = list[0];
  return latest ? apiFetch<Deployment>(`/api/deployments/${latest.id}`, { signal }) : null;
}

export function deleteGeneration(id: string): Promise<undefined> {
  return apiFetch<undefined>(`/api/generations/${id}`, { method: "DELETE" });
}

/** Le contenu d'un fichier du projet généré (texte brut, jamais interprété). */
export async function fileText(id: string, path: string, signal?: AbortSignal): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`/api/generations/${id}/files?path=${encodeURIComponent(path)}`, { signal, cache: "no-store" });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(0, "Serveur injoignable", "Le serveur est injoignable.");
  }
  if (!response.ok) throw new ApiError(response.status, response.statusText, "Fichier introuvable.");
  return response.text();
}

export function downloadUrl(id: string): string {
  return `/api/generations/${id}/download`;
}

/** Page de connexion GitHub : ordinaire, ou avec de quoi lancer le déploiement (retour sur /deploy). */
export function githubLoginUrl(deployAccess: boolean): string {
  return deployAccess ? "/api/auth/github/login?access=deploy" : "/api/auth/github/login";
}
