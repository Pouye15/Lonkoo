import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ArchitectureEdge, ArchitectureNode } from "./lonkoo-data";
import { edgeFromEntry, nodeFromEntry, type JsonObject } from "./canvas-model.ts";
import { PENALTY, RULES, RULE_COUNT, auditArchitecture, entityForPath, outsideSms, type Audit, type RuleId } from "./audit.ts";

/** Un bloc construit comme le Studio le lit dans le document : type et données du contrat. */
function block(id: string, type: string, data: JsonObject = {}, ui?: JsonObject): ArchitectureNode {
  return nodeFromEntry(id, { type, position: { x: 0, y: 0 }, data: { name: id, label: id, ...data }, ...(ui ? { ui } : {}) });
}

const link = (source: string, target: string, kind = "http"): ArchitectureEdge => edgeFromEntry(`${source}-${target}`, { source, target, kind });

const run = (nodes: ArchitectureNode[], edges: ArchitectureEdge[] = []): Audit => auditArchitecture(nodes, edges);
const rules = (audit: Audit): RuleId[] => audit.findings.map((finding) => finding.rule);

const endpoint = (method: string, path: string) => ({ method, path });
const entity = (name: string, ...fields: JsonObject[]): JsonObject => ({ name, fields });
const field = (name: string, type: string, extra: JsonObject = {}): JsonObject => ({ name, type, ...extra });

/** Un service avec un endpoint et une base avec une table : ni vides ni orphelins une fois reliés. */
const service = (id = "api", endpoints: JsonObject[] = [endpoint("GET", "/produits")]) => block(id, "service", { endpoints });
const database = (id = "db", entities: JsonObject[] = [entity("produit", field("nom", "string"))], replicas = 2) =>
  block(id, "database", { engine: "postgresql", entities }, { replicas });

test("un canvas vide n'a ni constat ni score : il n'y a rien à noter", () => {
  const audit = run([]);
  assert.deepEqual(audit.findings, []);
  assert.equal(audit.score, null);
});

test("aucune authentification : critique avec une API, important avec une seule interface ; reliée ou non, la règle suit", () => {
  const web = block("web", "webapp", { pages: ["accueil"] });
  const api = service();

  const withApi = run([web, api], [link("web", "api")]);
  assert.equal(withApi.findings.find((f) => f.rule === "auth-absente")?.severity, "critique");
  assert.deepEqual(withApi.findings.find((f) => f.rule === "auth-absente")?.nodeIds.sort(), ["api", "web"]);

  assert.equal(run([web]).findings.find((f) => f.rule === "auth-absente")?.severity, "important");

  const auth = block("auth", "auth", { method: "password" });
  const protectedGraph = run([web, api, auth], [link("web", "api"), link("web", "auth", "auth")]);
  assert.ok(!rules(protectedGraph).includes("auth-absente"));
  assert.ok(!rules(protectedGraph).includes("auth-non-reliee"));
});

test("un bloc d'authentification relié à rien ne protège rien", () => {
  const web = block("web", "webapp", { pages: ["accueil"] });
  const auth = block("auth", "auth", { method: "password" });
  const audit = run([web, service(), auth], [link("web", "api")]);
  const finding = audit.findings.find((f) => f.rule === "auth-non-reliee");
  assert.equal(finding?.severity, "important");
  assert.deepEqual(finding?.nodeIds, ["auth"]);
  assert.ok(!rules(audit).includes("auth-absente"), "il y a bien un bloc d'authentification");
  // Relié dans l'autre sens, il protège.
  assert.ok(!rules(run([web, service(), auth], [link("web", "api"), link("auth", "web")])).includes("auth-non-reliee"));
});

test("une base partagée par deux services est signalée, avec la base en premier", () => {
  const nodes = [service("a"), service("b"), database()];
  const audit = run(nodes, [link("a", "db"), link("b", "db")]);
  const finding = audit.findings.find((f) => f.rule === "base-partagee");
  assert.equal(finding?.severity, "important");
  assert.deepEqual(finding?.nodeIds, ["db", "a", "b"]);
  assert.ok(!rules(run([service("a"), database()], [link("a", "db")])).includes("base-partagee"), "un seul service");
});

test("une base utilisée en une seule instance est signalée, et la correction applicable passe à deux répliques", () => {
  const single = database("db", undefined, 1);
  const audit = run([service(), single], [link("api", "db")]);
  const finding = audit.findings.find((f) => f.rule === "base-sans-replique");
  assert.equal(finding?.severity, "important");
  assert.deepEqual(finding?.autofix, { nodeId: "db", replicas: 2 });

  assert.ok(!rules(run([service(), database()], [link("api", "db")])).includes("base-sans-replique"), "deux répliques");
  assert.ok(!rules(run([service(), single])).includes("base-sans-replique"), "une base que personne n'utilise n'est pas un point de défaillance");
});

