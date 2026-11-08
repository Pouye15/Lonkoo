/**
 * Audit d'architecture par règles : des fonctions pures sur les blocs et les liens du Studio. Aucune IA, aucun appel
 * réseau : le même schéma donne toujours les mêmes constats et le même score. L'IA peut expliquer et proposer ; elle
 * ne décide pas du score.
 *
 * Chaque règle rend zéro, un ou plusieurs constats (gravité, explication, correction, blocs concernés). Le score
 * est une convention, pas une mesure : 100 moins une pénalité par constat (`PENALTY`), sans descendre sous 0.
 *
 * Les règles de données viennent de la relecture des modèles de départ (docs/MODELES-DE-DEPART.md) : paiement sans
 * référence unique, entité qu'aucune route ne crée, message trop long pour un SMS.
 *
 * Module pur (aucune dépendance à React) : testé avec le lanceur de tests de Node.
 */
import type { ArchitectureEdge, ArchitectureNode } from "./lonkoo-data";
import { contractTypeOf, type ContractType } from "./canvas-model.ts";
import { endpointsOf, entitiesOf } from "./canvas-contract.ts";

export type Severity = "critique" | "important" | "mineur";

export type RuleId =
  | "auth-absente"
  | "auth-non-reliee"
  | "base-partagee"
  | "base-sans-replique"
  | "paiement-sans-reference"
  | "paiement-sans-file"
  | "impasse-creation"
  | "message-hors-limite"
  | "bloc-vide"
  | "bloc-orphelin";

export interface Finding {
  rule: RuleId;
  severity: Severity;
  title: string;
  detail: string;
  fix: string;
  /** Les blocs concernés, le premier d'abord. */
  nodeIds: string[];
  /** La correction que le Studio sait appliquer seul : régler le nombre de répliques d'un bloc. */
  autofix?: { nodeId: string; replicas: number };
}

export interface Audit {
  findings: Finding[];
  /** `null` quand il n'y a aucun bloc : rien à noter. */
  score: number | null;
  counts: Record<Severity, number>;
}

/** Points retirés à 100 pour chaque constat. */
export const PENALTY: Record<Severity, number> = { critique: 20, important: 10, mineur: 3 };

export const SEVERITIES: readonly Severity[] = ["critique", "important", "mineur"];

/** Le nombre de règles, pour dire « les N règles sont respectées ». */
export const RULE_COUNT = 10;

/** Une limite de SMS (GSM 7 bits) ou d'écran USSD : au-delà, le message est coupé en plusieurs ou tronqué. */
export const MESSAGE_LIMIT = 160;

/**
 * Caractères du jeu GSM 7 bits de base utiles en français. Un seul caractère hors de ce jeu (ê, â, ô, û, î, ï, ë, œ,
 * l'apostrophe typographique, les guillemets « ») fait passer tout le SMS en UCS-2 : 70 caractères au lieu de 160.
 * « ç » est admis : la case de « Ç » s'affiche « ç » sur les terminaux actuels.
 */
const GSM_7 = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 \n.,:;!?'\"()/-+=<>%&*@#$_éèàùÉÇç");

/** Les caractères d'un texte qui ne sont pas dans le jeu GSM 7 bits, sans doublon. */
export function outsideSms(text: string): string[] {
  return [...new Set([...text].filter((char) => !GSM_7.has(char)))];
}

/* ------------------------------------------------------------------ */
/* Lecture du graphe                                                    */
/* ------------------------------------------------------------------ */

interface Block {
  node: ArchitectureNode;
  type: ContractType;
  /** Les blocs reliés, dans un sens ou dans l'autre, sans doublon. */
  neighbors: Block[];
}

