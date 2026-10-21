package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ClassPathResource;

import com.lonkoo.backend.canvas.CanvasJsonValidator;
import com.lonkoo.backend.canvas.CanvasValidator;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Règles du contrat que le schéma JSON ne peut pas exprimer (sans base ni temps réel) : identifiants
 * uniques, liens vers des blocs existants, noms uniques (blocs, entités, champs) et mots réservés
 * Java, SQL ou YAML pour tous les identifiants techniques.
 */
class CanvasValidatorTest {

    private final JsonMapper jsonMapper = JsonMapper.shared();
    private final CanvasValidator validator = new CanvasValidator(new CanvasJsonValidator());

    // ------------------------------------------------------------------ Cas valides

    @Test
    void validSnapshotPasses() {
        assertThat(validator.isValid(tree(snapshot(service("n1", "api"))))).isTrue();
    }

    @Test
    void theExampleModelPasses() throws IOException {
        String example = new String(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8);

        assertThat(validator.validate(tree(example))).isEmpty();
    }

    @Test
    void ordinaryBusinessNamesAreAccepted() {
        String entity = entity("client", field("id"), field("nom"), field("statut"), field("date_creation"), field("montant_total"));

        assertThat(errorsOf(snapshot(database("n1", "base_clients", entity)))).isEmpty();
    }

    // ------------------------------------------------------------------ Liens et identifiants de blocs

    @Test
    void edgeToUnknownNodeFails() {
        assertThat(errorsOf(snapshot(List.of(service("n1", "api")), List.of(edge("e1", "n1", "n-inexistant")))))
                .anyMatch(error -> error.contains("cible inconnue n-inexistant"));
    }

    @Test
    void edgeFromUnknownNodeFails() {
        assertThat(errorsOf(snapshot(List.of(service("n1", "api")), List.of(edge("e1", "fantome", "n1")))))
                .anyMatch(error -> error.contains("source inconnue fantome"));
    }

    @Test
    void duplicateNodeIdFails() {
        assertThat(errorsOf(snapshot(service("n1", "api_a"), service("n1", "api_b"))))
                .anyMatch(error -> error.contains("Identifiant de bloc dupliqué : n1"));
    }

    @Test
    void duplicateEdgeIdFails() {
        assertThat(errorsOf(snapshot(List.of(service("n1", "api_a"), service("n2", "api_b")),
                List.of(edge("e1", "n1", "n2"), edge("e1", "n2", "n1")))))
                .anyMatch(error -> error.contains("Identifiant de lien dupliqué : e1"));
    }

    // ------------------------------------------------------------------ Noms uniques

    @Test
    void duplicateBlockNameFails() {
        assertThat(errorsOf(snapshot(service("n1", "api"), service("n2", "api"))))
                .anyMatch(error -> error.contains("Nom de bloc dupliqué : api"));
    }

    @Test
    void duplicateEntityNameInOneDatabaseFails() {
        String twice = entity("client", field("id")) + "," + entity("client", field("nom"));

        assertThat(errorsOf(snapshot(database("n1", "base", twice))))
                .anyMatch(error -> error.contains("Nom d'entité dupliqué") && error.contains("client"));
    }

    @Test
    void theSameEntityNameInTwoDatabasesIsFine() {
        assertThat(errorsOf(snapshot(database("n1", "base_a", entity("client", field("id"))),
                database("n2", "base_b", entity("client", field("id")))))).isEmpty();
    }

    @Test
    void duplicateFieldNameInOneEntityFails() {
        assertThat(errorsOf(snapshot(database("n1", "base", entity("client", field("nom"), field("nom"))))))
                .anyMatch(error -> error.contains("Nom de champ dupliqué") && error.contains("client") && error.contains("nom"));
    }

    @Test
    void theSameFieldNameInTwoEntitiesIsFine() {
        assertThat(errorsOf(snapshot(database("n1", "base",
                entity("client", field("nom")) + "," + entity("produit", field("nom")))))).isEmpty();
    }

    // ------------------------------------------------------------------ Mots réservés

    @ParameterizedTest
    @ValueSource(strings = {"class", "interface", "int", "boolean", "void", "static", "record", "enum", "package", "goto"})
    void javaKeywordsAreRejectedAsBlockNames(String word) {
        assertThat(errorsOf(snapshot(service("n1", word)))).anyMatch(error -> error.contains("réservé") && error.contains(word));
    }

    @ParameterizedTest
    @ValueSource(strings = {"select", "table", "user", "order", "group", "where", "primary", "key", "values", "limit"})
    void sqlWordsAreRejectedAsEntityNames(String word) {
        assertThat(errorsOf(snapshot(database("n1", "base", entity(word, field("id"))))))
                .anyMatch(error -> error.contains("Nom d'entité réservé") && error.contains(word));
    }

