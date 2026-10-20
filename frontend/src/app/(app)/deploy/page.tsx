"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ArrowsClockwise,
  ArrowSquareOut,
  CheckCircle,
  Circle,
  Copy,
  Cube,
  GitBranch,
  GithubLogo,
  PlugsConnected,
  RocketLaunch,
  Tag,
  WarningCircle,
} from "@phosphor-icons/react";
import { ARCHITECTURE_VERSIONS, type ArchitectureVersion } from "@/lib/lonkoo-data";
import { cn } from "@/lib/cn";
import { IS_MOCK_SESSION, useSession } from "@/lib/session";
import { slugify, useWorkspace } from "@/lib/workspace";
import { useProjectGraph } from "@/lib/project-graph";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field, inputClass, textareaClass } from "@/components/ui/Field";

type StepState = "idle" | "running" | "done";
type DeployStatus = "idle" | "pending" | "running" | "deployed";
type DeployTab = "pipeline" | "integrations" | "releases";

const TARGETS = [
  { id: "full", label: "Spring Boot et Next.js", hint: "API et interface" },
  { id: "api", label: "API Spring Boot", hint: "Back-end seul" },
  { id: "web", label: "Next.js", hint: "Interface seule" },
] as const;

const AI_AGENT_MODELS = [
  { id: "claude-code", name: "Claude Code" },
  { id: "antigravity-gemini", name: "Antigravity / Gemini" },
  { id: "cursor-agent", name: "Cursor" },
] as const;

/** Simule la durée d'une étape tant que les routes de génération et de déploiement n'existent pas. */
function useSimulatedTimers() {
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);
  return (callback: () => void, delay: number) => {
    timers.current.push(window.setTimeout(callback, delay));
  };
}

function StepShell({
  index,
  title,
  state,
  locked,
  children,
}: {
  index: number;
  title: string;
  state: StepState;
  locked: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`step-${index}`}
      className={cn("rounded-xl border bg-surface p-5 transition-colors", locked ? "border-edge-soft opacity-60" : "border-edge")}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            state === "done" ? "bg-ok-fill text-white" : "border border-edge-strong text-ink-2",
          )}
        >
          {state === "done" ? <CheckCircle size={16} weight="fill" /> : index}
        </span>
        <h2 id={`step-${index}`} className="text-base font-semibold text-ink">
          {title}
        </h2>
      </div>
      <div className="mt-4 pl-10">{children}</div>
    </section>
  );
}

const STATUS_STEPS: ReadonlyArray<{ id: DeployStatus; label: string }> = [
  { id: "pending", label: "En attente" },
  { id: "running", label: "En cours" },
  { id: "deployed", label: "Déployé" },
];

