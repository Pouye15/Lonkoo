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

  async function sees(page, text, timeout = 9000) {
    return page.getByText(text, { exact: true }).first().waitFor({ timeout }).then(() => true).catch(() => false);
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
}