test("un paiement sans champ unique de référence est critique ; la référence doit être unique", () => {
  const payment = block("pay", "mobile-payment", { currency: "XOF", flow: "collect" });
  const withReference = (extra: JsonObject) => database("db", [entity("paiement", field("reference", "string", extra))]);

  assert.equal(run([payment]).findings.find((f) => f.rule === "paiement-sans-reference")?.severity, "critique");
  assert.ok(rules(run([payment, withReference({})])).includes("paiement-sans-reference"), "une référence non unique ne protège pas");
  assert.ok(rules(run([payment, database("db", [entity("paiement", field("nom", "string", { unique: true }))])])).includes("paiement-sans-reference"));
  assert.ok(!rules(run([payment, withReference({ unique: true })])).includes("paiement-sans-reference"));
  assert.ok(!rules(run([database("db", [entity("paiement", field("transaction_ref", "string", { unique: true }))]), payment])).includes("paiement-sans-reference"));
  assert.ok(!rules(run([database()])).includes("paiement-sans-reference"), "sans paiement, la règle ne s'applique pas");
});

test("un paiement relié à une file, dans un sens ou dans l'autre, n'est pas signalé", () => {
  const payment = block("pay", "mobile-payment", { currency: "XOF", flow: "collect" });
  const queue = block("file", "queue", { topics: ["paiements"] });
  assert.equal(run([payment, service()], [link("api", "pay")]).findings.find((f) => f.rule === "paiement-sans-file")?.severity, "mineur");
  assert.ok(!rules(run([payment, queue], [link("pay", "file")])).includes("paiement-sans-file"));
  assert.ok(!rules(run([payment, queue], [link("file", "pay")])).includes("paiement-sans-file"));
});

test("un champ xxx_id qui désigne une entité que l'API ne crée pas est une impasse", () => {
  const entities = [entity("medecin", field("nom", "string")), entity("rendez_vous", field("medecin_id", "uuid"), field("debut", "datetime"))];
  const db = database("db", entities);
  const onlyAppointments = service("api", [endpoint("GET", "/rendez-vous"), endpoint("POST", "/rendez-vous")]);

  const audit = run([onlyAppointments, db], [link("api", "db")]);
  const finding = audit.findings.find((f) => f.rule === "impasse-creation");
  assert.equal(finding?.severity, "important");
  assert.match(finding?.title ?? "", /rendez_vous\.medecin_id/);
  assert.deepEqual(finding?.nodeIds, ["db"]);

  const complete = service("api", [endpoint("POST", "/rendez-vous"), endpoint("POST", "/medecins")]);
  assert.ok(!rules(run([complete, db], [link("api", "db")])).includes("impasse-creation"));

  // Un GET ne crée rien ; sans aucun endpoint, on ne peut pas encore juger ; un champ qui ne désigne aucune entité est libre.
  assert.ok(rules(run([service("api", [endpoint("GET", "/medecins"), endpoint("POST", "/rendez-vous")]), db])).includes("impasse-creation"));
  assert.ok(!rules(run([service("api", []), db])).includes("impasse-creation"));
  const free = database("db", [entity("tour", field("beneficiaire_id", "uuid"))]);
  assert.ok(!rules(run([service("api", [endpoint("POST", "/tours")]), free])).includes("impasse-creation"));
});

test("la règle des routes lit les chemins comme le générateur", () => {
  const names = new Set(["rendez_vous", "classe", "frais", "tournee"]);
  assert.equal(entityForPath("/rendez-vous", names), "rendez_vous");
  assert.equal(entityForPath("/classes", names), "classe");
  assert.equal(entityForPath("/frais", names), "frais");
  assert.equal(entityForPath("/tournees", names), "tournee");
  assert.equal(entityForPath("/classes/{id}", names), null);
  assert.equal(entityForPath("/", names), null);
  assert.equal(entityForPath("/inconnus", names), null);
});

