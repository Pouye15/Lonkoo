/**
 * Appels de l'API des membres et des liens de partage actifs (docs/openapi.yaml). Mode API seulement : en mode
 * simulé, l'onglet « Équipe » garde sa démonstration.
 */

import { apiFetch } from "./api";
import type { Member, ShareLink } from "./members";

export function listMembers(projectId: string, signal?: AbortSignal): Promise<Member[]> {
  return apiFetch<Member[]>(`/api/projects/${projectId}/members`, { signal });
}

/** Retire un membre, ou quitte le projet si `userId` est celui de l'appelant. */
export function removeMember(projectId: string, userId: string): Promise<undefined> {
  return apiFetch(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" });
}

export function listShareLinks(canvasId: string, signal?: AbortSignal): Promise<ShareLink[]> {
  return apiFetch<ShareLink[]>(`/api/canvases/${canvasId}/share-links`, { signal });
}

export function revokeShareLink(canvasId: string, linkId: string): Promise<undefined> {
  return apiFetch(`/api/canvases/${canvasId}/share-links/${linkId}`, { method: "DELETE" });
}
