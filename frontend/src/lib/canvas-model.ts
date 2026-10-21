/**
 * Correspondance entre un bloc ou un lien du tableau blanc (modèle riche : titre, stack, métriques du
 * simulateur…) et une entrée du document Yjs partagé, qui suit le contrat du canvas (docs/schema-canvas.md,
 * décision D2, docs/PROPOSITION-MODELE-DE-BLOCS.md) :
 *
 *   - `type`, `position` et `data` sont ceux du contrat ; `data.label` porte le titre, `data.tech` la stack,
 *     `data.name` l'identifiant technique (stable : il ne suit pas les changements de titre) ;
 *   - tout champ propre au front (forme dessinée, version, statut, métriques, réplicas, port…) va dans la clé
 *     facultative `ui`, que le serveur temps réel ignore dans l'instantané.
 *
 * Module pur (aucune dépendance à React ni au navigateur) : il est testé avec le lanceur de tests de Node.
 */
import type { ArchitectureEdge, ArchitectureNode, ArchitectureShape, NodeRole } from "./lonkoo-data";
import { PROTOCOLS, STENCIL_ITEMS } from "../components/studio/whiteboard/stencils.ts";
import { isReserved } from "./reserved-words.ts";

export type ContractType =
  | "webapp"
  | "service"
  | "database"
  | "auth"
  | "queue"
  | "mobile-payment"
  | "messaging"
  | "billing"
  | "generic";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

/** Entrée de la carte `nodes` du document, lue en JSON simple. */
export interface NodeEntry {
  type: string;
  position: { x: number; y: number };
  data: JsonObject;
  ui?: JsonObject;
}

/** Entrée de la carte `edges` du document, lue en JSON simple. */
export interface EdgeEntry {
  source: string;
  target: string;
  kind?: string;
  label?: string;
  ui?: JsonObject;
}

type Protocol = ArchitectureEdge["protocol"];
type Status = ArchitectureNode["status"];

/* ------------------------------------------------------------------ */
/* Formes et types                                                      */
/* ------------------------------------------------------------------ */

const TYPE_BY_SHAPE: Record<ArchitectureShape, ContractType> = {
  generic: "generic",
  webapp: "webapp",
  cylinder: "database",
  user: "generic",
  gateway: "generic",
  service: "service",
  queue: "queue",
  cache: "generic",
  security: "auth",
  ai: "generic",
  "mobile-payment": "mobile-payment",
  messaging: "messaging",
  billing: "billing",
};

const SHAPE_BY_TYPE: Record<ContractType, ArchitectureShape> = {
  webapp: "webapp",
  service: "service",
  database: "cylinder",
  auth: "security",
  queue: "queue",
  "mobile-payment": "mobile-payment",
  messaging: "messaging",
  billing: "billing",
  generic: "generic",
};

const SHAPES = new Set<string>(Object.keys(TYPE_BY_SHAPE));
const STATUSES: readonly Status[] = ["Actif", "Synchro", "Optimisé", "Attention"];

export function contractTypeOf(shape: ArchitectureShape): ContractType {
  return TYPE_BY_SHAPE[shape];
}

function isShape(value: unknown): value is ArchitectureShape {
  return typeof value === "string" && SHAPES.has(value);
}

function isContractType(value: unknown): value is ContractType {
  return typeof value === "string" && value in SHAPE_BY_TYPE;
}

/* ------------------------------------------------------------------ */
/* Identifiant technique                                                */
/* ------------------------------------------------------------------ */

const IDENT = /^[a-z][a-z0-9_]{0,30}$/;
const MAX_IDENT = 31;

export function isIdent(value: unknown): value is string {
  return typeof value === "string" && IDENT.test(value);
}

function fit(base: string, suffix: string): string {
  return base.slice(0, MAX_IDENT - suffix.length).replace(/_+$/, "") + suffix;
}

/** « Passerelle API » → `passerelle_api` : minuscules sans accent, `_` entre les mots, 31 caractères au plus. */
export function identOf(title: string): string {
  let ident = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!ident) ident = "bloc";
  if (!/^[a-z]/.test(ident)) ident = `b_${ident}`;
  return ident.slice(0, MAX_IDENT).replace(/_+$/, "");
}

/** Identifiant valide, qui n'est pas un mot réservé Java, SQL ou YAML, et que `used` ne contient pas encore. */
export function uniqueIdent(title: string, used: ReadonlySet<string>): string {
  const base = identOf(title);
  let candidate = isReserved(base) ? fit(base, "_bloc") : base;
  for (let n = 2; used.has(candidate) || isReserved(candidate); n++) candidate = fit(base, `_${n}`);
  return candidate;
}

