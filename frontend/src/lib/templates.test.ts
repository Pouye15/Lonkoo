import assert from "node:assert/strict";
import { test } from "node:test";
import { templateSize, templateToSend, type StarterTemplate } from "./templates.ts";

const template = (id: string, blocks = 8, links = 7): StarterTemplate => ({
  id,
  name: `Modèle ${id}`,
  description: "Exemple",
  blocks,
  links,
});

test("la taille d'un modèle se lit en blocs et en liens, au singulier comme au pluriel", () => {
  assert.equal(templateSize({ blocks: 8, links: 7 }), "8 blocs · 7 liens");
  assert.equal(templateSize({ blocks: 1, links: 1 }), "1 bloc · 1 lien");
  assert.equal(templateSize({ blocks: 0, links: 0 }), "0 bloc · 0 lien");
});

test("un modèle choisi qui existe dans la liste est envoyé tel quel", () => {
  assert.equal(templateToSend("tontine-numerique", [template("clinique"), template("tontine-numerique")]), "tontine-numerique");
});

test("sans choix (projet vide), rien n'est envoyé", () => {
  assert.equal(templateToSend(null, [template("clinique")]), undefined);
});

test("un identifiant qui n'est plus dans la liste n'est jamais envoyé au serveur", () => {
  assert.equal(templateToSend("ancien-modele", [template("clinique")]), undefined);
  assert.equal(templateToSend("clinique", []), undefined, "liste pas encore chargée ou en échec");
});
