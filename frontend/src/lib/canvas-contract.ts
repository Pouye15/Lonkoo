/**
 * Champs du contrat du canvas propres à chaque type de bloc (docs/canvas.schema.json) : tables et champs d'une
 * base, endpoints d'un service, pages, topics, méthode d'authentification… Lecture tolérante (une valeur écrite
 * par un autre client et mal formée est ignorée) et règles de validation identiques à celles du backend, pour
 * qu'une saisie refusée ici ne parte jamais dans le document partagé (le serveur la refuserait en 422).
 *
 * Module pur (aucune dépendance à React) : testé avec le lanceur de tests de Node.
 */
import { isIdent } from "./canvas-model.ts";
import { isReserved } from "./reserved-words.ts";

export const FIELD_TYPES = ["string", "text", "integer", "long", "decimal", "boolean", "date", "datetime", "uuid", "json"] as const;
export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export const AUTH_METHODS = ["github", "password", "otp-sms"] as const;
export const MESSAGING_CHANNELS = ["sms", "ussd", "whatsapp", "email"] as const;
export const PAYMENT_FLOWS = ["collect", "payout"] as const;
export const BILLING_MODELS = ["subscription", "one-time", "usage"] as const;

/** Limites du contrat : elles protègent le navigateur, l'IA et le générateur. */
export const LIMITS = { entities: 40, fields: 40, endpoints: 50, pages: 30, topics: 30, summary: 80 } as const;

export type FieldType = (typeof FIELD_TYPES)[number];
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface Field {
  name: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
}

export interface Entity {
  name: string;
  fields: Field[];
}

export interface Endpoint {
  method: HttpMethod;
  path: string;
  summary?: string;
}

type Contract = { [key: string]: unknown } | undefined;

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const oneOf = <T extends string>(values: readonly T[], value: unknown): T | undefined => values.find((v) => v === value);

/* ------------------------------------------------------------------ */
/* Lecture                                                              */
/* ------------------------------------------------------------------ */

function fieldOf(value: unknown): Field | null {
  if (!isObject(value) || typeof value.name !== "string") return null;
  const type = oneOf(FIELD_TYPES, value.type);
  if (!type) return null;
  const field: Field = { name: value.name, type };
  if (value.required === true) field.required = true;
  if (value.unique === true) field.unique = true;
  return field;
}

export function entitiesOf(contract: Contract): Entity[] {
  const list = contract?.entities;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item): Entity[] => {
    if (!isObject(item) || typeof item.name !== "string") return [];
    const fields = Array.isArray(item.fields) ? item.fields.map(fieldOf).filter((f): f is Field => f !== null) : [];
    return [{ name: item.name, fields }];
  });
}

export function endpointsOf(contract: Contract): Endpoint[] {
  const list = contract?.endpoints;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item): Endpoint[] => {
    if (!isObject(item) || typeof item.path !== "string") return [];
    const method = oneOf(HTTP_METHODS, item.method);
    if (!method) return [];
    const endpoint: Endpoint = { method, path: item.path };
    if (typeof item.summary === "string" && item.summary) endpoint.summary = item.summary;
    return [endpoint];
  });
}

/** Liste de textes (pages d'une application web, topics d'une file). */
export function listOf(contract: Contract, key: "pages" | "topics"): string[] {
  const list = contract?.[key];
  return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
}

export function textOf(contract: Contract, key: string, fallback: string): string {
  const value = contract?.[key];
  return typeof value === "string" ? value : fallback;
}

/** Nombre de gabarits de message (leur édition n'est pas proposée : ils sont conservés tels quels). */
export function templatesCount(contract: Contract): number {
  return Array.isArray(contract?.templates) ? contract.templates.length : 0;
}

/* ------------------------------------------------------------------ */
/* Validation (mêmes règles que le backend et le schéma)                */
/* ------------------------------------------------------------------ */

/** `null` si l'identifiant est accepté, sinon la raison du refus en une phrase. */
export function checkIdent(value: string, taken: readonly string[]): string | null {
  if (!isIdent(value)) return "Minuscules, chiffres et « _ », en commençant par une lettre (31 caractères au plus).";
  if (isReserved(value)) return `« ${value} » est un mot réservé (Java, SQL ou YAML).`;
  if (taken.includes(value)) return `« ${value} » existe déjà.`;
  return null;
}

const PATH = /^\/[a-z0-9/{}_-]{0,80}$/;

export function checkPath(value: string): string | null {
  return PATH.test(value) ? null : "Un chemin commence par « / » : minuscules, chiffres et « / { } _ - » (81 caractères au plus).";
}

const CURRENCY = /^[A-Z]{3}$/;

export function checkCurrency(value: string): string | null {
  return CURRENCY.test(value) ? null : "Un code de devise ISO : trois lettres majuscules (ex. XOF).";
}

/* ------------------------------------------------------------------ */
/* Valeurs de départ                                                    */
/* ------------------------------------------------------------------ */

/** Premier identifiant libre de la forme `base`, `base_2`, `base_3`… (31 caractères au plus). */
export function freshIdent(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `_${n}`;
    const candidate = base.slice(0, 31 - suffix.length) + suffix;
    if (!taken.includes(candidate)) return candidate;
  }
}
