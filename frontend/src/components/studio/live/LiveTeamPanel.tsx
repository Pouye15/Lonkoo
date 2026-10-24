"use client";

import React, { useEffect, useState } from "react";
import { LinkBreak, LinkSimple, ShieldCheck, SignOut, UserMinus } from "@phosphor-icons/react";
import { messageOf } from "@/lib/api";
import { listMembers, listShareLinks, removeMember, revokeShareLink } from "@/lib/members-api";
import {
  LINK_ROLE_LABELS,
  ROLE_LABELS,
  avatarColor,
  canRemoveSomeone,
  expiresIn,
  memberInitials,
  memberLabel,
  memberName,
  removalPrompt,
  revocationPrompt,
  type ConfirmPrompt,
  type Member,
  type ShareLink,
} from "@/lib/members";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

const ROLES = [
  { name: "Owner", text: "Tout faire, y compris supprimer le projet." },
  { name: "Maintainer", text: "Modifier le projet, créer des liens de partage et retirer les rôles plus bas que lui." },
  { name: "Write", text: "Dessiner, enregistrer et restaurer des versions." },
  { name: "Triage et Read", text: "Regarder le canvas en direct, sans le modifier." },
] as const;

type Pending = { kind: "member"; member: Member } | { kind: "link"; link: ShareLink };

interface LiveTeamPanelProps {
  projectId: string;
  /** Canvas principal du projet, une fois connu (les liens de partage sont ceux de ce canvas). */
  canvasId?: string | null;
  canShare: boolean;
  onShare: () => void;
  /** Change quand un lien est créé dans la boîte de partage : la liste des liens actifs se relit. */
  linksVersion: number;
  /** Appelé une fois que la personne a quitté le projet (elle n'y a plus accès). */
  onLeft: () => void;
}

/**
 * Équipe d'un projet en mode API : les vrais membres (retirer quelqu'un, quitter), l'invitation par lien de
 * partage et les liens encore actifs (révoquer). Le serveur décide de ce qui est permis ; les boutons ne font
 * que suivre ce qu'il a annoncé (`removable`).
 */
