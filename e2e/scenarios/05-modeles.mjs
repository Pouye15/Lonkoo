export const title = "Nouveau projet à partir d'un modèle de départ : le Studio s'ouvre avec ses blocs, un projet vide reste vide, le projet se génère";

export async function run(h) {
  const board = (page) => page.getByRole("application", { name: "Tableau blanc d'architecture" });
  const nodeCount = (page) => board(page).locator("[data-node-id]").count();

  async function waitNodes(page, expected, timeout = 20000) {
    const end = Date.now() + timeout;
    let last = -1;
    while (Date.now() < end) {
      last = await nodeCount(page);
      if (last === expected) return true;
      await page.waitForTimeout(150);
    }
    console.log(`   (attendu ${expected}, vu ${last})`);
    return false;
  }

  const a = await h.newGuest("A");
  const A = a.page;

  // ------------------------------------------------------------------ Ce que l'API propose
  const list = await (await A.request.get(h.base + "/api/templates")).json();
  const tontine = list.find((t) => t.id === "tontine-numerique");
  h.check("l'API propose cinq modèles", list.length === 5, `${list.length} modèle(s)`);

  // ------------------------------------------------------------------ Le dialogue de création
  async function openDialog() {
    await A.goto(h.base + "/dashboard?new=1", { waitUntil: "load" });
    const dialog = A.getByRole("dialog");
    await dialog.getByRole("radiogroup", { name: "Point de départ" }).waitFor({ timeout: 15000 });
    await dialog.getByRole("radio", { name: /Tontine/ }).waitFor({ timeout: 15000 });
    return dialog;
  }

  let dialog = await openDialog();
  const choices = dialog.getByRole("radiogroup", { name: "Point de départ" }).getByRole("radio");
  h.check("le dialogue offre « Projet vide » et les cinq modèles", (await choices.count()) === 6, `${await choices.count()} choix`);
  h.check("« Projet vide » est choisi par défaut", (await dialog.getByRole("radio", { name: /Projet vide/ }).getAttribute("aria-checked")) === "true");
  h.check("chaque modèle dit sa taille (blocs et liens)", (await dialog.getByText(`${tontine.blocks} blocs · ${tontine.links} liens`).count()) >= 1);
  await h.shot(A, "A-choix-modele");

  // ------------------------------------------------------------------ Créer depuis la tontine
  await dialog.getByLabel("Nom du projet").fill("tontine-demo");
  await dialog.getByRole("radio", { name: /Tontine/ }).click();
  h.check("le modèle cliqué est le modèle choisi", (await dialog.getByRole("radio", { name: /Tontine/ }).getAttribute("aria-checked")) === "true"
    && (await dialog.getByRole("radio", { name: /Projet vide/ }).getAttribute("aria-checked")) === "false");
  await dialog.getByRole("button", { name: "Créer le projet" }).click();
  await A.waitForURL(/\/studio\?project=tontine-demo/, { timeout: 20000 });
  await board(A).waitFor({ timeout: 25000 });
  h.check(`le Studio s'ouvre avec les ${tontine.blocks} blocs de la tontine`, await waitNodes(A, tontine.blocks));
  h.check("un bloc du modèle est lisible (« Collecte cotisations »)", (await board(A).getByText("Collecte cotisations").count()) >= 1);
  await h.shot(A, "A-tontine");

  // ------------------------------------------------------------------ Un projet vide reste vide
  dialog = await openDialog();
  await dialog.getByLabel("Nom du projet").fill("vide-demo");
  await dialog.getByRole("button", { name: "Créer le projet" }).click();
  await A.waitForURL(/\/studio\?project=vide-demo/, { timeout: 20000 });
  await board(A).waitFor({ timeout: 25000 });
  await A.waitForTimeout(800);
  h.check("sans modèle, le canvas est vide (comme avant)", (await nodeCount(A)) === 0);

  // ------------------------------------------------------------------ Le projet du modèle se génère
  const projects = await (await A.request.get(h.base + "/api/projects")).json();
  const project = projects.find((p) => p.name === "tontine-demo");
  const canvases = await (await A.request.get(`${h.base}/api/projects/${project.id}/canvases`)).json();
  const started = await A.request.post(`${h.base}/api/canvases/${canvases[0].id}/generate`, { data: {} });
  h.check("la génération du projet de la tontine est acceptée", started.status() === 202, `statut ${started.status()}`);
  const { generationId } = await started.json();
  let generation = null;
  for (let i = 0; i < 60; i++) {
    generation = await (await A.request.get(`${h.base}/api/generations/${generationId}`)).json();
    if (generation.status === "DONE" || generation.status === "FAILED") break;
    await A.waitForTimeout(1000);
  }
  h.check("la génération se termine (DONE)", generation?.status === "DONE", `état ${generation?.status}`);
  const files = JSON.stringify(generation?.files ?? []).toLowerCase();
  h.check("le projet généré contient les entités de la tontine", ["cotisation", "membre", "cercle", "participation", "tour"].every((name) => files.includes(name)));
}
