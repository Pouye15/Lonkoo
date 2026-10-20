"use client";

import React, { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ThemeSegmented } from "@/components/theme/ThemeToggle";
import { type GitHubRole } from "@/lib/lonkoo-data";
import {
  Users,
  Key,
  GithubLogo,
  Plus,
  Palette,
  Trash,
} from "@phosphor-icons/react";

interface TeamMember {
  id: string;
  name: string;
  handle: string;
  email: string;
  role: GitHubRole;
  status: "Actif" | "En attente";
}

export default function SettingsPage() {
  const [members, setMembers] = useState<TeamMember[]>([
    {
      id: "u1",
      name: "Aminata S.",
      handle: "aminata-arch",
      email: "aminata@lonkoo.dev",
      role: "Owner",
      status: "Actif",
    },
    {
      id: "u2",
      name: "Koffi D.",
      handle: "koffi-dev",
      email: "koffi@lonkoo.dev",
      role: "Maintainer",
      status: "Actif",
    },
    {
      id: "u3",
      name: "Dr. Cheikh Tidiane",
      handle: "cheikh-sec",
      email: "cheikh@lonkoo.dev",
      role: "Write",
      status: "Actif",
    },
    {
      id: "u4",
      name: "Fatou Diallo",
      handle: "fatou-ai",
      email: "fatou@lonkoo.dev",
      role: "Write",
      status: "Actif",
    },
  ]);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<GitHubRole>("Write");

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    const raw = inviteEmail.trim().replace(/^@/, "");
    const namePart = raw.split("@")[0] ?? "Collaborateur";
    setMembers((prev) => [
      ...prev,
      {
        id: `u-${Date.now()}`,
        name: namePart,
        handle: namePart.toLowerCase().replace(/[^a-z0-9-_]/g, ""),
        email: raw.includes("@") ? raw : `${namePart}@lonkoo.dev`,
        role: inviteRole,
        status: "En attente",
      },
    ]);
    setInviteEmail("");
  };

  const handleChangeRole = (id: string, role: GitHubRole) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, role } : m))
    );
  };

  const handleRemove = (id: string) => {
    if (members.length <= 1) return;
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <>
      <PageHeader title="Paramètres" />
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Gestion de l'équipe de l'organisation */}
        <div className="bg-surface rounded-xl p-5 border border-edge space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-edge-soft">
            <div className="flex items-center gap-2.5">
              <Users size={17} className="text-ink-2" weight="bold" />
              <div>
                <h2 className="text-sm font-bold text-ink">
                  Membres de l&apos;organisation et permissions
                </h2>
                <p className="text-xs text-ink-3">
                  Gérez les accès aux dépôts d&apos;architecture et les droits d&apos;approbation.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-ink-3">
              {members.length} membres
            </span>
          </div>

          <form
            onSubmit={handleInvite}
            className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs bg-sunken p-3 rounded-lg border border-edge"
          >
            <input
              type="text"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Ajouter par @handle ou adresse e-mail..."
              className="sm:col-span-6 px-3 py-2 rounded-lg bg-surface border border-edge text-ink focus:outline-none focus:border-accent"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as GitHubRole)}
              className="sm:col-span-3 px-2.5 py-2 rounded-lg bg-surface border border-edge text-ink font-medium"
            >
              <option value="Owner">Owner</option>
              <option value="Maintainer">Maintainer</option>
              <option value="Write">Write (Écriture)</option>
              <option value="Triage">Triage</option>
              <option value="Read">Read (Lecture)</option>
            </select>
            <button
              type="submit"
              className="sm:col-span-3 py-2 px-3 rounded-lg bg-brand hover:bg-brand-hover text-white font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus size={13} weight="bold" />
              <span>Inviter</span>
            </button>
          </form>

          <div className="divide-y divide-edge-soft text-xs">
            {members.map((m) => (
              <div
                key={m.id}
                className="py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink">{m.name}</span>
                    <span className="font-mono text-ink-4">@{m.handle}</span>
                  </div>
                  <div className="text-[11px] font-mono text-ink-3">{m.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={m.role}
                    onChange={(e) => handleChangeRole(m.id, e.target.value as GitHubRole)}
                    className="px-2.5 py-1 rounded bg-sunken border border-edge font-mono text-[11px] font-medium text-ink-2"
                  >
                    <option value="Owner">Owner</option>
                    <option value="Maintainer">Maintainer</option>
                    <option value="Write">Write</option>
                    <option value="Triage">Triage</option>
                    <option value="Read">Read</option>
                  </select>
                  <span className="text-[11px] text-ink-3 font-mono px-2">
                    {m.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(m.id)}
                    className="p-1 text-ink-4 hover:text-danger cursor-pointer"
                    title="Retirer"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Clés & Apparence */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-surface rounded-xl p-5 border border-edge space-y-4 text-xs">
            <div className="flex items-center gap-2 text-sm font-bold text-ink">
              <Key size={16} className="text-ink-2" weight="bold" />
              <span>Clés d&apos;accès MCP &amp; Webhooks Git</span>
            </div>

            <div>
              <label className="block font-medium text-ink-2 mb-1">
                Clé serveur MCP
              </label>
              <input
                type="text"
                readOnly
                value="lko_••••••••••••••••"
                className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge font-mono text-ink-2"
              />
            </div>

            <div>
              <label className="block font-medium text-ink-2 mb-1">
                Webhook GitHub Releases
              </label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sunken border border-edge font-mono text-ink-2">
                <GithubLogo size={14} />
                <span className="truncate">
                  https://&lt;votre-domaine&gt;/api/webhooks/github/releases
                </span>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-xl p-5 border border-edge space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-ink">
              <Palette size={16} className="text-ink-2" weight="bold" />
              <span>Apparence</span>
            </div>
            <p className="text-xs text-ink-3">
              Le thème Système suit le réglage de votre appareil. Le choix s&apos;applique tout de suite.
            </p>
            <ThemeSegmented />
          </div>
        </div>
      </div>
    </>
  );
}
