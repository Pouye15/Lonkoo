export const title = "Audit par règles : le score vient du schéma dessiné, une correction le fait monter et reste après rechargement, un canvas vide n'a rien à noter";

export async function run(h) {
  const a = await h.newGuest("A");
  const A = a.page;

  const create = async (name, template) => {
    const response = await A.request.post(h.base + "/api/projects", { data: template ? { name, template } : { name } });
    h.check(`le projet « ${name} » est créé`, response.status() === 201, `statut ${response.status()}`);
    // L'adresse du Studio désigne le projet par son identifiant : le nom court ne suffit pas (le serveur ajoute un suffixe).
    return (await response.json()).id;
  };

  const score = A.locator("[data-audit-score]");
  const findings = A.locator("li[data-rule]");

  /** Ouvre l'onglet Audit et attend que le schéma partagé soit arrivé (le score passe de « — » à un nombre). */
  async function openAudit(project) {
    await A.goto(`${h.base}/studio?project=${project}&tab=scanner`, { waitUntil: "load" });
    await score.waitFor({ timeout: 25000 });
    const end = Date.now() + 25000;
    while (Date.now() < end) {
      if (/^\d+\/100$/.test((await score.textContent())?.trim() ?? "")) return true;
      await A.waitForTimeout(150);
    }
    return false;
  }
  const scoreValue = async () => Number.parseInt((await score.textContent()) ?? "", 10);

  // ------------------------------------------------------------------ Le score vient du schéma
  const demo = await create("audit-demo", "clinique-rendez-vous");
  h.check("l'onglet Audit affiche un score calculé sur le schéma de la clinique", await openAudit(demo));
  const before = await scoreValue();
  h.check("ce n'est plus le score constant d'avant (86 %)", Number.isInteger(before) && before !== 86 && before >= 0 && before <= 100, `score ${before}`);
  h.check("la base à une instance est signalée", (await A.locator('li[data-rule="base-sans-replique"]').count()) === 1);
  h.check("le paiement sans file est signalé", (await A.locator('li[data-rule="paiement-sans-file"]').count()) === 1);
  const count = await findings.count();
  h.check("l'onglet annonce le nombre de constats", (await A.getByText(`Audit (${count})`).count()) >= 1, `${count} constat(s)`);
  h.check("la formule du score est dite", (await A.getByText(/100 moins 20 par constat critique/).count()) === 1);
  await h.shot(A, "A-audit-avant");

  // ------------------------------------------------------------------ Corriger fait monter le score
  await A.getByRole("button", { name: "Passer à 2 répliques" }).click();
  const end = Date.now() + 15000;
  while (Date.now() < end && (await A.locator('li[data-rule="base-sans-replique"]').count()) > 0) await A.waitForTimeout(150);
  h.check("la correction fait disparaître le constat", (await A.locator('li[data-rule="base-sans-replique"]').count()) === 0);
  h.check("le score monte de 10 points (un constat important de moins)", (await scoreValue()) === before + 10, `${before} puis ${await scoreValue()}`);
  await h.shot(A, "A-audit-apres");

  // La correction est écrite dans le document partagé : elle est encore là après rechargement.
  await A.waitForTimeout(1500);
  h.check("après rechargement, le schéma corrigé donne le même score", (await openAudit(demo)) && (await scoreValue()) === before + 10, `score ${await scoreValue()}`);

  // ------------------------------------------------------------------ Aller au bloc concerné
  await A.locator('li[data-rule="paiement-sans-file"]').getByRole("button", { name: "Paiement soins" }).click();
  await A.getByRole("application", { name: "Tableau blanc d'architecture" }).waitFor({ timeout: 15000 });
  h.check("« Paiement soins » ouvre le tableau blanc", !A.url().includes("tab=scanner"), A.url());

  // ------------------------------------------------------------------ Rien à noter sur un canvas vide
  const vide = await create("audit-vide");
  await A.goto(`${h.base}/studio?project=${vide}&tab=scanner`, { waitUntil: "load" });
  await score.waitFor({ timeout: 25000 });
  await A.waitForTimeout(1200);
  h.check("un canvas vide n'a pas de score", ((await score.textContent()) ?? "").trim() === "—");
  h.check("il le dit", (await A.getByText("Le canvas est vide : il n'y a rien à auditer.").count()) === 1);
  h.check("les suggestions de démonstration ne s'affichent pas pour un bloc qui n'existe pas", (await A.getByText("Suggestions de l'IA").count()) === 0);

  // ------------------------------------------------------------------ À la largeur d'un téléphone
  await A.setViewportSize({ width: 390, height: 800 });
  const shown = await openAudit(demo);
  h.check("l'audit s'affiche à 390 px", shown, `${A.url()} · score « ${(await score.textContent())?.trim()} » · ${(await A.getByText(/\d+ blocs et \d+ liens lus/).textContent())?.trim()}`);
  h.check("à 390 px, la page ne déborde pas à l'horizontale", await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  h.check("à 390 px, le score reste lisible", (await score.isVisible()) && (await findings.count()) >= 1);
  await h.shot(A, "A-audit-telephone");
}