function PipelineTab() {
  const { user } = useSession();
  const { activeProject } = useWorkspace();
  const { nodes } = useProjectGraph(activeProject?.slug ?? "none", { persist: false });
  const later = useSimulatedTimers();

  const [target, setTarget] = useState<(typeof TARGETS)[number]["id"]>("full");
  const [generation, setGeneration] = useState<StepState>("idle");
  const [repoName, setRepoName] = useState(() => slugify(activeProject?.name ?? "mon-projet"));
  const [push, setPush] = useState<StepState>("idle");
  const [deploy, setDeploy] = useState<DeployStatus>("idle");

  if (!activeProject) return null;

  const owner = user?.login ?? "vous";
  const repoUrl = `https://github.com/${owner}/${repoName || "projet"}`;
  const canGenerate = nodes.length > 0 && generation !== "running";
  const githubReady = Boolean(user && !user.isGuest);

  const runGeneration = () => {
    setGeneration("running");
    setPush("idle");
    setDeploy("idle");
    later(() => setGeneration("done"), 1100);
  };

  const runPush = () => {
    setPush("running");
    setDeploy("idle");
    later(() => setPush("done"), 1300);
  };

  const runDeploy = () => {
    setDeploy("pending");
    later(() => setDeploy("running"), 900);
    later(() => setDeploy("deployed"), 2800);
  };

  const files = [
    "openapi.yaml",
    "Dockerfile",
    "docker-compose.yml",
    "README.md (schémas Mermaid)",
    `${nodes.length} bloc${nodes.length > 1 ? "s" : ""} décrit${nodes.length > 1 ? "s" : ""} dans docs/architecture/`,
  ];

  return (
    <div className="space-y-4">
      {IS_MOCK_SESSION && (
        <p className="rounded-lg bg-subtle px-3 py-2 text-sm text-ink-2">
          Mode démonstration : le parcours est simulé, aucun dépôt n&apos;est créé et rien n&apos;est déployé.
        </p>
      )}

      <StepShell index={1} title="Générer le projet" state={generation} locked={false}>
        {nodes.length === 0 ? (
          <p className="text-sm text-ink-3">
            Le canvas est vide. Ajoutez des blocs dans le studio avant de générer le projet.
          </p>
        ) : (
          <div className="space-y-4">
            <div role="radiogroup" aria-label="Cible de génération" className="grid gap-2 sm:grid-cols-3">
              {TARGETS.map((option) => {
                const selected = target === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTarget(option.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      selected ? "border-accent bg-sunken ring-1 ring-accent" : "border-edge hover:border-edge-strong",
                    )}
                  >
                    <span className="block text-sm font-semibold text-ink">{option.label}</span>
                    <span className="text-xs text-ink-3">{option.hint}</span>
                  </button>
                );
              })}
            </div>

            {generation === "done" && (
              <ul className="space-y-1 rounded-lg bg-sunken p-3 font-mono text-xs text-ink-2">
                {files.map((file) => (
                  <li key={file} className="flex items-center gap-2">
                    <CheckCircle size={13} weight="fill" className="flex-shrink-0 text-ok" />
                    {file}
                  </li>
                ))}
              </ul>
            )}

            <Button onClick={runGeneration} disabled={!canGenerate} variant={generation === "done" ? "secondary" : "primary"}>
              {generation === "running" ? (
                <>
                  <ArrowsClockwise size={16} className="animate-spin" /> Génération…
                </>
              ) : generation === "done" ? (
                "Générer à nouveau"
              ) : (
                <>
                  <Cube size={16} weight="fill" /> Générer le projet
                </>
              )}
            </Button>
          </div>
        )}
      </StepShell>

      <StepShell index={2} title="Pousser sur GitHub" state={push} locked={generation !== "done"}>
        <div className="space-y-4">
          <Field label="Nom du dépôt" htmlFor="repo-name" hint="Le dépôt est créé en public, avec un seul commit initial.">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-ink-3">{owner} /</span>
              <input
                id="repo-name"
                type="text"
                value={repoName}
                onChange={(event) => setRepoName(slugify(event.target.value))}
                disabled={generation !== "done" || push !== "idle"}
                className={cn(inputClass, "max-w-xs font-mono")}
              />
            </div>
          </Field>

          {!githubReady && generation === "done" && (
            <p className="flex items-start gap-2 rounded-lg border border-edge bg-sunken p-3 text-sm text-ink-2">
              <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0 text-warn" />
              Connectez votre compte GitHub pour créer le dépôt (menu du profil, en bas à gauche).
            </p>
          )}

          {push === "done" ? (
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-mono text-sm font-medium text-accent hover:underline"
            >
              <GithubLogo size={16} weight="fill" />
              {repoUrl.replace("https://", "")}
              <ArrowSquareOut size={13} />
            </a>
          ) : (
            <Button
              onClick={runPush}
              disabled={generation !== "done" || !repoName || push === "running" || !githubReady}
              variant="inverse"
            >
              {push === "running" ? (
                <>
                  <ArrowsClockwise size={16} className="animate-spin" /> Envoi…
                </>
              ) : (
                <>
                  <GithubLogo size={16} weight="fill" /> Pousser sur GitHub
                </>
              )}
            </Button>
          )}
        </div>
      </StepShell>

      <StepShell index={3} title="Déployer" state={deploy === "deployed" ? "done" : deploy === "idle" ? "idle" : "running"} locked={push !== "done"}>
        <div className="space-y-4">
          <p className="text-sm text-ink-2">
            Le projet est copié sur un serveur cloud à Dakar puis démarré avec Docker Compose, dans des conteneurs aux
            ressources limitées.
          </p>

          {deploy !== "idle" && (
            <ol className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="État du déploiement">
              {STATUS_STEPS.map((step, index) => {
                const currentIndex = STATUS_STEPS.findIndex((s) => s.id === deploy);
                const reached = index <= currentIndex;
                const active = index === currentIndex && deploy !== "deployed";
                return (
                  <li key={step.id} className={cn("flex items-center gap-2 text-sm", reached ? "text-ink" : "text-ink-4")}>
                    {reached && !active ? (
                      <CheckCircle size={18} weight="fill" className="text-ok" />
                    ) : active ? (
                      <ArrowsClockwise size={18} className="animate-spin text-accent" />
                    ) : (
                      <Circle size={18} />
                    )}
                    {step.label}
                  </li>
                );
              })}
            </ol>
          )}

          {deploy === "deployed" && (
            <p className="rounded-lg bg-sunken px-3 py-2 text-sm text-ink-2">
              Application en ligne. L&apos;adresse publique s&apos;affichera ici dès que le serveur de déploiement sera relié.
            </p>
          )}

          {deploy === "idle" && (
            <Button onClick={runDeploy} disabled={push !== "done"}>
              <RocketLaunch size={16} weight="fill" /> Déployer
            </Button>
          )}
        </div>
      </StepShell>
    </div>
  );
}

