import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import {
  BILLING_MODELS,
  AUTH_METHODS,
  FIELD_TYPES,
  HTTP_METHODS,
  LIMITS,
  MESSAGING_CHANNELS,
  PAYMENT_FLOWS,
  checkCurrency,
  checkIdent,
  checkPath,
  endpointsOf,
  entitiesOf,
  freshIdent,
  listOf,
  templatesCount,
} from "./canvas-contract.ts";

const schema = JSON.parse(readFileSync(fileURLToPath(new URL("../../../docs/canvas.schema.json", import.meta.url)), "utf-8"));

test("les listes de valeurs de l'éditeur sont celles du schéma du contrat", () => {
  const defs = schema.$defs;
  assert.deepEqual([...FIELD_TYPES], defs.data_database.properties.entities.items.properties.fields.items.properties.type.enum);
  assert.deepEqual([...HTTP_METHODS], defs.data_service.properties.endpoints.items.properties.method.enum);
  assert.deepEqual([...AUTH_METHODS], defs.data_auth.properties.method.enum);
  assert.deepEqual([...MESSAGING_CHANNELS], defs.data_messaging.properties.channel.enum);
  assert.deepEqual([...PAYMENT_FLOWS], defs.data_mobile_payment.properties.flow.enum);
  assert.deepEqual([...BILLING_MODELS], defs.data_billing.properties.model.enum);
});

test("les limites de l'éditeur sont celles du schéma du contrat", () => {
  const defs = schema.$defs;
  assert.equal(LIMITS.entities, defs.data_database.properties.entities.maxItems);
  assert.equal(LIMITS.fields, defs.data_database.properties.entities.items.properties.fields.maxItems);
  assert.equal(LIMITS.endpoints, defs.data_service.properties.endpoints.maxItems);
  assert.equal(LIMITS.pages, defs.data_webapp.properties.pages.maxItems);
  assert.equal(LIMITS.topics, defs.data_queue.properties.topics.maxItems);
  assert.equal(LIMITS.summary, 80);
});

test("un identifiant : forme, mot réservé, doublon", () => {
  assert.equal(checkIdent("commande", []), null);
  assert.equal(checkIdent("date_creation", ["commande"]), null);
  assert.match(checkIdent("Commande", []) ?? "", /Minuscules/);
  assert.match(checkIdent("1commande", []) ?? "", /Minuscules/);
  assert.match(checkIdent("a".repeat(32), []) ?? "", /31 caractères/);
  assert.match(checkIdent("", []) ?? "", /Minuscules/);
  for (const word of ["select", "class", "user", "yes", "order"]) assert.match(checkIdent(word, []) ?? "", /réservé/, word);
  assert.match(checkIdent("client", ["client", "produit"]) ?? "", /existe déjà/);
});

test("un chemin d'endpoint suit le motif du schéma", () => {
  const pattern = new RegExp(schema.$defs.data_service.properties.endpoints.items.properties.path.pattern);
  for (const path of ["/", "/produits", "/commandes/{id}", "/a-b_c/d", "/" + "a".repeat(80)]) {
    assert.equal(checkPath(path), null, path);
    assert.ok(pattern.test(path), path);
  }
  for (const path of ["produits", "/Produits", "/a b", "/é", "/" + "a".repeat(81), ""]) {
    assert.notEqual(checkPath(path), null, path);
    assert.ok(!pattern.test(path), path);
  }
});

test("un code de devise : trois majuscules", () => {
  assert.equal(checkCurrency("XOF"), null);
  for (const value of ["xof", "XO", "XOFF", "X0F", ""]) assert.notEqual(checkCurrency(value), null, value);
});

test("un nouvel identifiant évite les existants et reste dans les 31 caractères", () => {
  assert.equal(freshIdent("champ", []), "champ");
  assert.equal(freshIdent("champ", ["champ"]), "champ_2");
  assert.equal(freshIdent("champ", ["champ", "champ_2"]), "champ_3");
  const long = "x".repeat(31);
  const next = freshIdent(long, [long]);
  assert.ok(next.length <= 31 && next !== long, next);
});

test("lecture tolérante : les entrées mal formées sont ignorées, rien ne plante", () => {
  const contract = {
    entities: [
      { name: "client", fields: [{ name: "nom", type: "string", required: true }, { name: "x", type: "inconnu" }, 42, { type: "string" }] },
      { fields: [] },
      "texte",
    ],
    endpoints: [{ method: "GET", path: "/a", summary: "Lire" }, { method: "TRACE", path: "/b" }, { method: "GET" }, null],
    pages: ["accueil", 3, "panier"],
    templates: [{ name: "bienvenue", text: "Bonjour" }],
  };
  assert.deepEqual(entitiesOf(contract), [{ name: "client", fields: [{ name: "nom", type: "string", required: true }] }]);
  assert.deepEqual(endpointsOf(contract), [{ method: "GET", path: "/a", summary: "Lire" }]);
  assert.deepEqual(listOf(contract, "pages"), ["accueil", "panier"]);
  assert.deepEqual(listOf(contract, "topics"), []);
  assert.equal(templatesCount(contract), 1);
  assert.deepEqual(entitiesOf(undefined), []);
  assert.deepEqual(endpointsOf({ endpoints: "x" }), []);
});

test("ce que l'éditeur accepte, le schéma l'accepte", () => {
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const snapshot = {
    schemaVersion: 1,
    nodes: [
      {
        id: "db",
        type: "database",
        position: { x: 0, y: 0 },
        data: {
          name: "base",
          engine: "postgresql",
          entities: [
            { name: "client", fields: FIELD_TYPES.map((type, i) => ({ name: `champ_${i}`, type, required: i % 2 === 0, unique: i % 3 === 0 })) },
          ],
        },
      },
      {
        id: "api",
        type: "service",
        position: { x: 0, y: 0 },
        data: { name: "api", endpoints: HTTP_METHODS.map((method) => ({ method, path: "/commandes/{id}", summary: "x".repeat(LIMITS.summary) })) },
      },
    ],
    edges: [],
  };
  assert.ok(validate(snapshot), JSON.stringify(validate.errors));
});
