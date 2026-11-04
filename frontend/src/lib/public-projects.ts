/**
 * Projets publics : forme d'une fiche de la galerie (docs/openapi.yaml) et règles pures de leur consultation. Aucun
 * accès réseau ici, pour pouvoir tester ces règles seules (`npm test`) ; les appels sont dans `public-projects-api.ts`.
 */

export interface PublicProject {
  id: string;
  name: string;
  description: string | null;
  ownerName: string;
  ownerLogin: string;
  updatedAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Une clé de projet de l'URL (`?project=`) est-elle un identifiant du serveur ? C'est ce que porte le lien d'une fiche
 * de la galerie ; les projets de la personne, eux, s'ouvrent par leur nom court.
 */
export function isProjectId(key: string): boolean {
  return UUID.test(key);
}

/** Seul le propriétaire publie un projet ou retire sa publication. */
export function canChangeVisibility(role: string | undefined): boolean {
  return role === "Owner";
}

/** L'infobulle du bouton « Public / Privé » : ce que la visibilité permet, et si la personne peut la changer. */
export function visibilityHint(visibility: "public" | "private", canChange: boolean): string {
  const meaning =
    visibility === "public"
      ? "Public : toute personne connectée peut consulter ce projet en lecture seule."
      : "Privé : seuls les membres du projet y ont accès.";
  if (!canChange) return `${meaning} Seul le propriétaire peut le changer.`;
  return `${meaning} Cliquer pour le passer en ${visibility === "public" ? "privé" : "public"}.`;
}
