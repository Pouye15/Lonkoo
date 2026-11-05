export const title = "Trois personnes d'un même projet (propriétaire, écriture, lecture seule) discutent dans la page Revues";

export async function run(h) {
  const board = (page) => page.getByRole("application", { name: "Tableau blanc d'architecture" });
  const log = (page) => page.getByRole("log", { name: "Messages de l'équipe" });
  const box = (page) => page.getByLabel("Votre message");

  /** Crée un lien de partage depuis le studio (rôle : « Peut modifier » ou « Lecture seule ») et rend son adresse. */
  async function share(page, roleLabel) {
    await page.getByRole("button", { name: /Partager/ }).click();
    await page.getByRole("radio", { name: new RegExp(roleLabel) }).click();
    await page.getByRole("button", { name: /Créer (le|un autre) lien/ }).click();
    const input = page.locator("#share-url");
    await input.waitFor({ timeout: 10000 });
    const url = await input.inputValue();
    await page.getByRole("dialog").locator('button:text-is("Fermer")').click();
    return url;
  }

  async function openDiscussion(page) {
    await page.getByRole("link", { name: "Revues" }).first().click();
    await page.waitForURL(/\/reviews/, { timeout: 15000 });
    await log(page).waitFor({ timeout: 15000 });
    await box(page).waitFor({ timeout: 5000 });
  }

  // Dans la liste des messages seulement : le brouillon de la zone de saisie contient lui aussi le texte (React le garde
  // comme contenu du champ), et ferait réussir la vérification avant même l'envoi.
  async function sees(page, text, timeout = 9000) {
    return log(page).getByText(text, { exact: true }).first().waitFor({ timeout }).then(() => true).catch(() => false);
  }

  async function say(page, text) {
    await box(page).fill(text);
    await box(page).press("Enter");
  }

  // ------------------------------------------------------------------ A : propriétaire, et les deux liens
  const a = await h.newGuest("A");
  const A = a.page;
  await A.getByRole("link", { name: "Ouvrir" }).first().click();
  await A.waitForURL(/\/studio\?project=/, { timeout: 15000 });
  await board(A).waitFor({ timeout: 20000 });
  const writeUrl = await share(A, "Peut modifier");
  const readUrl = await share(A, "Lecture seule");

  const b = await h.newVisitor("B");
  const B = b.page;
  await B.goto(h.base + new URL(writeUrl).pathname, { waitUntil: "load" });
  await B.waitForURL(/\/studio\?project=/, { timeout: 20000 });
  await board(B).waitFor({ timeout: 20000 });

  const c = await h.newVisitor("C");
  const C = c.page;
  await C.goto(h.base + new URL(readUrl).pathname, { waitUntil: "load" });
  await C.waitForURL(/\/studio\?project=/, { timeout: 20000 });
  await board(C).waitFor({ timeout: 20000 });
  h.check("C est bien en lecture seule sur le canvas", (await C.getByText("Lecture seule").count()) >= 1);

  // ------------------------------------------------------------------ Tous ouvrent la discussion
  for (const page of [A, B, C]) await openDiscussion(page);
  h.check("la discussion est vide au départ", (await log(A).getByRole("article").count()) === 0);
  h.check("l'en-tête compte les 3 membres", (await A.getByText("3 membres").count()) === 1);
  await h.shot(A, "A-discussion-vide");

  // ------------------------------------------------------------------ Un message de A arrive chez B et C
  await say(A, "Bonjour, je propose une base PostgreSQL et une file pour les notifications.");
  h.check("A voit son message tout de suite", await sees(A, "Bonjour, je propose une base PostgreSQL et une file pour les notifications.", 4000));
  h.check("B le reçoit sans recharger", await sees(B, "Bonjour, je propose une base PostgreSQL et une file pour les notifications."));
  h.check("C le reçoit sans recharger", await sees(C, "Bonjour, je propose une base PostgreSQL et une file pour les notifications."));
  h.check("la zone de saisie est vidée après l'envoi", (await box(A).inputValue()) === "");

  // ------------------------------------------------------------------ C, en lecture seule du canvas, peut parler
  await say(C, "D'accord pour la file. Qui s'occupe des gabarits de SMS ?");
  h.check("C (lecture seule du canvas) écrit dans la discussion", await sees(C, "D'accord pour la file. Qui s'occupe des gabarits de SMS ?", 4000));
  h.check("A reçoit le message de C", await sees(A, "D'accord pour la file. Qui s'occupe des gabarits de SMS ?"));
  h.check("B reçoit le message de C", await sees(B, "D'accord pour la file. Qui s'occupe des gabarits de SMS ?"));

  // ------------------------------------------------------------------ Le texte n'est jamais interprété
  let dialogs = 0;
  for (const page of [A, B, C]) page.on("dialog", async (d) => { dialogs += 1; await d.dismiss(); });
  const hostile = '<img src=x onerror=alert(1)> et <b>gras</b> & https://exemple.org';
  await say(B, hostile);
  h.check("B voit son texte tel qu'il l'a écrit", await sees(B, hostile, 4000));
  h.check("A voit le même texte, sans balise interprétée", await sees(A, hostile));
  h.check("aucune balise HTML n'est née du message", (await log(A).locator("img, b").count()) === 0);
  h.check("aucun script ne s'est exécuté", dialogs === 0, `${dialogs} fenêtre(s)`);

  // ------------------------------------------------------------------ Ordre, qui est qui, mémoire
  const bodies = await log(A).getByRole("article").locator("p").allTextContents();
  h.check("les messages sont dans l'ordre de la conversation", bodies.length === 3 && bodies[0].startsWith("Bonjour") && bodies[2] === hostile, `${bodies.length} message(s)`);
  h.check("A se reconnaît (« vous ») sur son seul message", (await log(A).getByText("vous", { exact: true }).count()) === 1);
  await h.shot(A, "A-discussion");

  await A.reload({ waitUntil: "load" });
  await log(A).waitFor({ timeout: 15000 });
  h.check("après rechargement, l'historique revient", (await log(A).getByRole("article").count()) === 3 || (await sees(A, hostile)));
  h.check("une zone vide ne s'envoie pas", await A.getByRole("button", { name: "Envoyer" }).isDisabled());
  h.check("au clavier, l'aide « Entrée pour envoyer » est affichée", await A.getByText("Entrée pour envoyer, Maj+Entrée pour aller à la ligne").isVisible());

  // ------------------------------------------------------------------ Pastille de « Revues » : les vrais messages non lus
  const reviewsLink = (page) => page.getByRole("link", { name: /^Revues/ });
  const badge = (page) => reviewsLink(page).locator("span[aria-label]");
  await A.getByRole("link", { name: "Studio" }).first().click();
  await A.waitForURL(/\/studio/, { timeout: 15000 });
  await board(A).waitFor({ timeout: 20000 });
  h.check("sur le Studio, pas de pastille tant qu'il n'y a rien de nouveau (plus de faux « 2 »)", (await badge(A).count()) === 0);

  await say(B, "Message pour la pastille");
  h.check("A voit la pastille « 1 message non lu » sans quitter le Studio", await badge(A).filter({ hasText: "1" }).waitFor({ timeout: 35000 }).then(() => true).catch(() => false));
  h.check("la pastille se lit « 1 message non lu »", (await badge(A).getAttribute("aria-label")) === "1 message non lu");
  await h.shot(A, "A-pastille");

  await reviewsLink(A).click();
  await log(A).waitFor({ timeout: 15000 });
  h.check("A ouvre la discussion : le message y est", await sees(A, "Message pour la pastille", 9000));
  h.check("et la pastille a disparu", (await badge(A).count()) === 0);
  await A.getByRole("link", { name: "Studio" }).first().click();
  await A.waitForURL(/\/studio/, { timeout: 15000 });
  await A.waitForTimeout(1500);
  h.check("revenu sur le Studio, le message lu n'est pas recompté", (await badge(A).count()) === 0);

  // ------------------------------------------------------------------ Sur téléphone (écran tactile de 390 px)
  const phoneContext = await h.browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const D = await phoneContext.newPage();
  D.on("pageerror", (e) => h.errors.push(`[D] ${String(e).slice(0, 220)}`));
  await D.goto(h.base + new URL(writeUrl).pathname, { waitUntil: "load" });
  await D.waitForURL(/\/studio\?project=/, { timeout: 20000 });
  await D.goto(h.base + "/reviews", { waitUntil: "load" });
  await log(D).waitFor({ timeout: 20000 });
  await D.waitForTimeout(500);

  const overflow = await D.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  h.check("téléphone : pas de défilement horizontal de la page", overflow.scrollWidth <= overflow.innerWidth + 1, `${overflow.scrollWidth} / ${overflow.innerWidth}`);
  const logBox = await log(D).boundingBox();
  const proposals = await D.getByText("Propositions (3)").boundingBox();
  h.check("téléphone : la discussion est en haut, avant les propositions", !!logBox && !!proposals && logBox.y < proposals.y, `discussion à ${Math.round(logBox?.y)} px, propositions à ${Math.round(proposals?.y)} px`);
  h.check("téléphone : la discussion est visible sans défiler", !!logBox && logBox.y + 120 < 844);
  h.check("téléphone : l'historique de la conversation est là", await sees(D, hostile, 8000));
  h.check("téléphone : l'aide du clavier physique n'est pas affichée", !(await D.getByText("Entrée pour envoyer, Maj+Entrée pour aller à la ligne").isVisible()));
  await h.shot(D, "D-telephone");

  // Sur écran tactile, Entrée va à la ligne ; c'est le bouton qui envoie.
  const before = await log(D).getByRole("article").count();
  await box(D).fill("Première ligne");
  await box(D).press("Enter");
  await box(D).pressSequentially("deuxième ligne");
  await D.waitForTimeout(500);
  h.check("téléphone : Entrée va à la ligne sans envoyer", (await box(D).inputValue()) === "Première ligne\ndeuxième ligne" && (await log(D).getByRole("article").count()) === before);
  const sendBox = await D.getByRole("button", { name: "Envoyer" }).boundingBox();
  h.check("téléphone : le bouton « Envoyer » tient dans la largeur et se touche du doigt", !!sendBox && sendBox.x + sendBox.width <= 390 && sendBox.height >= 32, JSON.stringify(sendBox && { x: Math.round(sendBox.x), w: Math.round(sendBox.width), h: Math.round(sendBox.height) }));
  await D.getByRole("button", { name: "Envoyer" }).tap();
  // Le message envoyé est le (before + 1)-ième de la liste : on l'attend lui, pas le texte (présent aussi dans la zone de saisie).
  const sentArticle = log(D).getByRole("article").nth(before);
  const shown = await sentArticle.waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
  const sentText = shown ? await sentArticle.locator("p").innerText() : "";
  h.check("téléphone : le bouton envoie le message sur deux lignes", shown && sentText === "Première ligne\ndeuxième ligne", `message reçu : « ${sentText.replace("\n", "\\n")} »`);
  h.check("téléphone : la zone de saisie est vidée après l'envoi", (await box(D).inputValue()) === "");
  // A est sur le Studio : la pastille annonce le message écrit sur le téléphone, puis il le lit dans la discussion.
  h.check("A voit la pastille du message écrit sur téléphone", await badge(A).filter({ hasText: "1" }).waitFor({ timeout: 35000 }).then(() => true).catch(() => false));
  await reviewsLink(A).click();
  await log(A).waitFor({ timeout: 15000 });
  h.check("A lit le message écrit sur téléphone, sur deux lignes", await log(A).getByText("deuxième ligne").first().waitFor({ timeout: 9000 }).then(() => true).catch(() => false));
  await h.shot(D, "D-telephone-apres-envoi");
  await phoneContext.close();
}
