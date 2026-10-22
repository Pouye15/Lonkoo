"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowsClockwise,
  ArrowSquareOut,
  CheckCircle,
  Circle,
  Copy,
  Cube,
  DownloadSimple,
  FileText,
  GithubLogo,
  RocketLaunch,
  WarningCircle,
} from "@phosphor-icons/react";
import { ApiError, messageOf, relativeTime, apiFetch, type ApiVersion } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  downloadUrl,
  deploy as requestDeploy,
  fileText,
  generation as readGeneration,
  githubLoginUrl,
  githubStatus,
  latestDeployment,
  latestGeneration,
  pushToGithub,
  startGeneration,
} from "@/lib/generation-api";
import {
  formatBytes,
  isValidRepoName,
  needsPolling,
  repoNameFrom,
  safeHttpUrl,
  shortSha,
  stagesOf,
  type Deployment,
  type Generation,
  type GithubStatus,
} from "@/lib/generation";
import { useSession } from "@/lib/session";
import { ensureCanvas, useWorkspace } from "@/lib/workspace";
import { StepShell, type StepState } from "@/components/deploy/StepShell";
import { Button } from "@/components/ui/Button";
import { Field, inputClass, selectClass } from "@/components/ui/Field";

const POLL_MS = 1500;

type StepName = "generate" | "push" | "deploy";

interface Failure {
  step: StepName;
  message: string;
  /** Le serveur demande une connexion GitHub (403 « Connexion GitHub requise »). */
  needsGithub: boolean;
}

/** Message pour une action : les textes du serveur parlent d'usage et sont déjà en français, on les garde tels quels. */
function explain(step: StepName, error: unknown): Failure {
  if (error instanceof ApiError) {
    const needsGithub = error.status === 403 && error.title === "Connexion GitHub requise";
    if (step === "generate") return { step, message: error.status === 403 ? "Votre rôle ne permet pas de générer : il faut pouvoir modifier le canvas." : messageOf(error), needsGithub };
    if (error.status === 403 && !needsGithub) return { step, message: "Votre rôle ne permet pas cette action : il faut pouvoir modifier le canvas.", needsGithub };
    if (error.status === 401 || error.status === 0) return { step, message: messageOf(error), needsGithub };
    return { step, message: error.message || messageOf(error), needsGithub };
  }
  return { step, message: messageOf(error), needsGithub: false };
}

function Problem({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-edge bg-sunken p-3 text-sm text-ink-2">
      <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0 text-warn" />
      <span className="min-w-0 break-words">{message}</span>
    </p>
  );
}

function ExternalLink({ href, children }: { href: string | undefined; children: React.ReactNode }) {
  if (!href) return <span className="font-mono text-sm text-ink-2">{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 break-all font-mono text-sm font-medium text-accent hover:underline"
    >
      {children}
      <ArrowSquareOut size={13} className="flex-shrink-0" />
    </a>
  );
}

