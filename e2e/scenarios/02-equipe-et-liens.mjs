export const title = "Équipe : liste, retrait, départ, liens actifs et révocation, avec coupure du temps réel";

export async function run(h) {
  const { visible, gone } = h;

  // ------------------------------------------------------------------ A : propriétaire (invité), projet d'exemple
  const A = await h.newGuest("A");
  await A.page.getByRole("link", { name: "Ouvrir" }).first().click();
  await A.page.waitForURL(/\/studio\?project=/, { timeout: 15000 });
  const projectParam = new URL(A.page.url()).searchParams.get("project");
  await A.page.goto(`${h.base}/studio?project=${projectParam}&tab=team`, { waitUntil: "load" });

  h.check("A voit l'équipe du projet avec un seul membre", await visible(A.page.getByRole("heading", { name: "Équipe du projet (1)" })));
  h.check("A est marqué « vous » et Owner", (await A.page.getByText("(vous)").count()) === 1 && (await A.page.getByText("Owner", { exact: true }).count()) >= 1);
  h.check("le propriétaire n'a ni « Retirer » ni « Quitter »", (await A.page.getByRole("button", { name: /Retirer|Quitter/ }).count()) === 0);
  h.check("aucun lien actif au départ", await visible(A.page.getByText("Aucun lien actif.")));

  // ------------------------------------------------------------------ A crée un lien
  await A.page.getByRole("button", { name: "Créer un lien de partage" }).first().click();
  const dialog = A.page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Créer le lien" }).click();
  const urlField = dialog.locator("#share-url");
  h.check("le lien est créé et montré", await visible(urlField));
  const joinUrl = await urlField.inputValue();
  const joinPath = new URL(joinUrl).pathname;
  await dialog.locator('button:text-is("Fermer")').click();
  h.check("le lien actif apparaît dans la liste sans recharger", await visible(A.page.getByText(/Expire dans/).first()));
  h.check("la liste n'affiche pas l'adresse du lien", (await A.page.getByText("/join/").count()) === 0);
  await h.shot(A.page, "A-lien");

  // ------------------------------------------------------------------ B : rejoint par le lien, ouvre le canvas (temps réel)
  const B = await h.newVisitor("B");
  await B.page.goto(h.base + joinPath, { waitUntil: "load" });
  await B.page.waitForURL(/\/studio\?project=/, { timeout: 20000 });
  const canvasLive = await visible(B.page.getByRole("application", { name: "Tableau blanc d'architecture" }), 20000);
  h.check("B rejoint par le lien et voit le tableau blanc", canvasLive);
  await B.page.waitForTimeout(1500);
  h.check("B a une connexion temps réel ouverte", B.sockets.some((w) => w.closedAt === null), `${B.sockets.length} connexion(s)`);

  const bProjectId = new URL(B.page.url()).searchParams.get("project");
  // L'onglet Équipe de B s'ouvre dans une seconde page : la première reste sur le canvas, avec sa connexion temps réel.
  const bTeam = await B.context.newPage();
  await bTeam.goto(`${h.base}/studio?project=${bProjectId}&tab=team`, { waitUntil: "load" });
  h.check("B voit deux membres", await visible(bTeam.getByRole("heading", { name: "Équipe du projet (2)" })));
  h.check("B peut quitter, pas retirer", (await bTeam.getByRole("button", { name: "Quitter le projet" }).count()) === 1 && (await bTeam.getByRole("button", { name: /Retirer/ }).count()) === 0);
  h.check("B (Write) ne voit ni liens actifs ni bouton de création", (await bTeam.getByText("Liens actifs").count()) === 0 && (await bTeam.getByRole("button", { name: "Créer un lien de partage" }).count()) === 0);
  await h.shot(bTeam, "B-equipe");
  await bTeam.close();

  // ------------------------------------------------------------------ A voit B, hésite (Annuler), puis le retire
  await A.page.reload({ waitUntil: "load" });
  h.check("A voit deux membres", await visible(A.page.getByRole("heading", { name: "Équipe du projet (2)" })));
  const removeButton = A.page.getByRole("button", { name: /^Retirer .* du projet$/ });
  h.check("A voit « Retirer » sur B seulement", (await removeButton.count()) === 1);
  h.check("A est averti qu'un lien actif permet le retour", await visible(A.page.getByText(/Une personne retirée peut revenir/)));
  await h.shot(A.page, "A-deux-membres");

  await removeButton.click();
  const confirmDialog = A.page.getByRole("dialog");
  h.check("la confirmation nomme la personne et rappelle le lien", await visible(confirmDialog.getByText(/révoquez-le aussi/)));
  await h.shot(A.page, "A-confirmation");
  await confirmDialog.getByRole("button", { name: "Annuler" }).click();
  h.check("Annuler ne retire personne", (await gone(confirmDialog)) && (await A.page.getByRole("heading", { name: "Équipe du projet (2)" }).count()) === 1);

  await removeButton.click();
  const removedAt = Date.now();
  await A.page.getByRole("dialog").getByRole("button", { name: "Retirer du projet" }).click();
  h.check("B est retiré, la liste revient à un membre", await visible(A.page.getByRole("heading", { name: "Équipe du projet (1)" })));
  h.check("A est informé du retrait", await visible(A.page.getByRole("status")));

  // ------------------------------------------------------------------ B perd l'accès et sa connexion temps réel est coupée
  await B.page.waitForTimeout(2500);
  const status = await B.page.request.get(`${h.base}/api/projects/${bProjectId}`).then((r) => r.status());
  h.check("B n'a plus accès au projet (404)", status === 404, `statut ${status}`);
  const before = B.sockets.filter((w) => w.openedAt < removedAt);
  h.check(
    "les connexions temps réel que B avait avant le retrait sont coupées",
    before.length > 0 && before.every((w) => w.closedAt !== null),
    `${before.length} connexion(s), ${before.filter((w) => w.closedAt === null).length} encore ouverte(s)`,
  );
  await h.shot(B.page, "B-apres-retrait");
  const canvasId = (await (await A.page.request.get(`${h.base}/api/projects/${bProjectId}/canvases`)).json())[0].id;
  const ticket = await B.page.request.post(`${h.base}/api/canvases/${canvasId}/realtime-ticket`).then((r) => r.status());
  h.check("B ne peut plus obtenir de ticket temps réel", ticket === 404, `statut ${ticket}`);

  // ------------------------------------------------------------------ Le lien est encore actif : B revient
  const B2 = await h.newVisitor("B2");
  // Même session que B (cookies copiés) : c'est la même personne qui rouvre le lien.
  await B2.context.addCookies(await B.context.cookies());
  await B2.page.goto(h.base + joinPath, { waitUntil: "load" });
  await B2.page.waitForURL(/\/studio\?project=/, { timeout: 20000 }).catch(() => {});
  h.check("le lien encore actif ramène B dans le projet", B2.page.url().includes("/studio?project="));
  await A.page.reload({ waitUntil: "load" });
  h.check("A revoit deux membres", await visible(A.page.getByRole("heading", { name: "Équipe du projet (2)" })));

  // ------------------------------------------------------------------ A retire B puis révoque le lien
  await removeButton.click();
  await A.page.getByRole("dialog").getByRole("button", { name: "Retirer du projet" }).click();
  h.check("A retire B une seconde fois", await visible(A.page.getByRole("heading", { name: "Équipe du projet (1)" })));
  await A.page.getByRole("button", { name: /^Révoquer le lien/ }).click();
  const revokeDialog = A.page.getByRole("dialog");
  h.check("la révocation prévient que ceux qui ont ouvert le lien restent", await visible(revokeDialog.getByText(/restent dans le projet/)));
  await h.shot(A.page, "A-revocation");
  await revokeDialog.getByRole("button", { name: "Révoquer le lien" }).click();
  h.check("le lien disparaît de la liste", await visible(A.page.getByText("Aucun lien actif.")));

  const B3 = await h.newVisitor("B3");
  await B3.context.addCookies(await B.context.cookies());
  await B3.page.goto(h.base + joinPath, { waitUntil: "load" });
  h.check("le lien révoqué affiche une erreur claire", await visible(B3.page.getByText(/inconnu ou a expiré/)));
  h.check("B reste sans accès", (await B3.page.request.get(`${h.base}/api/projects/${bProjectId}`).then((r) => r.status())) === 404);

  // ------------------------------------------------------------------ Quitter soi-même
  await A.page.getByRole("button", { name: "Créer un lien de partage" }).first().click();
  await A.page.getByRole("dialog").getByRole("button", { name: "Créer le lien" }).click();
  const secondPath = new URL(await A.page.getByRole("dialog").locator("#share-url").inputValue()).pathname;
  await A.page.getByRole("dialog").locator('button:text-is("Fermer")').click();

  const C = await h.newVisitor("C");
  await C.page.goto(h.base + secondPath, { waitUntil: "load" });
  await C.page.waitForURL(/\/studio\?project=/, { timeout: 20000 });
  const cProjectId = new URL(C.page.url()).searchParams.get("project");
  await C.page.goto(`${h.base}/studio?project=${cProjectId}&tab=team`, { waitUntil: "load" });
  await C.page.getByRole("button", { name: "Quitter le projet" }).click();
  await C.page.getByRole("dialog").getByText("Vous n'y aurez plus accès").waitFor({ state: "visible" }).catch(() => {});
  await C.page.getByRole("dialog").getByRole("button", { name: "Quitter le projet" }).click();
  await C.page.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {});
  h.check("C quitte le projet et revient à la liste des projets", C.page.url().includes("/dashboard"));
  await C.page.getByText("Chargement de vos projets").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  h.check("le projet n'est plus dans la liste de C", (await C.page.request.get(`${h.base}/api/projects/${cProjectId}`).then((r) => r.status())) === 404);
  await A.page.reload({ waitUntil: "load" });
  h.check("A voit à nouveau un seul membre", await visible(A.page.getByRole("heading", { name: "Équipe du projet (1)" })));

  h.noScriptErrors();
}