    @ParameterizedTest
    @ValueSource(strings = {"select", "from", "default", "null", "true", "yes", "off", "new", "case", "end"})
    void reservedWordsAreRejectedAsFieldNames(String word) {
        assertThat(errorsOf(snapshot(database("n1", "base", entity("client", field(word))))))
                .anyMatch(error -> error.contains("Nom de champ réservé") && error.contains(word));
    }

    @ParameterizedTest
    @ValueSource(strings = {"yes", "no", "on", "off", "true", "false", "null", "y", "n"})
    void yamlBooleansAreRejectedEverywhere(String word) {
        assertThat(errorsOf(snapshot(service("n1", word)))).anyMatch(error -> error.contains("Nom de bloc réservé"));
        assertThat(errorsOf(snapshot(webapp("n1", "site", "\"" + word + "\"")))).anyMatch(error -> error.contains("Nom de page réservé"));
        assertThat(errorsOf(snapshot(queue("n1", "bus", "\"" + word + "\"")))).anyMatch(error -> error.contains("Nom de topic réservé"));
    }

    @Test
    void reservedWordsAreRejectedForTemplatesPagesAndTopics() {
        String messaging = "{\"id\":\"n1\",\"type\":\"messaging\",\"position\":{\"x\":0,\"y\":0},\"data\":{\"name\":\"sms\",\"channel\":\"sms\","
                + "\"templates\":[{\"name\":\"class\",\"text\":\"Bonjour\"}]}}";

        assertThat(errorsOf(snapshot(messaging))).anyMatch(error -> error.contains("Nom de gabarit réservé") && error.contains("class"));
        assertThat(errorsOf(snapshot(webapp("n1", "site", "\"class\"")))).anyMatch(error -> error.contains("Nom de page réservé"));
        assertThat(errorsOf(snapshot(queue("n1", "bus", "\"select\"")))).anyMatch(error -> error.contains("Nom de topic réservé"));
    }

    @Test
    void labelsAndTextsAreNeverTreatedAsIdentifiers() {
        // « label » et « text » ne finissent jamais dans du code : ils peuvent porter n'importe quel mot.
        String block = "{\"id\":\"n1\",\"type\":\"service\",\"position\":{\"x\":0,\"y\":0},\"data\":{\"name\":\"api\",\"label\":\"class select\"}}";

        assertThat(errorsOf(snapshot(block))).isEmpty();
    }

    @Test
    void severalProblemsAreReportedTogether() {
        List<String> errors = errorsOf(snapshot(List.of(service("n1", "class"), service("n2", "class"), service("n3", "api")),
                List.of(edge("e1", "n1", "ailleurs"))));

        assertThat(errors).hasSizeGreaterThanOrEqualTo(3);
        assertThat(errors.stream().collect(Collectors.joining("|")))
                .contains("réservé").contains("dupliqué").contains("cible inconnue");
    }

    // ------------------------------------------------------------------ Outils

    private List<String> errorsOf(String snapshotJson) {
        return validator.validate(tree(snapshotJson));
    }

    private static String snapshot(String... nodes) {
        return snapshot(List.of(nodes), List.of());
    }

    private static String snapshot(List<String> nodes, List<String> edges) {
        return "{\"schemaVersion\":1,\"nodes\":[" + String.join(",", nodes) + "],\"edges\":[" + String.join(",", edges) + "]}";
    }

    private static String node(String id, String type, String data) {
        return "{\"id\":\"" + id + "\",\"type\":\"" + type + "\",\"position\":{\"x\":0,\"y\":0},\"data\":" + data + "}";
    }

    private static String service(String id, String name) {
        return node(id, "service", "{\"name\":\"" + name + "\"}");
    }

    private static String webapp(String id, String name, String pages) {
        return node(id, "webapp", "{\"name\":\"" + name + "\",\"pages\":[" + pages + "]}");
    }

    private static String queue(String id, String name, String topics) {
        return node(id, "queue", "{\"name\":\"" + name + "\",\"topics\":[" + topics + "]}");
    }

    private static String database(String id, String name, String entities) {
        return node(id, "database", "{\"name\":\"" + name + "\",\"entities\":[" + entities + "]}");
    }

    private static String entity(String name, String... fields) {
        return "{\"name\":\"" + name + "\",\"fields\":[" + String.join(",", fields) + "]}";
    }

    private static String field(String name) {
        return "{\"name\":\"" + name + "\",\"type\":\"string\"}";
    }

    private static String edge(String id, String source, String target) {
        return "{\"id\":\"" + id + "\",\"source\":\"" + source + "\",\"target\":\"" + target + "\"}";
    }

    private JsonNode tree(String json) {
        try {
            return jsonMapper.readTree(json);
        } catch (JacksonException e) {
            throw new IllegalArgumentException("JSON de test invalide", e);
        }
    }
}