/* ------------------------------------------------------------------ */
/* Lecture de valeurs                                                   */
/* ------------------------------------------------------------------ */

const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
const finite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? (value as string[]) : undefined;
const object = (value: unknown): JsonObject | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : undefined;

const clip = (value: string, max: number): string => (value.length > max ? value.slice(0, max) : value);
const MAX_COORDINATE = 100000;
const coordinate = (value: number): number => Math.max(-MAX_COORDINATE, Math.min(MAX_COORDINATE, Number.isFinite(value) ? value : 0));

function stencilOf(shape: ArchitectureShape) {
  return STENCIL_ITEMS.find((item) => item.shape === shape);
}

/* ------------------------------------------------------------------ */
/* Blocs                                                                */
/* ------------------------------------------------------------------ */

/** Les trois champs du contrat que le front possède : identifiant, titre, stack. Le reste est `contract`. */
const CORE_KEYS = ["name", "label", "tech"];

function contractOf(data: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(data).filter(([key]) => !CORE_KEYS.includes(key)));
}

/** Valeurs de départ des champs obligatoires du contrat (hors identifiant, titre et stack) pour un bloc neuf. */
export function defaultContract(type: ContractType): JsonObject {
  switch (type) {
    case "database":
      return { engine: "postgresql", entities: [] };
    case "auth":
      return { method: "password" };
    case "mobile-payment":
      return { currency: "XOF", flow: "collect" };
    case "messaging":
      return { channel: "sms" };
    case "billing":
      return { model: "subscription", currency: "XOF" };
    default:
      return {};
  }
}

/** Le bloc du front correspondant à une entrée du document (les champs absents prennent les valeurs d'un bloc neuf). */
export function nodeFromEntry(id: string, entry: NodeEntry): ArchitectureNode {
  const ui = object(entry.ui) ?? {};
  const data = object(entry.data) ?? {};
  const fallback = isContractType(entry.type) ? SHAPE_BY_TYPE[entry.type] : "generic";
  const drawn = ui.shape;
  // La forme dessinée n'est reprise que si elle reste compatible avec le type du contrat (un autre client a pu le changer).
  const shape: ArchitectureShape = isShape(drawn) && TYPE_BY_SHAPE[drawn] === entry.type ? drawn : fallback;
  const item = stencilOf(shape);
  const status = STATUSES.find((s) => s === ui.status) ?? "Actif";
  const role = (text(ui.role) as NodeRole | undefined) ?? item?.role ?? "generic";

  return {
    id,
    title: text(data.label) || text(data.name) || id,
    tech: text(data.tech) ?? "",
    version: text(ui.version) ?? "",
    shape,
    moduleGroup: text(ui.moduleGroup) ?? item?.group ?? "",
    description: text(ui.description) ?? text(data.description) ?? "",
    status,
    metricLabel: text(ui.metricLabel) ?? "",
    metricValue: text(ui.metricValue) ?? "",
    baseLatencyMs: finite(ui.baseLatencyMs) ?? 3,
    maxRpsCapacity: finite(ui.maxRpsCapacity) ?? 10000,
    replicas: finite(ui.replicas) ?? 1,
    port: finite(ui.port) ?? 0,
    role,
    x: finite(entry.position?.x) ?? 0,
    y: finite(entry.position?.y) ?? 0,
    envVars: strings(ui.envVars) ?? [],
    dependencies: strings(ui.dependencies) ?? [],
    contract: contractOf(data),
  };
}

/**
 * L'entrée du document pour un bloc du front. `node.contract` porte les champs du contrat propres au type
 * (tables, endpoints, pages…) ; absent, ceux de l'entrée existante sont conservés, sinon les valeurs par défaut
 * du type. Changer de forme change de type : les champs de l'ancien type ne s'appliquent plus et sont écartés.
 *
 * @param usedNames identifiants techniques déjà pris par les autres blocs du canvas
 */