function blocksOf(nodes: readonly ArchitectureNode[], edges: readonly ArchitectureEdge[]): Block[] {
  const byId = new Map<string, Block>();
  for (const node of nodes) {
    byId.set(node.id, { node, type: contractTypeOf(node.shape) ?? "generic", neighbors: [] });
  }
  const seen = new Set<string>();
  for (const edge of edges) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b || a === b) continue;
    const key = a.node.id < b.node.id ? `${a.node.id}\u0000${b.node.id}` : `${b.node.id}\u0000${a.node.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    a.neighbors.push(b);
    b.neighbors.push(a);
  }
  return [...byId.values()];
}

const name = (block: Block): string => block.node.title || block.node.id;
const ofType = (blocks: readonly Block[], ...types: ContractType[]): Block[] => blocks.filter((block) => types.includes(block.type));
const touches = (block: Block, ...types: ContractType[]): boolean => block.neighbors.some((other) => types.includes(other.type));

/** Même règle que le générateur : « /commandes » désigne l'entité « commande » (s, es ou x retirés). */
export function entityForPath(path: string, entities: ReadonlySet<string>): string | null {
  const segments = path.split("/").filter(Boolean);
  if (segments.length !== 1) return null;
  const segment = (segments[0] ?? "").replace(/-/g, "_");
  const strip = (suffix: string) => (suffix && segment.endsWith(suffix) && segment.length > suffix.length ? segment.slice(0, -suffix.length) : segment);
  for (const suffix of ["", "s", "es", "x"]) {
    const candidate = strip(suffix);
    if (entities.has(candidate)) return candidate;
  }
  return null;
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Les gabarits de message d'un bloc de messagerie (lecture tolérante). */
function messagesOf(contract: ArchitectureNode["contract"]): Array<{ name: string; text: string }> {
  const list = contract?.templates;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item): Array<{ name: string; text: string }> =>
    isObject(item) && typeof item.text === "string" ? [{ name: typeof item.name === "string" ? item.name : "", text: item.text }] : [],
  );
}

/* ------------------------------------------------------------------ */
/* Règles                                                               */
/* ------------------------------------------------------------------ */

type Rule = (blocks: readonly Block[]) => Finding[];

/** Une interface ou une API sans aucun bloc d'authentification. */
const authAbsente: Rule = (blocks) => {
  const exposed = ofType(blocks, "webapp", "service");
  if (exposed.length === 0 || ofType(blocks, "auth").length > 0) return [];
  const hasApi = exposed.some((block) => block.type === "service");
  return [
    {
      rule: "auth-absente",
      severity: hasApi ? "critique" : "important",
      title: "Aucun bloc d'authentification",
      detail: hasApi
        ? "Rien ne contrôle qui appelle l'API : le schéma ne prévoit aucune identification."
        : "Rien ne contrôle qui ouvre l'interface : le schéma ne prévoit aucune identification.",
      fix: "Ajoutez un bloc d'authentification (mot de passe, code SMS ou GitHub) et reliez-le à l'interface.",
      nodeIds: exposed.map((block) => block.node.id),
    },
  ];
};

/** Un bloc d'authentification qui ne protège ni interface ni API. */
const authNonReliee: Rule = (blocks) =>
  ofType(blocks, "auth")
    .filter((block) => !touches(block, "webapp", "service"))
    .map((block) => ({
      rule: "auth-non-reliee" as const,
      severity: "important" as const,
      title: `« ${name(block)} » ne protège rien`,
      detail: "Ce bloc d'authentification n'est relié à aucune interface ni à aucune API.",
      fix: "Reliez-le à l'interface et à l'API qu'il protège.",
      nodeIds: [block.node.id],
    }));

/** Une base écrite par plusieurs services. */
const basePartagee: Rule = (blocks) =>
  ofType(blocks, "database").flatMap((database) => {
    const services = database.neighbors.filter((other) => other.type === "service");
    if (services.length < 2) return [];
    return [
      {
        rule: "base-partagee" as const,
        severity: "important" as const,
        title: `« ${name(database)} » est partagée par ${services.length} services`,
        detail: "Une migration ou une panne d'un service touche les autres : ils ne peuvent plus évoluer séparément.",
        fix: "Donnez une base à chaque service, ou faites passer les échanges par des événements.",
        nodeIds: [database.node.id, ...services.map((service) => service.node.id)],
      },
    ];
  });

/** Une base utilisée, en une seule instance : si elle tombe, tout s'arrête. */
const baseSansReplique: Rule = (blocks) =>
  ofType(blocks, "database")
    .filter((database) => (database.node.replicas ?? 1) < 2 && touches(database, "service"))
    .map((database) => ({
      rule: "base-sans-replique" as const,
      severity: "important" as const,
      title: `« ${name(database)} » n'a qu'une instance`,
      detail: "Si cette base tombe, l'ensemble s'arrête : aucune réplique ne prend le relais.",
      fix: "Passez à 2 répliques, ou prévoyez une sauvegarde que l'on sait restaurer.",
      nodeIds: [database.node.id],
      autofix: { nodeId: database.node.id, replicas: 2 },
    }));

/** Des paiements, mais aucun champ unique pour reconnaître un retour déjà traité. */
const REFERENCE = /^(ref|reference|transaction|idempotency)/;

const paiementSansReference: Rule = (blocks) => {
  const payments = ofType(blocks, "mobile-payment");
  if (payments.length === 0) return [];
  const hasReference = ofType(blocks, "database").some((database) =>
    entitiesOf(database.node.contract).some((entity) => entity.fields.some((field) => field.unique && REFERENCE.test(field.name))),
  );
  if (hasReference) return [];
  return [
    {
      rule: "paiement-sans-reference",
      severity: "critique",
      title: "Aucune référence unique pour les paiements",
      detail: "Un opérateur peut rappeler deux fois pour le même paiement. Sans référence unique, il peut être compté deux fois.",
      fix: "Ajoutez à l'entité du paiement un champ unique (reference, transaction…).",
      nodeIds: payments.map((block) => block.node.id),
    },
  ];
};

/** Un paiement qui n'est relié à aucune file : ses retours arrivent par à-coups et peuvent être répétés. */
const paiementSansFile: Rule = (blocks) =>
  ofType(blocks, "mobile-payment")
    .filter((payment) => !touches(payment, "queue"))
    .map((payment) => ({
      rule: "paiement-sans-file" as const,
      severity: "mineur" as const,
      title: `« ${name(payment)} » n'a pas de file de messages`,
      detail: "Les retours de l'opérateur arrivent par à-coups et peuvent être répétés : une file les absorbe et permet de les rejouer.",
      fix: "Reliez le paiement à une file de messages.",
      nodeIds: [payment.node.id],
    }));