export function LiveTeamPanel({ projectId, canvasId, canShare, onShare, linksVersion, onLeft }: LiveTeamPanelProps) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [linksError, setLinksError] = useState<string | null>(null);
  // Change après chaque retrait ou révocation réussi : les deux listes se relisent.
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listMembers(projectId, controller.signal)
      .then((list) => {
        setMembers(list);
        setMembersError(null);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMembersError(messageOf(error));
      });
    return () => controller.abort();
  }, [projectId, reloadKey]);

  useEffect(() => {
    if (!canShare || !canvasId) return;
    const controller = new AbortController();
    listShareLinks(canvasId, controller.signal)
      .then((list) => {
        setLinks(list);
        setLinksError(null);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLinksError(messageOf(error));
      });
    return () => controller.abort();
  }, [canShare, canvasId, linksVersion, reloadKey]);

  const prompt: ConfirmPrompt | null = pending
    ? pending.kind === "member"
      ? removalPrompt(pending.member)
      : revocationPrompt(pending.link)
    : null;

  const ask = (next: Pending) => {
    setActionError(null);
    setNotice(null);
    setPending(next);
  };

  const confirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      if (pending.kind === "member") {
        await removeMember(projectId, pending.member.userId);
        if (pending.member.you) {
          onLeft();
          return;
        }
        setNotice(`${memberLabel(pending.member)} a été retiré du projet.`);
      } else if (canvasId) {
        await revokeShareLink(canvasId, pending.link.id);
        setNotice("Lien révoqué : il ne permet plus de rejoindre le projet.");
      }
      setPending(null);
      setReloadKey((key) => key + 1);
    } catch (error) {
      // Rôle devenu insuffisant (403), personne déjà partie (404), session expirée…
      setActionError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const closeConfirm = () => {
    if (busy) return;
    setPending(null);
    setActionError(null);
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <section className="space-y-4 lg:col-span-7">
        <div className="rounded-xl border border-edge bg-surface p-5">
          <h2 className="text-sm font-bold text-ink">
            Équipe du projet{members ? ` (${members.length})` : ""}
          </h2>

          {membersError && (
            <p role="alert" className="mt-3 rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger">
              {membersError}
            </p>
          )}
          {!members && !membersError && <p className="mt-3 text-sm text-ink-3">Chargement de l&apos;équipe…</p>}

          {members && (
            <ul className="mt-3 divide-y divide-edge-soft">
              {members.map((member) => (
                <li key={member.userId} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span
                    aria-hidden
                    style={{ backgroundColor: avatarColor(member.userId) }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  >
                    {memberInitials(member)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {memberName(member)}
                      {member.you && <span className="ml-1.5 text-xs font-normal text-ink-3">(vous)</span>}
                    </span>
                    <span className="block truncate text-xs text-ink-3">
                      {member.guest ? member.login : `@${member.login}`}
                    </span>
                  </span>
                  <span className="rounded-md bg-subtle px-2 py-0.5 text-xs font-medium text-ink-2">
                    {ROLE_LABELS[member.role]}
                  </span>
                  {member.removable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hover:text-danger"
                      aria-label={member.you ? "Quitter le projet" : `Retirer ${memberLabel(member)} du projet`}
                      onClick={() => ask({ kind: "member", member })}
                    >
                      {member.you ? <SignOut size={14} /> : <UserMinus size={14} />}
                      {member.you ? "Quitter" : "Retirer"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {members && canShare && canRemoveSomeone(members) && links && links.length > 0 && (
            <p className="mt-3 rounded-lg bg-sunken px-3 py-2 text-xs text-ink-2">
              Une personne retirée peut revenir tant qu&apos;un lien de partage reste actif : révoquez-le aussi pour l&apos;en
              empêcher.
            </p>
          )}
          {notice && (
            <p role="status" className="mt-3 rounded-lg bg-sunken px-3 py-2 text-sm text-ink">
              {notice}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-edge bg-surface p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
            <LinkSimple size={16} />
            Inviter des personnes
          </h2>
          <p className="mt-1 text-sm text-ink-3">
            Créez un lien de partage : la personne l&apos;ouvre, avec ou sans compte, et rejoint le projet avec le rôle du
            lien. Le lien expire au bout de 72 heures au plus.
          </p>
          {canShare ? (
            <>
              <Button size="sm" className="mt-4" onClick={onShare}>
                <LinkSimple size={14} />
                Créer un lien de partage
              </Button>

              <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-ink-3">Liens actifs</h3>
              {linksError && (
                <p role="alert" className="mt-2 rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger">
                  {linksError}
                </p>
              )}
              {!links && !linksError && <p className="mt-2 text-sm text-ink-3">Chargement des liens…</p>}
              {links && links.length === 0 && <p className="mt-2 text-sm text-ink-3">Aucun lien actif.</p>}
              {links && links.length > 0 && (
                <ul className="mt-2 divide-y divide-edge-soft">
                  {links.map((link) => (
                    <li key={link.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">{LINK_ROLE_LABELS[link.role]}</span>
                        <span className="block truncate text-xs text-ink-3">
                          {expiresIn(link.expiresAt)}
                          {link.createdBy ? ` · créé par ${link.createdBy}` : ""}
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="hover:text-danger"
                        aria-label={`Révoquer le lien « ${LINK_ROLE_LABELS[link.role]} » ${expiresIn(link.expiresAt).toLowerCase()}`}
                        onClick={() => ask({ kind: "link", link })}
                      >
                        <LinkBreak size={14} />
                        Révoquer
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-4 rounded-lg bg-sunken px-3 py-2 text-sm text-ink-2">
              Seuls les rôles Maintainer et Owner peuvent créer un lien de partage.
            </p>
          )}
        </div>
      </section>

      <aside className="lg:col-span-5">
        <div className="rounded-xl border border-edge bg-surface p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
            <ShieldCheck size={16} />
            Ce que permet chaque rôle
          </h2>
          <dl className="mt-3 space-y-3 text-sm">
            {ROLES.map((role) => (
              <div key={role.name}>
                <dt className="font-mono text-xs font-semibold text-ink">{role.name}</dt>
                <dd className="text-ink-3">{role.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>

      <Modal open={pending !== null} onClose={closeConfirm} title={prompt?.title ?? ""}>
        <div className="space-y-4">
          <p className="text-sm text-ink-2">{prompt?.body}</p>
          {actionError && (
            <p role="alert" className="rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger">
              {actionError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-edge-soft pt-4">
            <Button variant="secondary" onClick={closeConfirm} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={() => void confirm()} disabled={busy}>
              {busy ? "En cours…" : prompt?.confirm}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
