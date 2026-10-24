/**
 * Membres d'un projet et liens de partage actifs : formes des réponses de l'API (docs/openapi.yaml) et règles
 * pures de l'onglet « Équipe ». Aucun accès réseau ici, pour pouvoir tester ces règles seules (`npm test`) ;
 * les appels sont dans `members-api.ts`.
 */

import { initialsOf } from "./initials.ts";

export type MemberRole = "OWNER" | "MAINTAINER" | "WRITE" | "TRIAGE" | "READ";

export interface Member {
  userId: string;
  displayName: string | null;
  login: string;
  avatarUrl: string | null;
  guest: boolean;
  role: MemberRole;
  joinedAt: string;
  /** Vrai pour la personne qui regarde la liste. */
  you: boolean;
  /** Vrai si elle peut retirer ce membre ou, si `you`, quitter le projet : le serveur a déjà tranché. */
  removable: boolean;
}

export interface ShareLink {
  id: string;
  role: "WRITE" | "READ";
  expiresAt: string;
  createdAt: string;
  createdBy: string | null;
}

/** Mêmes noms que le panneau « Ce que permet chaque rôle ». */
export const ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: "Owner",
  MAINTAINER: "Maintainer",
  WRITE: "Write",
  TRIAGE: "Triage",
  READ: "Read",
};

export const LINK_ROLE_LABELS: Record<ShareLink["role"], string> = {
  WRITE: "Peut modifier",
  READ: "Lecture seule",
};

const AVATAR_COLORS = ["#1265DD", "#0F766E", "#B45309", "#7C3AED", "#BE185D", "#475569"] as const;

export function memberName(member: Pick<Member, "displayName" | "login">): string {
  return member.displayName?.trim() || member.login;
}

/** De quoi distinguer deux personnes : les invités portent tous le même nom affiché, leur identifiant les sépare. */
export function memberLabel(member: Pick<Member, "displayName" | "login" | "guest">): string {
  const name = memberName(member);
  return member.guest && name !== member.login ? `${name} (${member.login})` : name;
}

export function memberInitials(member: Pick<Member, "displayName" | "login">): string {
  return initialsOf(memberName(member));
}

/** Une couleur stable par personne (même identifiant, même couleur, d'une visite à l'autre). */
export function avatarColor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

export interface ConfirmPrompt {
  title: string;
  body: string;
  confirm: string;
}

/** Ce que la boîte de confirmation dit avant de révoquer un lien : ceux qui l'ont utilisé restent dans le projet. */
export function revocationPrompt(link: Pick<ShareLink, "role">): ConfirmPrompt {
  return {
    title: "Révoquer ce lien ?",
    body: `Le lien « ${LINK_ROLE_LABELS[link.role]} » ne rattachera plus personne. Les personnes qui l'ont déjà ouvert restent dans le projet : retirez-les depuis la liste de l'équipe.`,
    confirm: "Révoquer le lien",
  };
}

/** Ce que la boîte de confirmation dit avant de retirer quelqu'un, ou avant de quitter soi-même. */
export function removalPrompt(member: Pick<Member, "displayName" | "login" | "guest" | "you">): ConfirmPrompt {
  if (member.you) {
    return {
      title: "Quitter ce projet ?",
      body: "Vous n'y aurez plus accès. Pour y revenir, il faudra qu'on vous renvoie un lien de partage.",
      confirm: "Quitter le projet",
    };
  }
  const name = memberLabel(member);
  return {
    title: `Retirer ${name} ?`,
    body: `${name} perd l'accès au projet et est déconnecté du canvas. Si un lien de partage reste actif, ${name} peut le rouvrir pour revenir : révoquez-le aussi pour l'en empêcher.`,
    confirm: "Retirer du projet",
  };
}

/** « Expire dans 3 h », « Expire dans 12 min » ; « Expiré » une fois l'heure passée. */
export function expiresIn(expiresAt: string, now = Date.now()): string {
  const minutes = Math.ceil((new Date(expiresAt).getTime() - now) / 60000);
  if (!(minutes > 0)) return "Expiré";
  if (minutes < 60) return `Expire dans ${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `Expire dans ${hours} h`;
  const days = Math.floor(hours / 24);
  const rest = hours - days * 24;
  return rest === 0 ? `Expire dans ${days} j` : `Expire dans ${days} j ${rest} h`;
}

/** Y a-t-il quelqu'un que cette personne peut retirer ? (sinon on n'affiche pas d'invitation à le faire) */
export function canRemoveSomeone(members: readonly Member[]): boolean {
  return members.some((member) => member.removable && !member.you);
}