/** Un champ `xxx_id` qui désigne une entité qu'aucune route POST ne crée : le champ n'aurait jamais de valeur. */
const impasseCreation: Rule = (blocks) => {
  const databases = ofType(blocks, "database");
  const endpoints = ofType(blocks, "service").flatMap((service) => endpointsOf(service.node.contract));
  if (endpoints.length === 0) return [];
  const all = new Set(databases.flatMap((database) => entitiesOf(database.node.contract).map((entity) => entity.name)));
  const creatable = new Set<string>();
  for (const endpoint of endpoints) {
    const target = endpoint.method === "POST" ? entityForPath(endpoint.path, all) : null;
    if (target) creatable.add(target);
  }
  return databases.flatMap((database) => {
    const entities = entitiesOf(database.node.contract);
    const own = new Set(entities.map((entity) => entity.name));
    return entities.flatMap((entity) =>
      entity.fields.flatMap((field): Finding[] => {
        if (field.type !== "uuid" || !field.name.endsWith("_id")) return [];
        const target = field.name.slice(0, -"_id".length);
        if (!own.has(target) || creatable.has(target)) return [];
        return [
          {
            rule: "impasse-creation",
            severity: "important",
            title: `« ${entity.name}.${field.name} » désigne « ${target} », que l'API ne crée pas`,
            detail: `Aucune route POST ne crée « ${target} » : ce champ n'aura jamais de valeur.`,
            fix: `Ajoutez à un service une route POST pour « ${target} ».`,
            nodeIds: [database.node.id],
          },
        ];
      }),
    );
  });
};