function CopyBlock({ lines, label }: { lines: string[]; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = () => {
    void navigator.clipboard?.writeText(lines.join("\n"));
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{label}</span>
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
      <pre className="overflow-x-auto rounded-lg bg-inverse p-3 font-mono text-xs leading-relaxed text-inverse-ink">{lines.join("\n")}</pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Étape 1 : générer                                                    */
/* ------------------------------------------------------------------ */

function GenerateStep({
  generation,
  versions,
  busy,
  failure,
  canGenerate,
  onGenerate,
}: {
  generation: Generation | null;
  versions: ApiVersion[];
  busy: boolean;
  failure: Failure | null;
  canGenerate: boolean;
  onGenerate: (versionId: string | undefined) => void;
}) {
  const [versionId, setVersionId] = useState("");
  const [open, setOpen] = useState<{ path: string; text: string | null; error: string | null } | null>(null);
  const running = busy || generation?.status === "PENDING" || generation?.status === "RUNNING";
  const done = generation?.status === "DONE";

  const preview = async (path: string) => {
    if (!generation) return;
    setOpen({ path, text: null, error: null });
    try {
      const text = await fileText(generation.id, path);
      setOpen({ path, text, error: null });
    } catch (error) {
      setOpen({ path, text: null, error: messageOf(error) });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        Le projet est produit à partir du canvas : une API Spring Boot avec sa base PostgreSQL, les interfaces décrites, un
        Docker Compose, la spécification OpenAPI et un README avec les schémas.
      </p>

      <Field label="Source" htmlFor="generation-source" hint="L'état actuel du canvas, ou une version enregistrée (figée).">
        <select
          id="generation-source"
          value={versionId}
          onChange={(event) => setVersionId(event.target.value)}
          disabled={running}
          className={cn(selectClass, "max-w-sm")}
        >
          <option value="">État actuel du canvas</option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.name} · {relativeTime(version.createdAt)}
            </option>
          ))}
        </select>
      </Field>

      {failure && <Problem message={failure.message} />}
      {generation?.status === "FAILED" && <Problem message={generation.error ?? "La génération a échoué."} />}

      {done && generation && (
        <div className="space-y-3 rounded-lg bg-sunken p-3">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <CheckCircle size={16} weight="fill" className="text-ok" /> Projet « {generation.projectName} » généré
            </span>
            <span className="text-ink-3">
              {generation.fileCount} fichiers · {formatBytes(generation.totalBytes ?? 0)}
            </span>
          </p>

          {generation.warnings.length > 0 && (
            <ul className="space-y-1 text-sm text-ink-2" aria-label="Avertissements de la génération">
              {generation.warnings.map((warning, index) => (
                <li key={index} className="flex items-start gap-2">
                  <WarningCircle size={15} weight="fill" className="mt-0.5 flex-shrink-0 text-warn" />
                  <span className="min-w-0 break-words">{warning}</span>
                </li>
              ))}
            </ul>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer select-none font-medium text-ink-2 hover:text-ink">Voir les fichiers</summary>
            <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto font-mono text-xs text-ink-2">
              {(generation.files ?? []).map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    onClick={() => void preview(file.path)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-subtle",
                      open?.path === file.path && "bg-subtle text-ink",
                    )}
                  >
                    <FileText size={13} className="flex-shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate">{file.path}</span>
                    <span className="flex-shrink-0 text-ink-4">{formatBytes(file.bytes)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {open && (
              <div className="mt-2">
                {open.error ? (
                  <Problem message={open.error} />
                ) : (
                  <pre
                    aria-label={`Contenu de ${open.path}`}
                    className="max-h-72 overflow-auto rounded-lg bg-inverse p-3 font-mono text-xs leading-relaxed text-inverse-ink"
                  >
                    {open.text ?? "Chargement…"}
                  </pre>
                )}
              </div>
            )}
          </details>

          <a
            href={downloadUrl(generation.id)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <DownloadSimple size={15} /> Télécharger l&apos;archive (.zip)
          </a>
        </div>
      )}

      <Button onClick={() => onGenerate(versionId || undefined)} disabled={!canGenerate || running} variant={done ? "secondary" : "primary"}>
        {running ? (
          <>
            <ArrowsClockwise size={16} className="animate-spin" /> Génération…
          </>
        ) : done || generation?.status === "FAILED" ? (
          "Générer à nouveau"
        ) : (
          <>
            <Cube size={16} weight="fill" /> Générer le projet
          </>
        )}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Étape 2 : envoyer sur GitHub                                         */
/* ------------------------------------------------------------------ */

function PushStep({
  generation,
  github,
  busy,
  failure,
  onConnect,
  onPush,
}: {
  generation: Generation;
  github: GithubStatus | null;
  busy: boolean;
  failure: Failure | null;
  onConnect: () => void;
  onPush: (repoName: string, isPrivate: boolean) => void;
}) {
  const [input, setInput] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const repoName = input ?? repoNameFrom(generation.slug);
  const nameValid = isValidRepoName(repoName);
  const push = generation.push;
  const running = busy || push.status === "RUNNING";
  const done = push.status === "DONE";
  const connected = Boolean(github?.connected);
  const privateAllowed = github?.canPrivate !== false;
  const locked = generation.status !== "DONE";

  return (
    <div className="space-y-4">
      {!connected && !locked && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-edge bg-sunken p-3 text-sm text-ink-2">
          <WarningCircle size={18} weight="fill" className="flex-shrink-0 text-warn" />
          <span className="min-w-0 flex-1">
            {github?.expired
              ? "Votre connexion GitHub a expiré : reconnectez-vous pour créer le dépôt."
              : "Connectez votre compte GitHub pour créer le dépôt. Si vous êtes invité, vos projets sont rattachés à votre compte."}
          </span>
          <Button size="sm" variant="inverse" onClick={onConnect}>
            <GithubLogo size={15} weight="fill" /> Se connecter avec GitHub
          </Button>
        </div>
      )}

      {done ? (
        <div className="space-y-2 rounded-lg bg-sunken p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <CheckCircle size={16} weight="fill" className="text-ok" /> Dépôt créé, un commit envoyé ({shortSha(push.commitSha)})
          </p>
          <ExternalLink href={safeHttpUrl(push.repoUrl)}>
            <GithubLogo size={16} weight="fill" className="flex-shrink-0" />
            {push.repoFullName}
          </ExternalLink>
          {push.warnings.map((warning, index) => (
            <p key={index} className="flex items-start gap-2 text-sm text-ink-2">
              <WarningCircle size={15} weight="fill" className="mt-0.5 flex-shrink-0 text-warn" />
              <span className="min-w-0 break-words">{warning}</span>
            </p>
          ))}
        </div>
      ) : (
        <>
          <Field label="Nom du dépôt" htmlFor="repo-name" hint="Lettres, chiffres, point, tiret et tiret bas.">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-ink-3">{github?.login ?? "vous"} /</span>
              <input
                id="repo-name"
                type="text"
                value={repoName}
                onChange={(event) => setInput(event.target.value.trim())}
                disabled={locked || running}
                maxLength={100}
                aria-invalid={!nameValid}
                className={cn(inputClass, "max-w-xs font-mono")}
              />
            </div>
          </Field>

          <div role="radiogroup" aria-label="Visibilité du dépôt" className="grid gap-2 sm:grid-cols-2">
            {[
              { id: false, label: "Public", hint: "Visible de tous sur GitHub" },
              {
                id: true,
                label: "Privé",
                hint: privateAllowed ? "Visible de vous seul" : "Demande l'autorisation « repo » (étape 3)",
              },
            ].map((option) => {
              const disabled = locked || running || (option.id && !privateAllowed);
              return (
                <button
                  key={String(option.id)}
                  type="button"
                  role="radio"
                  aria-checked={isPrivate === option.id}
                  disabled={disabled}
                  onClick={() => setIsPrivate(option.id)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors disabled:opacity-50",
                    isPrivate === option.id ? "border-accent bg-sunken ring-1 ring-accent" : "border-edge hover:border-edge-strong",
                  )}
                >
                  <span className="block text-sm font-semibold text-ink">{option.label}</span>
                  <span className="text-xs text-ink-3">{option.hint}</span>
                </button>
              );
            })}
          </div>

          {!locked && (
            <p className="text-sm text-ink-3">
              Le dépôt sera créé sur votre compte GitHub{github?.login ? ` (@${github.login})` : ""},{" "}
              {isPrivate ? "en privé" : "en public : tout le monde pourra le lire"}, avec un seul commit de {generation.fileCount}{" "}
              fichiers.
            </p>
          )}

          {failure && <Problem message={failure.message} />}
          {push.status === "FAILED" && <Problem message={push.error ?? "L'envoi a échoué."} />}

          <Button onClick={() => onPush(repoName, isPrivate)} disabled={locked || running || !nameValid || !connected} variant="inverse">
            {running ? (
              <>
                <ArrowsClockwise size={16} className="animate-spin" /> Envoi…
              </>
            ) : push.status === "FAILED" ? (
              <>
                <GithubLogo size={16} weight="fill" /> Réessayer l&apos;envoi
              </>
            ) : (
              <>
                <GithubLogo size={16} weight="fill" /> Créer le dépôt et envoyer
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Étape 3 : déployer                                                   */
/* ------------------------------------------------------------------ */

const STATUS_STEPS = [
  { id: "PENDING", label: "En attente" },
  { id: "RUNNING", label: "En cours" },
  { id: "DEPLOYED", label: "Déployé" },
] as const;

function DeploymentProgress({ status }: { status: Deployment["status"] }) {
  const current = STATUS_STEPS.findIndex((step) => step.id === status);
  return (
    <ol className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="État du déploiement">
      {STATUS_STEPS.map((step, index) => {
        const reached = index <= current;
        const active = index === current && status !== "DEPLOYED";
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
  );
}

function ManualGuide({ deployment }: { deployment: Deployment }) {
  const manual = deployment.manual;
  if (!manual) return null;
  return (
    <div className="space-y-3 rounded-lg bg-sunken p-3 text-sm text-ink-2">
      <p className="font-medium text-ink">Déployer vous-même</p>
      <ol className="list-decimal space-y-3 pl-5">
        <li className="space-y-1">
          <span>
            Créez ces secrets dans les réglages du dépôt :{" "}
            <ExternalLink href={safeHttpUrl(manual.secretsUrl)}>Secrets Actions</ExternalLink>
          </span>
          <ul className="space-y-0.5 font-mono text-xs">
            {manual.secrets.map((secret) => (
              <li key={secret}>{secret}</li>
            ))}
          </ul>
        </li>
        <li>
          Lancez ensuite le workflow depuis GitHub : <ExternalLink href={safeHttpUrl(manual.actionsUrl)}>Déployer sur Systalink</ExternalLink>
        </li>
        <li className="space-y-1.5">
          <span>Ou, sur le serveur de déploiement, sans GitHub Actions :</span>
          <CopyBlock lines={manual.commands} label="Commandes" />
        </li>
      </ol>
    </div>
  );
}

function DeployStep({
  generation,
  deployment,
  github,
  busy,
  failure,
  onDeploy,
}: {
  generation: Generation;
  deployment: Deployment | null;
  github: GithubStatus | null;
  busy: boolean;
  failure: Failure | null;
  onDeploy: (mode: "auto" | "manual", publicUrl: string) => void;
}) {
  const [publicUrl, setPublicUrl] = useState("");
  const locked = generation.push.status !== "DONE";
  const active = deployment?.status === "PENDING" || deployment?.status === "RUNNING";
  const working = busy || active;
  const connected = Boolean(github?.connected);
  const workflowSent = generation.push.workflowSent;
  const needsMoreAccess = connected && github?.canDeploy === false;
  const urlValid = publicUrl === "" || safeHttpUrl(publicUrl) !== undefined;
  const canAuto = !locked && !working && connected && workflowSent && urlValid;
  const deployedUrl = safeHttpUrl(deployment?.publicUrl);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        Le dépôt contient un workflow GitHub Actions qui copie le projet sur un serveur par SSH puis le démarre avec Docker
        Compose. Il lit quatre secrets que vous créez dans les réglages du dépôt.
      </p>

      {!locked && !workflowSent && (
        <Problem message="Le fichier de workflow n'est pas dans le dépôt (GitHub exige l'autorisation « workflow » pour l'y envoyer). Vous pouvez déployer à la main, ou autoriser le déploiement puis générer et envoyer le projet à nouveau dans un nouveau dépôt." />
      )}

      {needsMoreAccess && (
        <div className="space-y-2 rounded-lg border border-edge bg-sunken p-3 text-sm text-ink-2">
          <p>
            Pour que LONKOO lance le workflow à votre place, GitHub doit nous accorder les autorisations <strong>repo</strong> et{" "}
            <strong>workflow</strong> : cela donne accès à tous vos dépôts, publics et privés. C&apos;est facultatif : vous pouvez
            aussi déployer à la main.
          </p>
          {/* Navigation complète, pas <Link> : la route est une redirection vers GitHub, hors de l'application Next. */}
          <Button size="sm" variant="secondary" onClick={() => window.location.assign(githubLoginUrl(true))}>
            <GithubLogo size={15} weight="fill" /> Autoriser le déploiement depuis LONKOO
          </Button>
        </div>
      )}

      {deployment && !locked && (
        <div className="space-y-3">
          {(deployment.status === "PENDING" || deployment.status === "RUNNING" || deployment.status === "DEPLOYED") && (
            <DeploymentProgress status={deployment.status} />
          )}

          {deployment.status === "FAILED" && <Problem message={deployment.detail ?? "Le déploiement a échoué."} />}
          {deployment.status === "DEPLOYED" && (
            <p className="rounded-lg bg-sunken px-3 py-2 text-sm text-ink-2">
              Déploiement terminé.{" "}
              {deployedUrl ? (
                <>
                  Application : <ExternalLink href={deployedUrl}>{deployedUrl}</ExternalLink>
                </>
              ) : (
                "Indiquez l'adresse de l'application au prochain déploiement pour l'afficher ici."
              )}
            </p>
          )}
          {(deployment.status === "PENDING" || deployment.status === "RUNNING") && deployment.detail && (
            <p className="text-sm text-ink-3">{deployment.detail}</p>
          )}
          {deployment.runUrl && (
            <ExternalLink href={safeHttpUrl(deployment.runUrl)}>Voir l&apos;exécution sur GitHub Actions</ExternalLink>
          )}
          {deployment.status === "MANUAL" && deployment.detail && <p className="text-sm text-ink-3">{deployment.detail}</p>}
          {deployment.status === "MANUAL" && <ManualGuide deployment={deployment} />}
        </div>
      )}

      {failure && <Problem message={failure.message} />}

      {!locked && !active && (
        <div className="space-y-3">
          <Field
            label="Adresse publique prévue (facultatif)"
            htmlFor="public-url"
            hint="Seulement affichée dans LONKOO, jamais appelée par le serveur."
          >
            <input
              id="public-url"
              type="url"
              value={publicUrl}
              onChange={(event) => setPublicUrl(event.target.value.trim())}
              placeholder="https://mon-application.exemple.com"
              maxLength={200}
              aria-invalid={!urlValid}
              className={cn(inputClass, "max-w-md")}
            />
          </Field>
          {!urlValid && <p className="text-sm text-danger">Saisissez une adresse http:// ou https://.</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => onDeploy("auto", publicUrl)} disabled={!canAuto}>
              {busy ? (
                <>
                  <ArrowsClockwise size={16} className="animate-spin" /> Lancement…
                </>
              ) : (
                <>
                  <RocketLaunch size={16} weight="fill" />{" "}
                  {deployment?.status === "FAILED" ? "Relancer le déploiement" : deployment ? "Déployer à nouveau" : "Déployer"}
                </>
              )}
            </Button>
            <Button variant="secondary" onClick={() => onDeploy("manual", publicUrl)} disabled={locked || working || !urlValid}>
              Je déploie moi-même
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Parcours                                                              */
/* ------------------------------------------------------------------ */

const SHELL_STATE: Record<string, StepState> = { locked: "idle", idle: "idle", running: "running", done: "done", failed: "failed" };

/** Génération, envoi sur GitHub et déploiement contre l'API réelle (mode `live`) ; les travaux sont suivis par interrogation. */
export function LivePipeline() {
  const { signInWithGitHub } = useSession();
  const { activeProject } = useWorkspace();
  const canvasId = activeProject?.canvasId;
  const projectId = activeProject?.id;

  const [github, setGithub] = useState<GithubStatus | null>(null);
  const [versions, setVersions] = useState<ApiVersion[]>([]);
  const [gen, setGen] = useState<Generation | null>(null);
  const [dep, setDep] = useState<Deployment | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<StepName | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (projectId && !canvasId) ensureCanvas(projectId);
  }, [projectId, canvasId]);

  const refresh = useCallback(async () => {
    if (!canvasId) return;
    const latest = await latestGeneration(canvasId);
    const latestDep = latest && latest.push.status === "DONE" ? await latestDeployment(latest.id) : null;
    if (!alive.current) return;
    setGen(latest);
    setDep(latestDep);
  }, [canvasId]);

  // Chargement initial : connexion GitHub, versions, dernière génération et son dernier déploiement.
  // Changer de projet remonte tout le parcours (clé de la page) : pas de remise à zéro à faire ici.
  useEffect(() => {
    if (!canvasId) return;
    const controller = new AbortController();
    Promise.all([
      githubStatus(controller.signal).catch(() => null),
      apiFetch<ApiVersion[]>(`/api/canvases/${canvasId}/versions`, { signal: controller.signal }).catch(() => [] as ApiVersion[]),
      refresh(),
    ])
      .then(([status, list]) => {
        if (!alive.current || controller.signal.aborted) return;
        setGithub(status);
        setVersions(list);
        setLoaded(true);
      })
      .catch((error) => {
        if (controller.signal.aborted || !alive.current) return;
        setLoadError(messageOf(error));
        setLoaded(true);
      });
    return () => controller.abort();
  }, [canvasId, refresh]);

  // Suivi : tant qu'un travail est en cours, on relit l'état ; un échec réseau ne casse pas la boucle.
  useEffect(() => {
    if (!loaded || !needsPolling(gen, dep)) return;
    const timer = window.setTimeout(() => {
      refresh()
        .catch(() => undefined)
        .finally(() => {
          if (alive.current) setTick((n) => n + 1);
        });
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [loaded, gen, dep, tick, refresh]);

  // Une fois l'envoi terminé, les autorisations ont pu changer (retour de GitHub) : on relit la connexion.
  const pushStatus = gen?.push.status;
  useEffect(() => {
    if (pushStatus === "DONE") githubStatus().then((status) => alive.current && setGithub(status)).catch(() => undefined);
  }, [pushStatus]);

  const run = async (step: StepName, action: () => Promise<void>) => {
    setBusy(step);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      if (alive.current) setFailure(explain(step, error));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const generate = (versionId: string | undefined) =>
    run("generate", async () => {
      if (!canvasId) return;
      const id = await startGeneration(canvasId, versionId);
      const created = await readGeneration(id);
      setGen(created);
      setDep(null);
    });

  const push = (repoName: string, isPrivate: boolean) =>
    run("push", async () => {
      if (!gen) return;
      setGen(await pushToGithub(gen.id, repoName, isPrivate));
    });

  const deploy = (mode: "auto" | "manual", publicUrl: string) =>
    run("deploy", async () => {
      if (!gen) return;
      setDep(await requestDeploy(gen.id, mode, publicUrl || undefined));
    });

  const connect = () => {
    setFailure(null);
    signInWithGitHub().catch((error) => alive.current && setFailure({ step: "push", message: error instanceof Error ? error.message : messageOf(error), needsGithub: false }));
  };

  if (!activeProject) return null;
  if (!canvasId || !loaded) {
    return (
      <p role="status" className="text-sm text-ink-3">
        Chargement du projet…
      </p>
    );
  }
  if (loadError) return <Problem message={loadError} />;

  const stages = stagesOf(gen, dep);
  const stepFailure = (step: StepName) => (failure?.step === step ? failure : null);

  return (
    <div className="space-y-4">
      <StepShell index={1} title="Générer le projet" state={SHELL_STATE[stages.generate]!} locked={false}>
        <GenerateStep
          generation={gen}
          versions={versions}
          busy={busy === "generate"}
          failure={stepFailure("generate")}
          canGenerate={Boolean(canvasId)}
          onGenerate={generate}
        />
      </StepShell>

      <StepShell index={2} title="Envoyer sur GitHub" state={SHELL_STATE[stages.push]!} locked={stages.push === "locked"}>
        {gen && stages.push !== "locked" ? (
          <PushStep
            key={gen.id}
            generation={gen}
            github={github}
            busy={busy === "push"}
            failure={stepFailure("push")}
            onConnect={connect}
            onPush={push}
          />
        ) : (
          <p className="text-sm text-ink-3">Générez d&apos;abord le projet.</p>
        )}
      </StepShell>

      <StepShell index={3} title="Déployer" state={SHELL_STATE[stages.deploy]!} locked={stages.deploy === "locked"}>
        {gen && stages.deploy !== "locked" ? (
          <DeployStep
            key={gen.id}
            generation={gen}
            deployment={dep}
            github={github}
            busy={busy === "deploy"}
            failure={stepFailure("deploy")}
            onDeploy={deploy}
          />
        ) : (
          <p className="text-sm text-ink-3">Envoyez d&apos;abord le projet sur GitHub.</p>
        )}
      </StepShell>
    </div>
  );
}
