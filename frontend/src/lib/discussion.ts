/**
 * Discussion d'un projet (GET et POST /api/projects/{id}/messages, voir docs/openapi.yaml) : formes des réponses et
 * règles pures de l'écran (fusion des messages reçus, contrôle du texte, rythme de l'interrogation).
 */

export interface DiscussionMessage {
  id: number;
  /** Absent quand l'auteur n'existe plus (invité purgé) : le nom affiché à l'envoi reste. */
  authorId: string | null;
  authorName: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  mine: boolean;
}

/** Même plafond que le serveur : au-delà il répond 400. */
export const MAX_MESSAGE_CHARS = 2000;

/** Le compteur de caractères n'apparaît que près du plafond. */
export const COUNTER_FROM_CHARS = 1800;

/**
 * Ce qui empêche d'envoyer ce texte, ou `null` s'il peut partir. Un texte vide n'est pas une erreur à afficher : le
 * bouton reste simplement inactif (`isBlank`).
 */
export function draftProblem(text: string): string | null {
  if (text.trim().length > MAX_MESSAGE_CHARS) {
    return `Le message dépasse ${MAX_MESSAGE_CHARS} caractères.`;
  }
  return null;
}

/**
 * Vrai si cette touche envoie le message. Entrée envoie, sauf avec Maj (aller à la ligne), pendant une composition
 * (accents, saisie en plusieurs temps) et sur un écran tactile : le clavier à l'écran n'a pas de Maj+Entrée, donc
 * Entrée y va à la ligne et c'est le bouton qui envoie.
 */
export function enterSends(
  event: { key: string; shiftKey: boolean; isComposing: boolean },
  touchScreen: boolean,
): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing && !touchScreen;
}

export function isBlank(text: string): boolean {
  return text.trim().length === 0;
}

/**
 * Ajoute les messages reçus à ceux qu'on a, sans doublon (un message qu'on vient d'envoyer revient aussi à la lecture
 * suivante) et dans l'ordre de la conversation. Rend le même tableau si rien n'est nouveau : pas de rendu inutile.
 */
export function mergeMessages(
  current: readonly DiscussionMessage[],
  incoming: readonly DiscussionMessage[],
): readonly DiscussionMessage[] {
  const known = new Set(current.map((message) => message.id));
  const fresh = incoming.filter((message) => !known.has(message.id));
  if (fresh.length === 0) return current;
  return [...current, ...fresh].sort((a, b) => a.id - b.id);
}

/** Le plus grand identifiant reçu : la lecture suivante ne demande que ce qui est plus récent. */
export function lastMessageId(messages: readonly DiscussionMessage[]): number | undefined {
  return messages.length === 0 ? undefined : messages[messages.length - 1]!.id;
}

const POLL_VISIBLE_MS = 3000;
const POLL_HIDDEN_MS = 20000;
const POLL_MAX_MS = 30000;

/**
 * Attente avant la prochaine lecture : rapide quand l'onglet est visible, lente quand il est caché, et de plus en plus
 * longue après des échecs de suite (réseau coupé, serveur en panne) pour ne pas l'accabler.
 */
export function pollDelayMs(options: { visible: boolean; failures: number }): number {
  const base = options.visible ? POLL_VISIBLE_MS : POLL_HIDDEN_MS;
  return Math.min(POLL_MAX_MS, base * 2 ** Math.min(options.failures, 4));
}

/** Vrai si la liste est (presque) en bas : on la suit alors quand un message arrive, sinon on ne la bouge pas. */
export function isNearBottom(metrics: { scrollHeight: number; scrollTop: number; clientHeight: number }, slack = 80): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= slack;
}

/** Date complète d'un message, pour l'infobulle de l'heure relative. */
export function fullDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

/** Messages d'autres personnes arrivés après le dernier que celle-ci a vu : ce que compte la pastille de « Revues ». */
export function unreadFrom(messages: readonly DiscussionMessage[], seenId: number): number {
  return messages.filter((message) => message.id > seenId && !message.mine).length;
}

/** Au-delà de 99, la pastille dit « 99+ » : elle ne grandit pas dans la barre latérale. */
export function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** Le texte lu par un lecteur d'écran pour la pastille. */
export function unreadLabel(count: number): string {
  return `${badgeText(count)} message${count > 1 ? "s" : ""} non lu${count > 1 ? "s" : ""}`;
}

const UNREAD_POLL_VISIBLE_MS = 10000;
const UNREAD_POLL_HIDDEN_MS = 60000;

/** Attente avant de recompter les messages non lus : plus lente que la discussion ouverte, lente onglet caché. */
export function unreadPollDelayMs(visible: boolean): number {
  return visible ? UNREAD_POLL_VISIBLE_MS : UNREAD_POLL_HIDDEN_MS;
}
