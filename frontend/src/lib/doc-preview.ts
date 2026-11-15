/**
 * Aperçu de la documentation d'un projet : ce que le schéma du Studio permet déjà de dire, sans rien inventer.
 * Chaque ligne vient d'un bloc, d'un lien ou d'un champ du contrat. Aucun texte fixe ne se fait passer pour un
 * résultat : ni version, ni date de génération, ni décision d'architecture, ni mention d'une IA.
 *
 * La documentation complète (README avec le schéma Mermaid, modèle de données, contrat OpenAPI) est écrite dans le
 * dépôt à la génération du projet : cet aperçu n'en est qu'un résumé, recalculé à chaque changement du schéma.
 *
 * Module pur (aucune dépendance à React) : testé avec le lanceur de tests de Node.
 */
import type { ArchitectureEdge, ArchitectureNode } from "./lonkoo-data";
import { endpointsOf, entitiesOf } from "./canvas-contract.ts";

export interface DocSection {
  id: "components" | "links" | "contract";
  title: string;
  /** Une phrase : ce que la section contient, ou pourquoi elle est vide et quoi faire. */
  summary: string;
  items: string[];
}

/**
 * Les fichiers de documentation que la génération écrit dans le dépôt (`DocsWriter` et `OpenApiWriter`, côté
 * backend). Le modèle de données n'existe que si le schéma déclare au moins une table.
 */
export const GENERATED_DOC_FILES = [
  { path: "README.md", detail: "schéma Mermaid" },
  { path: "docs/architecture/architecture.md", detail: "composants et liens" },
  { path: "docs/architecture/data-model.md", detail: "si des tables sont déclarées" },
  { path: "docs/architecture/canvas.json", detail: "le schéma, au format du contrat" },
  { path: "openapi.yaml", detail: "contrat des routes" },
] as const;

/** « 0 lien », « 1 lien », « 2 liens » : en français, le pluriel commence à deux. */
const count = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;

/** Un bloc, nommé comme dans le Studio : son titre, puis sa technologie et sa version si elles sont renseignées. */
function labelOf(node: ArchitectureNode): string {
  const stack = [node.tech, node.version].map((part) => part.trim()).filter(Boolean).join(" ");
  const title = node.title.trim() || node.id;
  return stack ? `${title} (${stack})` : title;
}

/** Toujours trois sections, dans cet ordre : composants, liens, tables et routes. */
export function buildDocSections(
  nodes: readonly ArchitectureNode[],
  edges: readonly ArchitectureEdge[],
): [DocSection, DocSection, DocSection] {
  const titles = new Map(nodes.map((node) => [node.id, node.title.trim() || node.id]));
  const titleOf = (id: string): string => titles.get(id) ?? id;

  const components: DocSection = {
    id: "components",
    title: "Composants",
    summary:
      nodes.length === 0
        ? "Le schéma est vide : ajoutez des blocs dans l'onglet Architecture."
        : `${count(nodes.length, "composant", "composants")} dans le schéma.`,
    items: nodes.map(labelOf),
  };

  const links: DocSection = {
    id: "links",
    title: "Liens entre composants",
    summary:
      edges.length === 0
        ? "Aucun lien : reliez deux blocs dans l'onglet Architecture."
        : `${count(edges.length, "lien", "liens")} entre composants.`,
    items: edges.map((edge) => `${titleOf(edge.from)} → ${titleOf(edge.to)} · ${edge.protocol}`),
  };

  const tables = nodes.flatMap((node) =>
    entitiesOf(node.contract).map((entity) => `${titleOf(node.id)} : table ${entity.name} (${count(entity.fields.length, "champ", "champs")})`),
  );
  const routes = nodes.flatMap((node) =>
    endpointsOf(node.contract).map((endpoint) => `${titleOf(node.id)} : ${endpoint.method} ${endpoint.path}${endpoint.summary ? ` : ${endpoint.summary}` : ""}`),
  );
  const contract: DocSection = {
    id: "contract",
    title: "Tables et routes déclarées",
    summary:
      tables.length + routes.length === 0
        ? "Aucune table ni route déclarée. Décrivez-les avec « Propriétés » dans l'onglet Architecture : le générateur s'en sert pour écrire les entités et les contrôleurs."
        : `${count(tables.length, "table", "tables")} et ${count(routes.length, "route", "routes")} déclarées.`,
    items: [...tables, ...routes],
  };

  return [components, links, contract];
}
