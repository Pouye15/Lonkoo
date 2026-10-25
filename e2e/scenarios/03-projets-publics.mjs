export const title = "Projets publics : lecture seule pour toute personne connectée, projet privé introuvable, visiteurs sortis au retour en privé";

/**
 * Deux parties :
 * - la galerie, seulement si un compte GitHub a un projet public connu (E2E_GALLERY_PROJECT_ID et
 *   E2E_GALLERY_PROJECT_NAME ; E2E_GALLERY_OWNER_LOGIN en plus pour vérifier le fil d'Ariane) : une galerie ne liste que
 *   les projets de comptes GitHub, qu'un parcours ne peut pas créer ;
 * - le reste, qui ne dépend de rien : des invités se créent tout seuls leurs projets.
 */
export async function run(h) {
  const { visible } = h;
  const status = (page, path) => page.evaluate(async (p) => (await fetch(p)).status, path);
  const readOnlyNote = (page) => page.getByRole("note").filter({ hasText: "lecture seule" });
  const visibilityButton = (page, label) => page.locator("article button").filter({ hasText: new RegExp(`^${label}$`) }).first();

  // ------------------------------------------------------------------ La galerie (projet public d'un compte GitHub)
  const galleryId = process.env.E2E_GALLERY_PROJECT_ID;
  const galleryName = process.env.E2E_GALLERY_PROJECT_NAME;
  if (galleryId && galleryName) {
    const V = await h.newGuest("V");
    await V.page.goto(h.base + "/palabre", { waitUntil: "load" });
    h.check("la galerie publique s'affiche", await visible(V.page.getByRole("heading", { name: "Galerie publique" })));
    const card = V.page.getByRole("link", { name: `Consulter ${galleryName} en lecture seule` });
    h.check("la fiche du projet public est là", await visible(card));
    await h.shot(V.page, "galerie");

    await card.click();
    await V.page.waitForURL(/\/studio\?project=/, { timeout: 15000 });
    h.check("la fiche ouvre le projet par son identifiant", V.page.url().includes(galleryId));
    if (process.env.E2E_GALLERY_OWNER_LOGIN) {
      h.check(
        "le fil d'Ariane nomme le propriétaire, pas le visiteur",
        await visible(V.page.getByRole("navigation", { name: "Fil d'Ariane" }).getByText(process.env.E2E_GALLERY_OWNER_LOGIN)),
      );
    }
    h.check("le bandeau annonce la lecture seule", await visible(readOnlyNote(V.page)));
    h.check("le tableau blanc s'affiche", await visible(V.page.getByRole("application", { name: "Tableau blanc d'architecture" }), 20000));
    h.check(
      "ni « Déployer », ni « Créer une revue », ni « Partager »",
      (await V.page.getByRole("link", { name: /Déployer|Créer une revue/ }).count()) === 0 &&
        (await V.page.getByRole("button", { name: /Partager/ }).count()) === 0,
    );
    const ticketRole = await V.page.evaluate(async (id) => {
      const canvases = await (await fetch(`/api/projects/${id}/canvases`)).json();
      return (await (await fetch(`/api/canvases/${canvases[0].id}/realtime-ticket`, { method: "POST" })).json()).role;
    }, galleryId);
    h.check("le serveur le met en lecture seule (ticket READ)", ticketRole === "READ", ticketRole);

    await V.page.goto(`${h.base}/studio?project=${galleryId}&tab=team`, { waitUntil: "load" });
    h.check("l'équipe d'un projet public n'est pas montrée", await visible(V.page.getByText(/visible que de ses membres/)));
    await V.page.goto(h.base + "/dashboard", { waitUntil: "load" });
    await V.page.getByText("Chargement de vos projets").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    h.check("le projet visité n'est pas dans « mes projets »", (await V.page.getByText(galleryName).count()) === 0);
  } else {
    h.skip("galerie publique", "aucun projet public de compte GitHub indiqué (E2E_GALLERY_PROJECT_ID et E2E_GALLERY_PROJECT_NAME)");
  }

  // ------------------------------------------------------------------ Un projet privé d'une autre personne reste introuvable
  const P = await h.newGuest("P");
  const privateId = await P.page.evaluate(async () => (await (await fetch("/api/projects")).json())[0].id);
  const D = await h.newGuest("D");
  await D.page.goto(`${h.base}/studio?project=${privateId}`, { waitUntil: "load" });
  h.check(
    "un projet privé d'une autre personne reste introuvable, et le dit",
    await visible(D.page.getByRole("alert").filter({ hasText: /introuvable ou non visible/ }), 20000),
  );
  h.check("… et ne s'ouvre pas en lecture seule", (await readOnlyNote(D.page).count()) === 0);
  await h.shot(D.page, "prive");
  h.check("l'API refuse aussi (404)", (await status(D.page, `/api/projects/${privateId}`)) === 404);

  // ------------------------------------------------------------------ Seul le propriétaire publie ; repasser en privé sort le visiteur
  const O = await h.newGuest("O");
  const toggle = visibilityButton(O.page, "(Public|Privé)");
  h.check("le propriétaire peut changer la visibilité (bouton actif)", await toggle.isEnabled());
  h.check("l'infobulle d'un projet privé dit qui y a accès", ((await toggle.getAttribute("title")) ?? "").includes("seuls les membres"));
  await toggle.click();
  await visibilityButton(O.page, "Public").waitFor({ state: "visible", timeout: 10000 });
  h.check("le projet est passé en public", true);
  h.check(
    "l'infobulle d'un projet public dit ce que « public » permet",
    ((await visibilityButton(O.page, "Public").getAttribute("title")) ?? "").includes("lecture seule"),
  );
  const ownProject = await O.page.evaluate(async () => (await (await fetch("/api/projects")).json())[0].id);

  const V2 = await h.newGuest("V2");
  await V2.page.goto(`${h.base}/studio?project=${ownProject}`, { waitUntil: "load" });
  h.check("un visiteur ouvre ce projet par son identifiant", await visible(readOnlyNote(V2.page), 20000));
  await V2.page.getByRole("application", { name: "Tableau blanc d'architecture" }).waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  await V2.page.waitForTimeout(1500);
  h.check("le visiteur est connecté au temps réel", V2.sockets.some((s) => s.closedAt === null));
  await h.shot(V2.page, "visiteur");

  // Le propriétaire garde son canvas ouvert (autre page de la même personne) pendant qu'il repasse le projet en privé.
  const ownerStudio = await O.context.newPage();
  const ownerSockets = [];
  ownerStudio.on("websocket", (ws) => {
    if (ws.url().includes("/_next/")) return;
    const entry = { closedAt: null };
    ownerSockets.push(entry);
    ws.on("close", () => {
      entry.closedAt = Date.now();
    });
  });
  await ownerStudio.goto(`${h.base}/studio?project=${ownProject}`, { waitUntil: "load" });
  await ownerStudio.getByRole("application", { name: "Tableau blanc d'architecture" }).waitFor({ state: "visible", timeout: 20000 });
  await ownerStudio.waitForTimeout(1500);
  h.check("le propriétaire est connecté lui aussi", ownerSockets.some((s) => s.closedAt === null));

  const toggledAt = Date.now();
  await visibilityButton(O.page, "Public").click();
  await visibilityButton(O.page, "Privé").waitFor({ state: "visible", timeout: 10000 });
  await V2.page.waitForTimeout(3000);
  const before = V2.sockets.filter((s) => s.openedAt < toggledAt);
  h.check(
    "repassé en privé : les connexions du visiteur sont coupées",
    before.length > 0 && before.every((s) => s.closedAt !== null),
    `${before.length} connexion(s) d'avant, ${V2.sockets.length - before.length} de reconnexion`,
  );
  h.check("… et il n'a plus accès au projet (404)", (await status(V2.page, `/api/projects/${ownProject}`)) === 404);
  h.check("… mais le propriétaire reste connecté", ownerSockets.some((s) => s.closedAt === null));
  await h.shot(V2.page, "visiteur-sorti");

  h.noScriptErrors();
}