export function nodeToEntry(node: ArchitectureNode, existing: NodeEntry | undefined, usedNames: ReadonlySet<string>): NodeEntry {
  const type = TYPE_BY_SHAPE[node.shape];
  const label = clip(node.title.trim(), 80);
  const keptName = existing && isIdent(existing.data?.name) ? existing.data.name : undefined;
  const name = keptName ?? uniqueIdent(label || node.id, usedNames);

  const sameType = existing?.type === type;
  const contract: JsonObject = existing
    ? sameType
      ? ((node.contract as JsonObject | undefined) ?? contractOf(existing.data))
      : defaultContract(type)
    : ((node.contract as JsonObject | undefined) ?? defaultContract(type));
  const data: JsonObject = { ...contract, name };
  if (label) data.label = label;
  else delete data.label;
  const tech = clip(node.tech.trim(), 80);
  if (tech) data.tech = tech;
  else delete data.tech;

  return {
    type,
    position: { x: coordinate(node.x), y: coordinate(node.y) },
    data,
    ui: {
      shape: node.shape,
      version: node.version,
      moduleGroup: node.moduleGroup,
      description: node.description,
      status: node.status,
      metricLabel: node.metricLabel,
      metricValue: node.metricValue,
      baseLatencyMs: node.baseLatencyMs,
      maxRpsCapacity: node.maxRpsCapacity,
      replicas: node.replicas,
      port: node.port,
      role: node.role,
      envVars: node.envVars,
      dependencies: node.dependencies,
    },
  };
}

/** JSON à clés triées : deux valeurs égales donnent le même texte, quel que soit l'ordre des clés. */
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Forme canonique d'un bloc, pour savoir si deux blocs sont identiques (indépendante de l'ordre des clés). */
export function canonNode(node: ArchitectureNode): string {
  return JSON.stringify([
    node.id, node.title, node.tech, node.version, node.shape, node.moduleGroup, node.description, node.status,
    node.metricLabel, node.metricValue, node.baseLatencyMs, node.maxRpsCapacity, node.replicas, node.port,
    node.role, node.x, node.y, node.envVars, node.dependencies, stable(node.contract),
  ]);
}

/* ------------------------------------------------------------------ */
/* Liens                                                                */
/* ------------------------------------------------------------------ */

const KIND_BY_PROTOCOL: Record<Protocol, string> = {
  "REST / HTTP3": "http",
  gRPC: "http",
  "Kafka / Events": "event",
  "Redis PubSub": "event",
  "TCP / TLS": "data",
};

const PROTOCOL_BY_KIND: Record<string, Protocol> = {
  http: "REST / HTTP3",
  event: "Kafka / Events",
  data: "TCP / TLS",
  auth: "REST / HTTP3",
};

function protocolOf(value: unknown): Protocol | undefined {
  return PROTOCOLS.find((protocol) => protocol === value);
}

export function edgeFromEntry(id: string, entry: EdgeEntry): ArchitectureEdge {
  const ui = object(entry.ui) ?? {};
  return {
    id,
    from: entry.source,
    to: entry.target,
    protocol: protocolOf(ui.protocol) ?? protocolOf(entry.label) ?? PROTOCOL_BY_KIND[entry.kind ?? "http"] ?? "REST / HTTP3",
    throughput: text(ui.throughput) ?? "",
  };
}

export function edgeToEntry(edge: ArchitectureEdge): EdgeEntry {
  return {
    source: edge.from,
    target: edge.to,
    kind: KIND_BY_PROTOCOL[edge.protocol],
    label: edge.protocol,
    ui: { protocol: edge.protocol, throughput: edge.throughput },
  };
}

export function canonEdge(edge: ArchitectureEdge): string {
  return JSON.stringify([edge.id, edge.from, edge.to, edge.protocol, edge.throughput]);
}

/* ------------------------------------------------------------------ */
/* Validation d'une entrée lue dans le document                         */
/* ------------------------------------------------------------------ */

/** Une entrée mal formée (écrite par un autre client) est ignorée plutôt que de casser le tableau. */
export function asNodeEntry(value: unknown): NodeEntry | null {
  const entry = object(value as Json);
  if (!entry || typeof entry.type !== "string") return null;
  const position = object(entry.position);
  if (!position || finite(position.x) === undefined || finite(position.y) === undefined) return null;
  return {
    type: entry.type,
    position: { x: position.x as number, y: position.y as number },
    data: object(entry.data) ?? {},
    ui: object(entry.ui),
  };
}

export function asEdgeEntry(value: unknown): EdgeEntry | null {
  const entry = object(value as Json);
  if (!entry || typeof entry.source !== "string" || typeof entry.target !== "string") return null;
  return {
    source: entry.source,
    target: entry.target,
    kind: text(entry.kind),
    label: text(entry.label),
    ui: object(entry.ui),
  };
}
