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

  // ------------------------------------------------------------------ Contrastes AA, thème clair puis thème sombre
  /** Mesure, sur les couleurs réellement affichées, le contraste de chaque texte de l'audit contre son fond (WCAG 2). */
  const contrasts = () =>
    A.evaluate(() => {
      const toRgba = (css) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        return [r, g, b, a / 255];
      };
      const linear = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
      const background = (el) => {
        const layers = [];
        for (let node = el; node; node = node.parentElement) {
          const color = toRgba(getComputedStyle(node).backgroundColor);
          if (color[3] > 0) layers.push(color);
          if (color[3] >= 1) break;
        }
        let base = [255, 255, 255];
        for (const [r, g, b, a] of layers.reverse()) base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
        return base;
      };
      const root = document.querySelector('section[aria-label="Audit par règles"]');
      const failures = [];
      let checked = 0;
      for (const el of [root, ...root.querySelectorAll("*")]) {
        const own = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
        if (!own || el.getClientRects().length === 0) continue;
        const style = getComputedStyle(el);
        const [r, g, b] = toRgba(style.color);
        const [br, bg, bb] = background(el);
        const l1 = luminance([r, g, b]);
        const l2 = luminance([br, bg, bb]);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const size = Number.parseFloat(style.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
        checked += 1;
        if (ratio < (large ? 3 : 4.5)) failures.push({ text: own.slice(0, 40), ratio: Math.round(ratio * 100) / 100, classes: el.className.toString().slice(0, 60) });
      }
      return { checked, failures };
    });

  const light = await contrasts();
  h.check(`thème clair : les ${light.checked} textes de l'audit ont un contraste AA`, light.checked > 10 && light.failures.length === 0, JSON.stringify(light.failures.slice(0, 3)));
  await A.evaluate(() => localStorage.setItem("lonkoo.theme", "dark"));
  await openAudit(demo);
  h.check("le thème sombre est actif", await A.evaluate(() => document.documentElement.classList.contains("dark")));
  const dark = await contrasts();
  h.check(`thème sombre : les ${dark.checked} textes de l'audit ont un contraste AA`, dark.checked > 10 && dark.failures.length === 0, JSON.stringify(dark.failures.slice(0, 3)));
  await h.shot(A, "A-audit-sombre");
  await A.evaluate(() => localStorage.removeItem("lonkoo.theme"));
  await openAudit(demo);

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

  // ------------------------------------------------------------------ Les rôles : écrire corrige, lire ne le peut pas
  const board = (page) => page.getByRole("application", { name: "Tableau blanc d'architecture" });

  /** Crée un lien de partage depuis le studio (« Peut modifier » ou « Lecture seule ») et rend son adresse. */
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

  /** Rejoint le projet par un lien de partage, puis ouvre l'onglet Audit une fois le schéma arrivé. */
  async function joinAudit(page, url) {
    await page.goto(h.base + new URL(url).pathname, { waitUntil: "load" });
    await page.waitForURL(/\/studio\?project=/, { timeout: 20000 });
    const key = new URL(page.url()).searchParams.get("project");
    await page.goto(`${h.base}/studio?project=${key}&tab=scanner`, { waitUntil: "load" });
    await page.locator('li[data-rule="base-sans-replique"]').waitFor({ timeout: 25000 });
  }

  const shared = await create("audit-roles", "clinique-rendez-vous");
  await A.goto(`${h.base}/studio?project=${shared}`, { waitUntil: "load" });
  await board(A).waitFor({ timeout: 25000 });
  const writeUrl = await share(A, "Peut modifier");
  const readUrl = await share(A, "Lecture seule");

  const B = (await h.newVisitor("B")).page;
  await joinAudit(B, writeUrl);
  const C = (await h.newVisitor("C")).page;
  await joinAudit(C, readUrl);
  await C.waitForTimeout(800);

  const fixButton = (page) => page.getByRole("button", { name: "Passer à 2 répliques" });
  const scoreOf = async (page) => Number.parseInt((await page.locator("[data-audit-score]").textContent()) ?? "", 10);
  h.check("la personne qui peut modifier voit le bouton de correction", (await fixButton(B).count()) === 1);
  h.check("la personne en lecture seule voit les mêmes constats", (await C.locator("li[data-rule]").count()) === (await B.locator("li[data-rule]").count()));
  h.check("mais elle n'a pas le bouton de correction", (await fixButton(C).count()) === 0);

  const readerBefore = await scoreOf(C);
  await fixButton(B).click();
  let readerAfter = readerBefore;
  for (const until = Date.now() + 15000; Date.now() < until && readerAfter === readerBefore; ) {
    await C.waitForTimeout(200);
    readerAfter = await scoreOf(C);
  }
  h.check("la correction de B arrive chez C sans recharger : le score monte de 10", readerAfter === readerBefore + 10, `${readerBefore} puis ${readerAfter}`);
  h.check("le constat disparaît aussi chez C", (await C.locator('li[data-rule="base-sans-replique"]').count()) === 0);

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