test("un SMS trop long ou avec un caractère hors du jeu GSM 7 bits est signalé ; un écran USSD seulement s'il est trop long", () => {
  const messaging = (channel: string, text: string) => block("msg", "messaging", { channel, templates: [{ name: "rappel", text }] });
  const titles = (audit: Audit) => audit.findings.filter((f) => f.rule === "message-hors-limite").map((f) => f.title);

  assert.deepEqual(titles(run([messaging("sms", "Rappel : rendez-vous demain à la clinique.")])), []);
  assert.equal(titles(run([messaging("sms", "x".repeat(161))])).length, 1);
  assert.deepEqual(titles(run([messaging("sms", "x".repeat(160))])), []);
  assert.match(titles(run([messaging("sms", "Vous êtes attendu")]))[0] ?? "", /sort du jeu de caractères/);
  assert.equal(titles(run([messaging("sms", "L’heure")])).length, 1, "l'apostrophe typographique");
  assert.equal(titles(run([messaging("ussd", "x".repeat(161))])).length, 1);
  assert.deepEqual(titles(run([messaging("ussd", "Vous êtes attendu")])), [], "l'USSD n'a pas ce jeu de caractères");
  assert.deepEqual(titles(run([messaging("email", "x".repeat(500))])), [], "le courriel n'a pas cette limite");
  assert.equal(titles(run([messaging("sms", "ê".repeat(161))])).length, 2, "trop long et hors jeu : deux constats");
});

test("les caractères hors du jeu GSM 7 bits sont ceux de la relecture des modèles", () => {
  assert.deepEqual(outsideSms("é è à ù É Ç ç ' % ! ?"), []);
  assert.deepEqual(outsideSms("ê â ô û î ï ë œ ’ « » …").sort(), ["ê", "â", "ô", "û", "î", "ï", "ë", "œ", "’", "«", "»", "…"].sort());
  assert.deepEqual(outsideSms("êêê"), ["ê"], "sans doublon");
});

test("un service sans endpoint et une base sans table sont signalés, une fois remplis ils ne le sont plus", () => {
  const empty = run([block("api", "service"), block("db", "database", { engine: "postgresql", entities: [] })], [link("api", "db")]);
  assert.deepEqual(
    empty.findings.filter((f) => f.rule === "bloc-vide").map((f) => f.nodeIds[0]).sort(),
    ["api", "db"],
  );
  assert.ok(!rules(run([service(), database()], [link("api", "db")])).includes("bloc-vide"));
});

test("un bloc relié à rien est orphelin, sauf quand il est seul dans le schéma", () => {
  const audit = run([block("a", "generic"), block("b", "generic"), block("c", "generic")], [link("a", "b")]);
  assert.deepEqual(audit.findings.filter((f) => f.rule === "bloc-orphelin").map((f) => f.nodeIds[0]), ["c"]);
  assert.deepEqual(run([block("a", "generic")]).findings, [], "un bloc seul n'est pas orphelin");
  assert.ok(!rules(run([block("a", "generic"), block("b", "generic")], [link("a", "b")])).includes("bloc-orphelin"));
  // Un lien vers un bloc absent ne relie rien.
  assert.ok(rules(run([block("a", "generic"), block("b", "generic")], [link("a", "fantome")])).includes("bloc-orphelin"));
});

test("le score est 100 moins la pénalité de chaque constat, sans descendre sous zéro", () => {
  assert.deepEqual(PENALTY, { critique: 20, important: 10, mineur: 3 });
  // Une API sans authentification (critique), une base à une instance (important), une base sans table (mineur).
  const audit = run([service(), block("db", "database", { engine: "postgresql", entities: [] }, { replicas: 1 })], [link("api", "db")]);
  assert.deepEqual(audit.counts, { critique: 1, important: 1, mineur: 1 });
  assert.equal(audit.score, 100 - 20 - 10 - 3);

  // Douze bases à une instance derrière une API sans authentification : bien plus de 100 points de pénalité.
  const databases = Array.from({ length: 12 }, (_, i) => database(`db${i}`, undefined, 1));
  const floor = run([service(), ...databases], databases.map((db) => link("api", db.id)));
  assert.ok(floor.counts.critique * 20 + floor.counts.important * 10 + floor.counts.mineur * 3 > 100);
  assert.equal(floor.score, 0);
});

test("corriger un constat fait monter le score : le score suit le schéma, pas le nombre de clics", () => {
  const before = run([service(), database("db", undefined, 1)], [link("api", "db")]);
  const fix = before.findings.find((f) => f.autofix)?.autofix;
  assert.ok(fix);
  const after = run([service(), database("db", undefined, fix.replicas)], [link("api", "db")]);
  assert.equal((after.score ?? 0) - (before.score ?? 0), PENALTY.important);
});

test("les constats sont triés par gravité, et le même schéma donne toujours le même audit", () => {
  const nodes = [block("orphan", "generic"), service("api", []), block("web", "webapp", { pages: ["a"] })];
  const edges = [link("web", "api")];
  const first = run(nodes, edges);
  assert.deepEqual(run(nodes, edges), first);
  const order = first.findings.map((f) => f.severity);
  assert.deepEqual(order, [...order].sort((a, b) => ["critique", "important", "mineur"].indexOf(a) - ["critique", "important", "mineur"].indexOf(b)));
  assert.equal(order[0], "critique");
});

