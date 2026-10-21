"use client";

import React from "react";
import { LinkSimple, ShieldCheck } from "@phosphor-icons/react";
import type { WorkspaceProject } from "@/lib/lonkoo-data";
import { Button } from "@/components/ui/Button";

const ROLES = [
  { name: "Owner", text: "Tout faire, y compris supprimer le projet." },
  { name: "Maintainer", text: "Modifier le projet et créer des liens de partage." },
  { name: "Write", text: "Dessiner, enregistrer et restaurer des versions." },
  { name: "Triage et Read", text: "Regarder le canvas en direct, sans le modifier." },
] as const;

/**
 * Équipe d'un projet en mode API : vous, votre rôle, et l'invitation par lien de partage (le serveur n'a pas
 * encore de liste de membres : les personnes arrivent par un lien et rejoignent le projet avec le rôle du lien).
 */
export function LiveTeamPanel({
  project,
  canShare,
  onShare,
}: {
  project: WorkspaceProject;
  canShare: boolean;
  onShare: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <section className="space-y-4 lg:col-span-7">
        <div className="rounded-xl border border-edge bg-surface p-5">
          <h2 className="text-sm font-bold text-ink">Votre accès à ce projet</h2>
          <ul className="mt-3 space-y-2">
            {project.collaborators
              .filter((member) => member.name !== "Propriétaire" || project.collaborators.length === 1)
              .map((member) => (
                <li key={member.initials + member.name} className="flex items-center gap-3">
                  <span
                    style={{ backgroundColor: member.color }}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                  >
                    {member.initials}
                  </span>
                  <span className="text-sm font-medium text-ink">{member.name}</span>
                  <span className="rounded-md bg-subtle px-2 py-0.5 text-xs font-medium text-ink-2">{member.role}</span>
                </li>
              ))}
          </ul>
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
            <Button size="sm" className="mt-4" onClick={onShare}>
              <LinkSimple size={14} />
              Créer un lien de partage
            </Button>
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
    </div>
  );
}
