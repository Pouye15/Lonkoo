/**
 * Génération de projet, envoi sur GitHub et déploiement (lot R8) : formes des réponses de l'API
 * (docs/openapi.yaml) et règles pures de la page « Déployer ». Aucun accès réseau ici, pour pouvoir tester ces
 * règles seules (`npm test`) ; les appels sont dans `generation-api.ts`.
 */

export type JobStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED";

export interface GenerationFile {
  path: string;
  bytes: number;
}

export interface GenerationPush {
  /** `null` tant qu'aucun envoi n'a été demandé. */
  status: JobStatus | null;
  repoFullName: string | null;
  repoUrl: string | null;
  commitSha: string | null;
  workflowSent: boolean;
  warnings: string[];
  error: string | null;
  pushedAt: string | null;
}

export interface Generation {
  id: string;
  canvasId: string;
  versionId: string | null;
  target: string;
  status: JobStatus;
  projectName: string;
  slug: string | null;
  fileCount: number | null;
  totalBytes: number | null;
  warnings: string[];
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  push: GenerationPush;
  /** Présent seulement au détail d'une génération terminée. */
  files?: GenerationFile[] | null;
}

export type DeploymentStatus = "PENDING" | "RUNNING" | "DEPLOYED" | "FAILED" | "MANUAL";

export interface ManualSteps {
  actionsUrl: string;
  secretsUrl: string;
  secrets: string[];
  commands: string[];
}

export interface Deployment {
  id: string;
  generationId: string;
  method: "WORKFLOW" | "MANUAL";
  status: DeploymentStatus;
  publicUrl: string | null;
  runUrl: string | null;
  detail: string | null;
  createdAt: string;
  updatedAt: string;
  manual: ManualSteps | null;
}

export interface GithubStatus {
  connected: boolean;
  /** Un jeton était présent mais GitHub ne le reconnaît plus. */
  expired: boolean;
  login: string | null;
  scopes: string[];
  /** `null` : GitHub n'annonce pas les autorisations du jeton. */
  canPublish: boolean | null;
  canPrivate: boolean | null;
  canDeploy: boolean | null;
}

/* ------------------------------------------------------------------ */
/* Règles                                                               */
/* ------------------------------------------------------------------ */

const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

/** Nom de dépôt accepté par le serveur (voir `PublicationService`) : mêmes règles, pour refuser avant l'envoi. */
export function isValidRepoName(name: string): boolean {
  return REPO_NAME.test(name) && name !== "." && name !== ".." && !name.toLowerCase().endsWith(".git");
}

/** Un nom de dépôt valable proposé à partir du nom de dossier du projet généré. */
export function repoNameFrom(slug: string | null | undefined): string {
  const cleaned = (slug ?? "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100);
  const name = cleaned.toLowerCase().endsWith(".git") ? cleaned.slice(0, -4) : cleaned;
  return isValidRepoName(name) ? name : "mon-projet";
}

/**
 * Une adresse affichable comme lien : http ou https seulement, sans identifiants. Tout le reste (`javascript:`, `data:`…)
 * donne `undefined` : une adresse saisie par un utilisateur n'est jamais mise telle quelle dans un `href`.
 */
export function safeHttpUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "";
}

/** « 26 Ko », « 1,3 Mo » : la taille d'un projet généré. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib < 10 ? kib.toFixed(1).replace(".", ",") : Math.round(kib)} Ko`;
  return `${(kib / 1024).toFixed(1).replace(".", ",")} Mo`;
}

export function isActive(status: JobStatus | DeploymentStatus | null | undefined): boolean {
  return status === "PENDING" || status === "RUNNING";
}

/** Faut-il continuer à interroger le serveur ? Oui tant qu'un travail (génération, envoi, déploiement) est en cours. */
export function needsPolling(generation: Generation | null, deployment: Deployment | null): boolean {
  return Boolean(generation && (isActive(generation.status) || isActive(generation.push.status))) || isActive(deployment?.status);
}

export type StepState = "locked" | "idle" | "running" | "done" | "failed";

export interface Stages {
  generate: StepState;
  push: StepState;
  /** `done` : déployé ; `manual` compte comme `done` pour la progression mais l'interface y affiche les étapes à suivre. */
  deploy: StepState;
}

/** L'état des trois étapes, d'après la dernière génération et son dernier déploiement. */
export function stagesOf(generation: Generation | null, deployment: Deployment | null): Stages {
  if (!generation) return { generate: "idle", push: "locked", deploy: "locked" };

  const generate: StepState =
    generation.status === "DONE" ? "done" : generation.status === "FAILED" ? "failed" : "running";
  if (generate !== "done") return { generate, push: "locked", deploy: "locked" };

  const pushStatus = generation.push.status;
  const push: StepState =
    pushStatus === "DONE" ? "done" : pushStatus === "FAILED" ? "failed" : pushStatus ? "running" : "idle";
  if (push !== "done") return { generate, push, deploy: "locked" };

  const deploy: StepState = !deployment
    ? "idle"
    : deployment.status === "DEPLOYED" || deployment.status === "MANUAL"
      ? "done"
      : deployment.status === "FAILED"
        ? "failed"
        : "running";
  return { generate, push, deploy };
}