function IntegrationsTab() {
  const { activeProject } = useWorkspace();
  const [agent, setAgent] = useState<(typeof AI_AGENT_MODELS)[number]>(AI_AGENT_MODELS[0]);
  const [copied, setCopied] = useState(false);
  const [orion, setOrion] = useState<"idle" | "syncing" | "done">("idle");
  const later = useSimulatedTimers();
  const { nodes } = useProjectGraph(activeProject?.slug ?? "none", { persist: false });

  if (!activeProject) return null;

  const config = JSON.stringify(
    {
      mcpServers: {
        "lonkoo-architecture": {
          url: `https://<votre-domaine>/mcp/projects/${activeProject.name}/sse`,
          headers: {
            Authorization: "Bearer <votre-clé-mcp>",
            "X-Agent": agent.name,
          },
          exposedResources: [
            `architecture://${activeProject.name}/topology`,
            `architecture://${activeProject.name}/stack-versions`,
            `architecture://${activeProject.name}/adr-documentation`,
          ],
        },
      },
    },
    null,
    2,
  );

  const copy = () => {
    void navigator.clipboard?.writeText(config);
    setCopied(true);
    later(() => setCopied(false), 2000);
  };

  const syncOrion = () => {
    setOrion("syncing");
    later(() => setOrion("done"), 700);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <section className="space-y-4 rounded-xl border border-edge bg-surface p-5 lg:col-span-7">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-subtle text-ink">
            <PlugsConnected size={18} weight="bold" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">Serveur MCP</h2>
            <p className="text-sm text-ink-3">Donnez la topologie du projet à votre agent de code.</p>
          </div>
        </div>

        <div role="radiogroup" aria-label="Agent cible" className="grid gap-2 sm:grid-cols-3">
          {AI_AGENT_MODELS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={agent.id === option.id}
              onClick={() => setAgent(option)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors",
                agent.id === option.id ? "border-accent bg-sunken text-ink ring-1 ring-accent" : "border-edge text-ink-2 hover:border-edge-strong",
              )}
            >
              {option.name}
            </button>
          ))}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Configuration</span>
            <Button variant="secondary" size="sm" onClick={copy}>
              {copied ? (
                <>
                  <CheckCircle size={14} weight="fill" className="text-ok" /> Copié
                </>
              ) : (
                <>
                  <Copy size={14} /> Copier
                </>
              )}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-inverse p-4 font-mono text-xs leading-relaxed text-inverse-ink">{config}</pre>
        </div>
      </section>

      <section className="flex flex-col justify-between gap-4 rounded-xl border border-edge bg-surface p-5 lg:col-span-5">
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-subtle text-ink">
              <RocketLaunch size={18} weight="bold" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-ink">Constructeur Orion</h2>
              <p className="text-sm text-ink-3">Envoyez les briques vers Orion.</p>
            </div>
          </div>

          <ul className="space-y-1.5">
            {nodes.slice(0, 4).map((node) => (
              <li key={node.id} className="flex items-center justify-between gap-2 rounded-lg bg-sunken px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-ink">
                  <Cube size={14} className="flex-shrink-0 text-ink-3" />
                  <span className="truncate font-medium">{node.title}</span>
                </span>
                {node.tech && <span className="flex-shrink-0 font-mono text-xs text-ink-3">{node.tech}</span>}
              </li>
            ))}
            {nodes.length === 0 && <li className="text-sm text-ink-3">Aucun bloc à synchroniser.</li>}
          </ul>
        </div>

        <div className="space-y-2.5">
          {orion === "done" && (
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <CheckCircle size={16} weight="fill" className="text-ok" />
              Modèle transmis à Orion.
            </p>
          )}
          <Button className="w-full" onClick={syncOrion} disabled={orion === "syncing" || nodes.length === 0}>
            {orion === "syncing" ? (
              <>
                <ArrowsClockwise size={16} className="animate-spin" /> Synchronisation…
              </>
            ) : (
              <>
                <RocketLaunch size={16} weight="fill" /> Envoyer vers Orion
              </>
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}

function ReleasesTab() {
  const { activeProject } = useWorkspace();
  const [versions, setVersions] = useState<ArchitectureVersion[]>(ARCHITECTURE_VERSIONS);
  const [tag, setTag] = useState("");
  const [notes, setNotes] = useState("");
  const { nodes } = useProjectGraph(activeProject?.slug ?? "none", { persist: false });

  if (!activeProject) return null;

  const bind = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanTag = tag.trim();
    if (!cleanTag) return;
    const created: ArchitectureVersion = {
      id: `rel-${cleanTag}-${versions.length}`,
      versionTag: cleanTag,
      gitCommit: Math.random().toString(16).slice(2, 9),
      gitReleaseUrl: `https://github.com/${activeProject.githubRepo}/releases/tag/${cleanTag}`,
      branch: activeProject.branch,
      title: notes.trim() || `Release ${cleanTag}`,
      author: "Vous",
      createdAt: "À l'instant",
      changesSummary: [],
      stackDelta: `${nodes.length} composants`,
      isCurrent: true,
    };
    setVersions((previous) => [created, ...previous.map((v) => ({ ...v, isCurrent: false }))]);
    setTag("");
    setNotes("");
  };

  return (
    <section className="space-y-5 rounded-xl border border-edge bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge-soft pb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-inverse text-inverse-ink">
            <GithubLogo size={18} weight="fill" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">Releases GitHub</h2>
            <p className="font-mono text-sm text-ink-3">{activeProject.githubRepo}</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-sm text-ink-2">
          <GitBranch size={14} />
          {activeProject.branch}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <ul className="space-y-2 lg:col-span-8">
          {versions.map((version) => (
            <li
              key={version.id}
              className="flex flex-col justify-between gap-2 rounded-lg bg-sunken p-3.5 sm:flex-row sm:items-center"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-0.5 font-mono text-sm font-semibold text-ink">
                    <Tag size={12} />
                    {version.versionTag}
                  </span>
                  <span className="font-mono text-xs text-ink-3">{version.gitCommit}</span>
                  {version.isCurrent && <span className="text-xs font-medium text-accent">Active</span>}
                </div>
                <div className="mt-1 text-sm font-medium text-ink">{version.title}</div>
              </div>
              <span className="text-xs text-ink-3">{version.createdAt}</span>
            </li>
          ))}
        </ul>

        <form onSubmit={bind} className="space-y-3 rounded-lg bg-sunken p-4 lg:col-span-4">
          <div className="text-sm font-semibold text-ink">Associer un tag</div>
          <Field label="Tag" htmlFor="release-tag">
            <input
              id="release-tag"
              type="text"
              required
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              placeholder="v1.0.0"
              className={cn(inputClass, "bg-surface font-mono")}
            />
          </Field>
          <Field label="Notes de version" htmlFor="release-notes">
            <textarea
              id="release-notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Changements associés"
              className={cn(textareaClass, "bg-surface")}
            />
          </Field>
          <Button type="submit" className="w-full">
            <Tag size={14} weight="bold" /> Lier la release
          </Button>
        </form>
      </div>
    </section>
  );
}

