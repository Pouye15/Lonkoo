import assert from "node:assert/strict";
import { test } from "node:test";
import {
  avatarColor,
  canRemoveSomeone,
  expiresIn,
  memberInitials,
  memberLabel,
  memberName,
  removalPrompt,
  revocationPrompt,
  type Member,
} from "./members.ts";

function member(overrides: Partial<Member> = {}): Member {
  return {
    userId: "u1",
    displayName: "Aminata Sow",
    login: "aminata",
    avatarUrl: null,
    guest: false,
    role: "WRITE",
    joinedAt: "2026-10-24T10:00:00Z",
    you: false,
    removable: true,
    ...overrides,
  };
}

test("le nom affiché est le nom complet, ou l'identifiant à défaut", () => {
  assert.equal(memberName(member()), "Aminata Sow");
  assert.equal(memberName(member({ displayName: null })), "aminata");
  assert.equal(memberName(member({ displayName: "   " })), "aminata");
});

test("les initiales viennent du nom affiché", () => {
  assert.equal(memberInitials(member()), "AS");
  assert.equal(memberInitials(member({ displayName: null, login: "aminata" })), "AM");
});

test("une personne garde la même couleur d'avatar", () => {
  assert.equal(avatarColor("5d091ef3-bd11-48d7"), avatarColor("5d091ef3-bd11-48d7"));
  const colors = new Set(Array.from({ length: 40 }, (_, i) => avatarColor(`utilisateur-${i}`)));
  assert.ok(colors.size > 1, "les couleurs varient d'une personne à l'autre");
  for (const color of colors) assert.match(color, /^#[0-9A-F]{6}$/);
});

test("quitter et retirer ne disent pas la même chose", () => {
  const leave = removalPrompt(member({ you: true }));
  assert.equal(leave.confirm, "Quitter le projet");
  assert.match(leave.body, /lien de partage/);

  const remove = removalPrompt(member());
  assert.equal(remove.title, "Retirer Aminata Sow ?");
  assert.match(remove.body, /Aminata Sow perd l'accès/);
  assert.match(remove.body, /révoquez-le aussi/, "le piège du lien encore actif est dit avant de confirmer");
});

test("révoquer un lien dit que ceux qui l'ont utilisé restent dans le projet", () => {
  const prompt = revocationPrompt({ role: "WRITE" });
  assert.match(prompt.body, /Peut modifier/);
  assert.match(prompt.body, /restent dans le projet/);
  assert.match(revocationPrompt({ role: "READ" }).body, /Lecture seule/);
});

test("le délai avant expiration se lit en minutes, heures ou jours", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  const at = (ms: number) => new Date(now + ms).toISOString();
  const minute = 60_000;
  const hour = 60 * minute;

  assert.equal(expiresIn(at(-1), now), "Expiré");
  assert.equal(expiresIn(at(0), now), "Expiré");
  assert.equal(expiresIn(at(1), now), "Expire dans 1 min", "une milliseconde restante compte pour une minute, pas pour zéro");
  assert.equal(expiresIn(at(12 * minute), now), "Expire dans 12 min");
  assert.equal(expiresIn(at(59 * minute + 1), now), "Expire dans 1 h");
  assert.equal(expiresIn(at(3 * hour), now), "Expire dans 3 h");
  assert.equal(expiresIn(at(24 * hour), now), "Expire dans 1 j");
  assert.equal(expiresIn(at(72 * hour), now), "Expire dans 3 j");
  assert.equal(expiresIn(at(30 * hour), now), "Expire dans 1 j 6 h");
  assert.equal(expiresIn("pas une date", now), "Expiré", "une date illisible n'annonce pas un lien valide");
});

test("on n'invite à retirer quelqu'un que s'il y a quelqu'un à retirer", () => {
  assert.equal(canRemoveSomeone([member({ you: true, removable: true })]), false, "quitter n'est pas retirer");
  assert.equal(canRemoveSomeone([member({ you: true }), member({ userId: "u2", removable: false })]), false);
  assert.equal(canRemoveSomeone([member({ you: true }), member({ userId: "u2" })]), true);
  assert.equal(canRemoveSomeone([]), false);
});

test("deux invités se distinguent par leur identifiant", () => {
  const guest = member({ displayName: "Invité", login: "invite-68294360", guest: true });
  assert.equal(memberLabel(guest), "Invité (invite-68294360)");
  assert.equal(memberLabel(member()), "Aminata Sow", "un compte GitHub garde son nom");
  assert.equal(memberLabel(member({ displayName: null, login: "invite-1", guest: true })), "invite-1", "pas de doublon quand le nom est l'identifiant");
  assert.equal(removalPrompt(guest).title, "Retirer Invité (invite-68294360) ?");
});
