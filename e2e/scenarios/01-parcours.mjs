import { readFileSync } from "node:fs";

export const title = "Un invité ouvre le modèle d'exemple, collabore à plusieurs, partage en lecture seule, versionne et restaure";

const EXPECTED = JSON.parse(
  readFileSync(new URL("../../docs/exemples/marketplace-mobile.canvas.json", import.meta.url), "utf-8"),
).nodes.length;

export async function run(h) {
  const board = (page) => page.getByRole("application", { name: "Tableau blanc d'architecture" });
  const nodeCount = (page) => board(page).locator("[data-node-id]").count();

  async function waitNodes(page, expected, timeout = 15000) {
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

  async function openBoard(page) {
    await board(page).waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
  }

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

  // ------------------------------------------------------------------ A : invité propriétaire
  const a = await h.newGuest("A");
  const A = a.page;
  const cards = await A.locator("article").count();
  h.check("tableau de bord : le projet de l'invité vient de l'API", cards >= 1, `${cards} projet(s)`);

  await A.getByRole("link", { name: "Ouvrir" }).first().click();
  await A.waitForURL(/\/studio\?project=/, { timeout: 15000 });
  await openBoard(A);
  const N = await nodeCount(A);
  h.check("le canvas partagé s'ouvre avec le modèle d'exemple", N === EXPECTED, `${N} blocs, ${EXPECTED} attendus`);
  await h.shot(A, "A-canvas");

  // ------------------------------------------------------------------ liens de partage
  const writeUrl = await share(A, "Peut modifier");
  const readUrl = await share(A, "Lecture seule");
  h.check("lien en écriture créé", /\/join\/[A-Za-z0-9_-]{20,}$/.test(writeUrl), writeUrl.slice(0, 40) + "…");
  h.check("lien en lecture créé", /\/join\/[A-Za-z0-9_-]{20,}$/.test(readUrl));

  // ------------------------------------------------------------------ B : invité qui peut modifier
  const b = await h.newVisitor("B");
  const B = b.page;
  await B.goto(h.base + new URL(writeUrl).pathname, { waitUntil: "load" });
  await B.waitForURL(/\/studio\?project=/, { timeout: 20000 });
  await openBoard(B);
  h.check("B (lien en écriture) voit les mêmes blocs", await waitNodes(B, N));
  h.check("B n'est pas en lecture seule", (await B.getByText("Lecture seule").count()) === 0);
  await h.shot(B, "B-canvas");

  const presenceA = await A.getByRole("group", { name: "Personnes connectées" }).locator("span").count();
  h.check("A voit la présence de B dans la barre d'outils", presenceA >= 1, `${presenceA} avatar(s)`);

  // curseur de B vu par A
  const box = await board(B).boundingBox();
  await B.mouse.move(box.x + 400, box.y + 300);
  await B.mouse.move(box.x + 520, box.y + 340, { steps: 8 });
  const cursorSeen = await A.waitForFunction(
    () => document.querySelectorAll('[role="application"] .z-30.pointer-events-none').length > 0,
    null,
    { timeout: 8000 },
  ).then(() => true).catch(() => false);
  h.check("A voit le curseur de B", cursorSeen);
  await h.shot(A, "A-curseur");

  // B ajoute un bloc : A le voit sans recharger
  await B.getByRole("button", { name: "Application web" }).first().click();
  h.check("B ajoute un bloc, A le voit en direct", (await waitNodes(A, N + 1)) && (await waitNodes(B, N + 1)));

  // ------------------------------------------------------------------ C : lecture seule
  const c = await h.newVisitor("C");
  const C = c.page;
  await C.goto(h.base + new URL(readUrl).pathname, { waitUntil: "load" });
  await C.waitForURL(/\/studio\?project=/, { timeout: 20000 });
  await openBoard(C);
  h.check("C (lien en lecture) voit les blocs", await waitNodes(C, N + 1));
  h.check("C voit « Lecture seule »", (await C.getByText("Lecture seule").count()) >= 1);
  h.check("C n'a pas la boîte à outils", (await C.getByRole("tab", { name: "Composants" }).count()) === 0);
  h.check("C ne peut pas relier", await C.getByRole("button", { name: "Relier" }).isDisabled());
  await C.locator("[data-node-id]").first().click();
  await C.keyboard.press("Delete");
  await C.waitForTimeout(600);
  h.check("C ne supprime rien (Suppr sans effet)", (await nodeCount(C)) === N + 1 && (await nodeCount(A)) === N + 1);
  await h.shot(C, "C-lecture-seule");

  // ------------------------------------------------------------------ versions
  await A.getByRole("tab", { name: /Versions/ }).click();
  await A.getByLabel("Nom de la version").fill("v1");
  await A.getByLabel(/Note/).fill("avec une application web");
  await A.getByRole("button", { name: "Enregistrer la version" }).click();
  const saved = await A.getByText(/Version « v1 » enregistrée/).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  h.check("version v1 enregistrée (canvas valide pour le contrat)", saved);
  await h.shot(A, "A-versions");

  await C.getByRole("tab", { name: /Versions/ }).click();
  h.check("C (lecture) ne peut pas enregistrer de version", (await C.getByRole("button", { name: "Enregistrer la version" }).count()) === 0);

  // un bloc « generic » (passerelle) est valide dans une version
  await A.getByRole("tab", { name: "Architecture" }).click();
  await openBoard(A);
  await A.getByRole("button", { name: "Passerelle" }).first().click();
  h.check("A ajoute une passerelle (bloc generic)", (await waitNodes(A, N + 2)) && (await waitNodes(B, N + 2)));
  await A.getByRole("tab", { name: /Versions/ }).click();
  await A.getByLabel("Nom de la version").fill("v2");
  await A.getByRole("button", { name: "Enregistrer la version" }).click();
  const saved2 = await A.getByText(/Version « v2 » enregistrée/).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  h.check("version v2 enregistrée avec un bloc « generic »", saved2);

  // supprimer un bloc, puis restaurer v1
  await A.getByRole("tab", { name: "Architecture" }).click();
  await openBoard(A);
  await A.locator("[data-node-id]").first().click();
  await A.keyboard.press("Delete");
  h.check("A supprime un bloc, B le voit", (await waitNodes(A, N + 1)) && (await waitNodes(B, N + 1)));

  await A.getByRole("tab", { name: /Versions/ }).click();
  const v1Card = A.locator("div.rounded-xl", { hasText: "avec une application web" }).first();
  await v1Card.getByRole("button", { name: "Restaurer" }).click();
  await v1Card.getByRole("button", { name: "Confirmer" }).click();
  const restored = await A.getByText(/Version « v1 » restaurée/).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  h.check("v1 restaurée", restored);
  await A.getByRole("tab", { name: "Architecture" }).click();
  await openBoard(A);
  await C.getByRole("tab", { name: "Architecture" }).click();
  await openBoard(C);
  h.check(
    "restauration vue en direct par A, B et C (N + 1 blocs)",
    (await waitNodes(A, N + 1)) && (await waitNodes(B, N + 1)) && (await waitNodes(C, N + 1)),
  );

  // ------------------------------------------------------------------ rechargement et lien invalide
  await A.reload({ waitUntil: "load" });
  await openBoard(A);
  h.check("rechargement de A : le canvas revient", await waitNodes(A, N + 1));

  const d = await h.newVisitor("D");
  await d.page.goto(h.base + "/join/jeton-inconnu-1234567890abcdefghijklmnop", { waitUntil: "load" });
  const invalid = await d.page.getByText(/inconnu ou a expiré/).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  h.check("lien inconnu : message clair, pas de plantage", invalid);
  await h.shot(d.page, "D-lien-invalide");

  h.noScriptErrors();
}