/** Un message de SMS ou d'USSD trop long, ou (SMS) avec un caractère qui fait passer tout le message en 70 caractères. */
const messageHorsLimite: Rule = (blocks) =>
  ofType(blocks, "messaging").flatMap((block) => {
    const channel = block.node.contract?.channel;
    if (channel !== "sms" && channel !== "ussd") return [];
    return messagesOf(block.node.contract).flatMap((message): Finding[] => {
      const label = message.name || "message";
      const found: Finding[] = [];
      if ([...message.text].length > MESSAGE_LIMIT) {
        found.push({
          rule: "message-hors-limite",
          severity: "mineur",
          title: `« ${label} » dépasse ${MESSAGE_LIMIT} caractères`,
          detail:
            channel === "sms"
              ? "Au-delà, le SMS est coupé en plusieurs messages de 153 caractères, facturés chacun."
              : "Au-delà, l'écran USSD peut être tronqué selon l'opérateur.",
          fix: "Raccourcissez le texte.",
          nodeIds: [block.node.id],
        });
      }
      const outside = channel === "sms" ? outsideSms(message.text) : [];
      if (outside.length > 0) {
        found.push({
          rule: "message-hors-limite",
          severity: "mineur",
          title: `« ${label} » sort du jeu de caractères des SMS`,
          detail: `${outside.map((char) => `« ${char} »`).join(", ")} fait passer tout le message en 70 caractères (67 par morceau).`,
          fix: "Remplacez ces caractères (par exemple « ê » par « e », « ’ » par « ' »).",
          nodeIds: [block.node.id],
        });
      }
      return found;
    });
  });

/** Un service sans endpoint ou une base sans table : le générateur n'en tire rien. */
const blocVide: Rule = (blocks) => [
  ...ofType(blocks, "service")
    .filter((block) => endpointsOf(block.node.contract).length === 0)
    .map((block) => ({
      rule: "bloc-vide" as const,
      severity: "mineur" as const,
      title: `« ${name(block)} » n'a aucun endpoint`,
      detail: "Le générateur n'en tire aucun contrôleur.",
      fix: "Ajoutez des endpoints dans Propriétés.",
      nodeIds: [block.node.id],
    })),
  ...ofType(blocks, "database")
    .filter((block) => entitiesOf(block.node.contract).length === 0)
    .map((block) => ({
      rule: "bloc-vide" as const,
      severity: "mineur" as const,
      title: `« ${name(block)} » n'a aucune table`,
      detail: "Le générateur n'en tire aucune table ni aucune entité.",
      fix: "Ajoutez des tables dans Propriétés.",
      nodeIds: [block.node.id],
    })),
];

/** Un bloc relié à rien, dans un schéma qui en compte d'autres. */
const blocOrphelin: Rule = (blocks) =>
  blocks.length < 2
    ? []
    : blocks
        .filter((block) => block.neighbors.length === 0)
        .map((block) => ({
          rule: "bloc-orphelin" as const,
          severity: "mineur" as const,
          title: `« ${name(block)} » n'est relié à rien`,
          detail: "Ce bloc n'appartient à aucun parcours du schéma.",
          fix: "Reliez-le, ou supprimez-le.",
          nodeIds: [block.node.id],
        }));

/** L'ordre des règles est celui de l'affichage à gravité égale. */
export const RULES: ReadonlyArray<readonly [RuleId, Rule]> = [
  ["auth-absente", authAbsente],
  ["auth-non-reliee", authNonReliee],
  ["paiement-sans-reference", paiementSansReference],
  ["base-partagee", basePartagee],
  ["base-sans-replique", baseSansReplique],
  ["impasse-creation", impasseCreation],
  ["paiement-sans-file", paiementSansFile],
  ["message-hors-limite", messageHorsLimite],
  ["bloc-vide", blocVide],
  ["bloc-orphelin", blocOrphelin],
];

/* ------------------------------------------------------------------ */
/* Audit                                                                */
/* ------------------------------------------------------------------ */

export function auditArchitecture(nodes: readonly ArchitectureNode[], edges: readonly ArchitectureEdge[]): Audit {
  const blocks = blocksOf(nodes, edges);
  const rank = (severity: Severity) => SEVERITIES.indexOf(severity);
  // Tri stable : à gravité égale, l'ordre des règles puis celui des blocs.
  const findings = RULES.flatMap(([, rule]) => rule(blocks)).sort((a, b) => rank(a.severity) - rank(b.severity));
  const counts: Record<Severity, number> = { critique: 0, important: 0, mineur: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  const penalty = SEVERITIES.reduce((sum, severity) => sum + counts[severity] * PENALTY[severity], 0);
  return { findings, score: blocks.length === 0 ? null : Math.max(0, 100 - penalty), counts };
}