test("chaque règle a son test : un jeu d'essai qui la déclenche et le même schéma, corrigé, qui ne la déclenche plus", () => {
  const payment = block("pay", "mobile-payment", { currency: "XOF", flow: "collect" });
  const queue = block("file", "queue", { topics: ["t"] });
  const web = block("web", "webapp", { pages: ["a"] });
  const auth = block("auth", "auth", { method: "password" });
  const dangling = [entity("rdv", field("medecin_id", "uuid")), entity("medecin", field("nom", "string"))];
  const cases: Record<RuleId, { bad: () => Audit; good: () => Audit }> = {
    "auth-absente": { bad: () => run([web, service()], [link("web", "api")]), good: () => run([web, service(), auth], [link("web", "api"), link("web", "auth")]) },
    "auth-non-reliee": { bad: () => run([web, auth]), good: () => run([web, auth], [link("web", "auth")]) },
    "base-partagee": { bad: () => run([service("a"), service("b"), database()], [link("a", "db"), link("b", "db")]), good: () => run([service("a"), database()], [link("a", "db")]) },
    "base-sans-replique": { bad: () => run([service(), database("db", undefined, 1)], [link("api", "db")]), good: () => run([service(), database()], [link("api", "db")]) },
    "paiement-sans-reference": { bad: () => run([payment]), good: () => run([payment, database("db", [entity("p", field("reference", "string", { unique: true }))])]) },
    "paiement-sans-file": { bad: () => run([payment, service()], [link("api", "pay")]), good: () => run([payment, queue], [link("pay", "file")]) },
    "impasse-creation": { bad: () => run([service("api", [endpoint("POST", "/rdvs")]), database("db", dangling)]), good: () => run([service("api", [endpoint("POST", "/rdvs"), endpoint("POST", "/medecins")]), database("db", dangling)]) },
    "message-hors-limite": { bad: () => run([block("m", "messaging", { channel: "sms", templates: [{ name: "a", text: "êtes" }] })]), good: () => run([block("m", "messaging", { channel: "sms", templates: [{ name: "a", text: "etes" }] })]) },
    "bloc-vide": { bad: () => run([block("api", "service")]), good: () => run([service()]) },
    "bloc-orphelin": { bad: () => run([block("a", "generic"), block("b", "generic")]), good: () => run([block("a", "generic"), block("b", "generic")], [link("a", "b")]) },
  };
  assert.equal(RULES.length, RULE_COUNT, "RULE_COUNT suit la liste des règles");
  assert.equal(new Set(RULES.map(([id]) => id)).size, RULES.length, "pas de règle en double");
  for (const [id] of RULES) {
    const test = cases[id];
    assert.ok(test, `aucun jeu d'essai pour la règle ${id}`);
    assert.ok(rules(test.bad()).includes(id), `${id} : le schéma fautif n'est pas signalé`);
    assert.ok(!rules(test.good()).includes(id), `${id} : le schéma corrigé est encore signalé`);
  }
});

test("les cinq modèles de départ n'ont ni constat critique, ni impasse, ni bloc vide ou orphelin, ni message hors limite", () => {
  const dir = fileURLToPath(new URL("../../../docs/exemples/", import.meta.url));
  const files = readdirSync(dir).filter((file) => file.endsWith(".canvas.json"));
  assert.equal(files.length, 5);
  const allowed: RuleId[] = ["base-sans-replique", "paiement-sans-file"];
  for (const file of files) {
    const canvas = JSON.parse(readFileSync(dir + file, "utf-8"));
    const nodes = canvas.nodes.map((n: { id: string; type: string; position: { x: number; y: number }; data: JsonObject }) =>
      nodeFromEntry(n.id, { type: n.type, position: n.position, data: n.data }),
    );
    const edges = canvas.edges.map((e: { id: string; source: string; target: string; kind?: string; label?: string }) =>
      edgeFromEntry(e.id, { source: e.source, target: e.target, kind: e.kind, label: e.label }),
    );
    const audit = auditArchitecture(nodes, edges);
    for (const finding of audit.findings) {
      assert.ok(allowed.includes(finding.rule), `${file} : ${finding.rule} (${finding.title})`);
    }
    assert.equal(audit.counts.critique, 0, file);
    assert.ok((audit.score ?? 0) >= 80, `${file} : score ${audit.score}`);
  }
});
