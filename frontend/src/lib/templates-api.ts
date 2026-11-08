/**
 * Appel de l'API des modèles de départ (docs/openapi.yaml). Mode API seulement.
 */

import { apiFetch } from "./api";
import type { StarterTemplate } from "./templates";

export function listTemplates(signal?: AbortSignal): Promise<StarterTemplate[]> {
  return apiFetch<StarterTemplate[]>("/api/templates", { signal });
}
