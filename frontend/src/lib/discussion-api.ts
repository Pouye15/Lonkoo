/**
 * Appels de l'API de la discussion d'un projet (docs/openapi.yaml). Mode API seulement : en mode simulé, la page
 * Revues garde sa démonstration.
 */

import { apiFetch } from "./api";
import type { DiscussionMessage } from "./discussion";

/** Les derniers messages, ou seulement ceux qui suivent `after`. */
export function listMessages(
  projectId: string,
  options: { after?: number; signal?: AbortSignal } = {},
): Promise<DiscussionMessage[]> {
  const query = options.after === undefined ? "" : `?after=${options.after}`;
  return apiFetch<DiscussionMessage[]>(`/api/projects/${projectId}/messages${query}`, { signal: options.signal });
}

export function sendMessage(projectId: string, body: string): Promise<DiscussionMessage> {
  return apiFetch<DiscussionMessage>(`/api/projects/${projectId}/messages`, { method: "POST", body: { body } });
}
