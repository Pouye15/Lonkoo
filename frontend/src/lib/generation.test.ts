import assert from "node:assert/strict";
import { test } from "node:test";
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
} from "./generation.ts";

const push = { status: null, repoFullName: null, repoUrl: null, commitSha: null, workflowSent: false, warnings: [], error: null, pushedAt: null };

function generation(overrides: Omit<Partial<Generation>, "push"> & { push?: Partial<Generation["push"]> } = {}): Generation {
  const { push: pushOverrides, ...rest } = overrides;
  return {
    id: "g1",
    canvasId: "c1",
    versionId: null,
    target: "spring-boot",
    status: "DONE",
    projectName: "Démo",
    slug: "demo",
    fileCount: 32,
    totalBytes: 26495,
    warnings: [],
    error: null,
    createdAt: "2026-10-21T20:00:00Z",
    finishedAt: "2026-10-21T20:00:01Z",
    ...rest,
    push: { ...push, ...pushOverrides },
  };
}

function deployment(status: Deployment["status"], method: Deployment["method"] = "WORKFLOW"): Deployment {
  return { id: "d1", generationId: "g1", method, status, publicUrl: null, runUrl: null, detail: null, createdAt: "", updatedAt: "", manual: null };
}

test("les noms de dépôt suivent les règles du serveur", () => {
  for (const ok of ["demo", "ma-boutique", "a.b_c-d", "A", "x".repeat(100), ".github-demo", "v1.0"]) {
    assert.equal(isValidRepoName(ok), true, ok);
  }
  for (const bad of ["", ".", "..", "a/b", "a b", "é", "x".repeat(101), "démo", "a;b", "projet.git", "PROJET.GIT", "a\nb"]) {
    assert.equal(isValidRepoName(bad), false, JSON.stringify(bad));
  }
});

test("un nom de dépôt valable est proposé à partir de n'importe quel nom de dossier", () => {
  assert.equal(repoNameFrom("demo"), "demo");
  assert.equal(repoNameFrom("Ma boutique !"), "Ma-boutique");
  assert.equal(repoNameFrom("projet.git"), "projet");
  assert.equal(repoNameFrom("---"), "mon-projet");
  assert.equal(repoNameFrom(null), "mon-projet");
  assert.equal(repoNameFrom("é".repeat(5)), "mon-projet");
  assert.equal(repoNameFrom("a".repeat(150)).length, 100);
  for (const slug of ["Ma boutique !", "x/y", "..", "a.git", "ça va", "", "  "]) {
    assert.equal(isValidRepoName(repoNameFrom(slug)), true, slug);
  }
});

test("seules les adresses http(s) sans identifiants deviennent des liens", () => {
  assert.equal(safeHttpUrl("https://demo.example.com/app?x=1"), "https://demo.example.com/app?x=1");
  assert.equal(safeHttpUrl("http://127.0.0.1:8080"), "http://127.0.0.1:8080/");
  for (const bad of ["javascript:alert(1)", "data:text/html,<b>x", "ftp://exemple.com", "file:///etc/passwd", "//exemple.com", "exemple.com", "https://u:p@exemple.com", "", null, undefined]) {
    assert.equal(safeHttpUrl(bad as string | null | undefined), undefined, String(bad));
  }
});

test("tailles et empreintes lisibles", () => {
  assert.equal(formatBytes(512), "512 o");
  assert.equal(formatBytes(26495), "26 Ko");
  assert.equal(formatBytes(2048), "2,0 Ko");
  assert.equal(formatBytes(1_500_000), "1,4 Mo");
  assert.equal(shortSha("0123456789abcdef0123456789abcdef01234567"), "0123456");
  assert.equal(shortSha(null), "");
});

test("les étapes avancent dans l'ordre et chacune verrouille la suivante", () => {
  assert.deepEqual(stagesOf(null, null), { generate: "idle", push: "locked", deploy: "locked" });
  assert.deepEqual(stagesOf(generation({ status: "RUNNING" }), null), { generate: "running", push: "locked", deploy: "locked" });
  assert.deepEqual(stagesOf(generation({ status: "FAILED" }), null), { generate: "failed", push: "locked", deploy: "locked" });
  assert.deepEqual(stagesOf(generation(), null), { generate: "done", push: "idle", deploy: "locked" });
  assert.deepEqual(stagesOf(generation({ push: { status: "RUNNING" } }), null), { generate: "done", push: "running", deploy: "locked" });
  assert.deepEqual(stagesOf(generation({ push: { status: "FAILED" } }), null), { generate: "done", push: "failed", deploy: "locked" });
  assert.deepEqual(stagesOf(generation({ push: { status: "DONE" } }), null), { generate: "done", push: "done", deploy: "idle" });
});

test("l'état du déploiement donne celui de la dernière étape", () => {
  const pushed = generation({ push: { status: "DONE" } });
  assert.equal(stagesOf(pushed, deployment("PENDING")).deploy, "running");
  assert.equal(stagesOf(pushed, deployment("RUNNING")).deploy, "running");
  assert.equal(stagesOf(pushed, deployment("DEPLOYED")).deploy, "done");
  assert.equal(stagesOf(pushed, deployment("MANUAL", "MANUAL")).deploy, "done");
  assert.equal(stagesOf(pushed, deployment("FAILED")).deploy, "failed");
});

test("on interroge le serveur tant qu'un travail est en cours, pas après", () => {
  assert.equal(needsPolling(null, null), false);
  assert.equal(needsPolling(generation({ status: "PENDING" }), null), true);
  assert.equal(needsPolling(generation({ status: "RUNNING" }), null), true);
  assert.equal(needsPolling(generation({ push: { status: "RUNNING" } }), null), true);
  assert.equal(needsPolling(generation({ push: { status: "DONE" } }), deployment("RUNNING")), true);
  assert.equal(needsPolling(generation({ push: { status: "DONE" } }), deployment("PENDING")), true);
  assert.equal(needsPolling(generation({ push: { status: "DONE" } }), deployment("DEPLOYED")), false);
  assert.equal(needsPolling(generation({ push: { status: "DONE" } }), deployment("MANUAL", "MANUAL")), false);
  assert.equal(needsPolling(generation({ status: "FAILED" }), null), false);
  assert.equal(needsPolling(generation(), null), false);
});
