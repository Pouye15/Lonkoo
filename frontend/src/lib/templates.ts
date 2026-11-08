/**
 * Modèles de départ (GET /api/templates, voir docs/openapi.yaml) : les canvas complets que l'on choisit en créant un projet.
 * Mode API seulement : en mode simulé, la création de projet ne propose pas de modèle.
 */

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  blocks: number;
  links: number;
}

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** « 8 blocs · 7 liens » : de quoi juger de la taille du modèle sans l'ouvrir. */
export function templateSize(template: Pick<StarterTemplate, "blocks" | "links">): string {
  return `${plural(template.blocks, "bloc", "blocs")} · ${plural(template.links, "lien", "liens")}`;
}

/**
 * L'identifiant à envoyer à la création du projet : celui du modèle choisi s'il existe encore dans la liste, sinon rien
 * (projet vide). Un identifiant périmé (liste rechargée entre-temps) ne part donc jamais au serveur.
 */
export function templateToSend(selected: string | null, available: readonly StarterTemplate[]): string | undefined {
  if (selected === null) return undefined;
  return available.some((template) => template.id === selected) ? selected : undefined;
}