const TABS: ReadonlyArray<{ id: DeployTab; label: string }> = [
  { id: "pipeline", label: "Déploiement" },
  { id: "integrations", label: "MCP et Orion" },
  { id: "releases", label: "Releases" },
];

export default function DeployPage() {
  const { activeProject } = useWorkspace();
  const [tab, setTab] = useState<DeployTab>("pipeline");

  return (
    <>
      <PageHeader title="Déploiement" />
      <div className="mx-auto max-w-4xl space-y-5">
        {!activeProject ? (
          <div className="rounded-xl border border-dashed border-edge-strong bg-surface p-10 text-center">
            <h2 className="text-base font-semibold text-ink">Aucun projet</h2>
            <p className="mt-1 text-sm text-ink-3">Créez un projet pour préparer son déploiement.</p>
            <Button href="/dashboard?new=1" className="mt-4" size="sm">
              Nouveau projet
            </Button>
          </div>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Sections du déploiement"
              className="flex items-center gap-1 overflow-x-auto rounded-xl border border-edge bg-surface p-1"
            >
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "flex-shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    tab === item.id ? "bg-subtle text-ink" : "text-ink-3 hover:bg-sunken hover:text-ink",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* La clé remet le parcours à zéro quand on change de projet. */}
            <div key={activeProject.slug}>
              {tab === "pipeline" && <PipelineTab />}
              {tab === "integrations" && <IntegrationsTab />}
              {tab === "releases" && <ReleasesTab />}
            </div>
          </>
        )}
      </div>
    </>
  );
}
