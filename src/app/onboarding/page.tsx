"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppSidebar";
import {
  GithubLogo,
  LockKey,
  Globe,
  CheckCircle,
  ArrowRight,
  PlugsConnected,
} from "@phosphor-icons/react";

const PREFERRED_STACKS = [
  "Go 1.23 / gRPC",
  "Rust Axum",
  "Python FastAPI",
  "Next.js 16 / TypeScript",
  "PostgreSQL 16",
  "Redpanda / Kafka",
  "Valkey / Redis",
  "Keycloak OIDC",
] as const;

export default function OnboardingPage() {
  const [workspaceName, setWorkspaceName] = useState("lonkoo-org");
  const [defaultVisibility, setDefaultVisibility] = useState<"public" | "private">("private");
  const [selectedStacks, setSelectedStacks] = useState<string[]>([
    "Go 1.23 / gRPC",
    "PostgreSQL 16",
    "Redpanda / Kafka",
    "Valkey / Redis",
  ]);
  const [githubConnected, setGithubConnected] = useState(true);
  const [enableMcp, setEnableMcp] = useState(true);
  const [enableOrion, setEnableOrion] = useState(true);

  const toggleStack = (stack: string) => {
    setSelectedStacks((prev) =>
      prev.includes(stack) ? prev.filter((s) => s !== stack) : [...prev, stack]
    );
  };

  return (
    <AppShell title="Configuration initiale">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-950">
              Organisation et visibilité par défaut
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1.5">
                Identifiant de l&apos;organisation
              </label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-950 font-mono font-semibold focus:outline-none focus:border-[#1265DD] focus:bg-white"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1.5">
                Visibilité par défaut des nouveaux projets
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDefaultVisibility("private")}
                  className={`p-2 rounded-lg border font-medium flex items-center justify-center gap-2 cursor-pointer ${
                    defaultVisibility === "private"
                      ? "bg-slate-900 border-slate-900 text-white"
                      : "bg-slate-50 border-slate-200 text-slate-600"
                  }`}
                >
                  <LockKey size={14} />
                  <span>Privé</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultVisibility("public")}
                  className={`p-2 rounded-lg border font-medium flex items-center justify-center gap-2 cursor-pointer ${
                    defaultVisibility === "public"
                      ? "bg-slate-900 border-slate-900 text-white"
                      : "bg-slate-50 border-slate-200 text-slate-600"
                  }`}
                >
                  <Globe size={14} />
                  <span>Public</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-950">
              Technologies favorites
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sélectionnez les stacks que vous utilisez le plus souvent dans vos projets.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {PREFERRED_STACKS.map((stack) => {
              const active = selectedStacks.includes(stack);
              return (
                <button
                  key={stack}
                  type="button"
                  onClick={() => toggleStack(stack)}
                  className={`p-2.5 rounded-lg border font-mono text-left transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                    active
                      ? "bg-slate-50 border-2 border-[#1265DD] text-slate-950 font-semibold"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="truncate">{stack}</span>
                  {active && (
                    <CheckCircle
                      size={14}
                      weight="fill"
                      className="text-[#1265DD] flex-shrink-0"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-950">
              Intégrations externes
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-bold text-slate-950 mb-1">
                  <GithubLogo size={15} />
                  <span>GitHub Releases</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Synchronisation des versions avec les tags Git.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGithubConnected((v) => !v)}
                className={`py-1.5 px-3 rounded-md font-medium border cursor-pointer ${
                  githubConnected
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200"
                }`}
              >
                {githubConnected ? "Connecté (lonkoo-org)" : "Connecter"}
              </button>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-bold text-slate-950 mb-1">
                  <PlugsConnected size={15} />
                  <span>Serveur MCP</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Exposition des contrats aux agents de développement.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnableMcp((v) => !v)}
                className={`py-1.5 px-3 rounded-md font-medium border cursor-pointer ${
                  enableMcp
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200"
                }`}
              >
                {enableMcp ? "Activé" : "Activer"}
              </button>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-bold text-slate-950 mb-1">
                  <span>Constructeur Orion</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Export vers Orion Site Builder.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnableOrion((v) => !v)}
                className={`py-1.5 px-3 rounded-md font-medium border cursor-pointer ${
                  enableOrion
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200"
                }`}
              >
                {enableOrion ? "Activé" : "Activer"}
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
            <Link
              href="/dashboard"
              className="px-4 py-2 rounded-lg bg-[#1265DD] hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5"
            >
              <span>Continuer vers mes projets</span>
              <ArrowRight size={13} weight="bold" />
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
