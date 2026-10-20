"use client";

import React, { useState } from "react";
import { AppShell } from "@/components/layout/AppSidebar";
import { type GitHubRole } from "@/lib/lonkoo-data";
import {
  Users,
  Key,
  GithubLogo,
  CheckCircle,
  Plus,
  ShieldCheck,
  Sun,
  Moon,
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
  const [savedNotice, setSavedNotice] = useState(false);

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
    <AppShell title="Paramètres">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Gestion de l'équipe de l'organisation */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <Users size={17} className="text-slate-700" weight="bold" />
              <div>
                <h2 className="text-sm font-bold text-slate-950">
                  Membres de l&apos;organisation et permissions
                </h2>
                <p className="text-xs text-slate-500">
                  Gérez les accès aux dépôts d&apos;architecture et les droits d&apos;approbation.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-slate-500">
              {members.length} membres
            </span>
          </div>

          <form
            onSubmit={handleInvite}
            className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200"
          >
            <input
              type="text"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Ajouter par @handle ou adresse e-mail..."
              className="sm:col-span-6 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-[#1265DD]"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as GitHubRole)}
              className="sm:col-span-3 px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-900 font-medium"
            >
              <option value="Owner">Owner</option>
              <option value="Maintainer">Maintainer</option>
              <option value="Write">Write (Écriture)</option>
              <option value="Triage">Triage</option>
              <option value="Read">Read (Lecture)</option>
            </select>
            <button
              type="submit"
              className="sm:col-span-3 py-2 px-3 rounded-lg bg-[#1265DD] hover:bg-blue-700 text-white font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus size={13} weight="bold" />
              <span>Inviter</span>
            </button>
          </form>

          <div className="divide-y divide-slate-100 text-xs">
            {members.map((m) => (
              <div
                key={m.id}
                className="py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-950">{m.name}</span>
                    <span className="font-mono text-slate-400">@{m.handle}</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">{m.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={m.role}
                    onChange={(e) => handleChangeRole(m.id, e.target.value as GitHubRole)}
                    className="px-2.5 py-1 rounded bg-slate-50 border border-slate-200 font-mono text-[11px] font-medium text-slate-800"
                  >
                    <option value="Owner">Owner</option>
                    <option value="Maintainer">Maintainer</option>
                    <option value="Write">Write</option>
                    <option value="Triage">Triage</option>
                    <option value="Read">Read</option>
                  </select>
                  <span className="text-[11px] text-slate-500 font-mono px-2">
                    {m.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(m.id)}
                    className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
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
          <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
              <Key size={16} className="text-slate-700" weight="bold" />
              <span>Clés d&apos;accès MCP &amp; Webhooks Git</span>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Clé serveur MCP
              </label>
              <input
                type="text"
                readOnly
                value="lko_live_mcp_98a4f2c1e0b7d3_prod"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 font-mono text-slate-800"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Webhook GitHub Releases
              </label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 font-mono text-slate-700">
                <GithubLogo size={14} />
                <span className="truncate">
                  https://api.lonkoo.dev/webhooks/github/releases
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200 flex flex-col justify-between space-y-4 text-xs">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
                <ShieldCheck size={16} className="text-slate-700" weight="bold" />
                <span>Apparence de l&apos;interface</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="p-3 rounded-lg bg-slate-50 border-2 border-[#1265DD] text-slate-950 font-medium flex items-center gap-2">
                  <Sun size={15} weight="fill" className="text-[#1265DD]" />
                  <span>Clair</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 flex items-center gap-2">
                  <Moon size={15} />
                  <span>Sombre</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              {savedNotice ? (
                <span className="text-slate-900 font-medium flex items-center gap-1.5">
                  <CheckCircle size={14} weight="fill" className="text-emerald-600" />
                  Enregistré
                </span>
              ) : (
                <span className="text-slate-400">À jour</span>
              )}

              <button
                type="button"
                onClick={() => {
                  setSavedNotice(true);
                  setTimeout(() => setSavedNotice(false), 2000);
                }}
                className="px-4 py-1.5 rounded-lg bg-[#1265DD] hover:bg-blue-700 text-white font-medium cursor-pointer"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
