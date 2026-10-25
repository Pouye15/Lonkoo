/**
 * Appels de la galerie publique (docs/openapi.yaml, `GET /projects/public`). Mode API seulement : en mode simulé, la
 * page Communauté garde ses données de démonstration.
 */

import { apiFetch } from "./api";
import type { PublicProject } from "./public-projects";

export function listPublicProjects(limit: number, signal?: AbortSignal): Promise<PublicProject[]> {
  return apiFetch<PublicProject[]>(`/api/projects/public?limit=${limit}`, { signal });
}
