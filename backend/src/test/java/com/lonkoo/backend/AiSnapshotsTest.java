package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import com.lonkoo.backend.ai.AiSnapshots;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * La réduction d'un instantané avant l'appel au fournisseur : les positions et tout ce qui n'est pas au contrat
 * disparaissent, rien de ce qui sert au raisonnement ne disparaît.
 */
class AiSnapshotsTest {

    private static final JsonMapper JSON = JsonMapper.shared();

    /** Un instantané réaliste : le modèle d'exemple du dépôt, qui utilise les neuf champs métier du contrat. */
    private static JsonNode seed() throws IOException {
        return JSON.readTree(new String(
                new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8));
    }

    @Test
    void theRealSnapshotLosesItsPositionsAndNothingElse() throws IOException {
        JsonNode pruned = AiSnapshots.prune(seed());

        assertThat(pruned.toString()).as("aucune position ne part au modèle").doesNotContain("position");
        keepsEverythingButPositions(seed(), pruned, "racine");
    }

    @Test
    void theContractFieldsOfEachBlockSurvive() throws IOException {
        JsonNode pruned = AiSnapshots.prune(seed());

        assertThat(pruned.path("schemaVersion").asInt()).isEqualTo(1);
        assertThat(pruned.path("meta").path("name").asText()).isEqualTo("Marketplace avec paiement mobile");
        assertThat(pruned.path("meta").path("description").asText()).isNotBlank();
        assertThat(pruned.path("nodes").size()).isEqualTo(7);
        assertThat(pruned.path("edges").size()).isEqualTo(6);

        assertThat(node(pruned, "n1").path("data").path("pages").size()).as("webapp : pages").isEqualTo(3);
        assertThat(node(pruned, "n2").path("data").path("method").asText()).as("auth : méthode").isEqualTo("otp-sms");
        assertThat(node(pruned, "n3").path("data").path("endpoints").get(0).path("path").asText())
                .as("service : routes").isEqualTo("/produits");
        JsonNode database = node(pruned, "n4").path("data");
        assertThat(database.path("engine").asText()).isEqualTo("postgresql");
        assertThat(database.path("entities").get(0).path("fields").get(0).path("type").asText()).isEqualTo("string");
        assertThat(database.path("entities").get(0).path("fields").get(0).path("required").asBoolean()).isTrue();
        assertThat(node(pruned, "n5").path("data").path("currency").asText()).as("paiement mobile").isEqualTo("XOF");
        assertThat(node(pruned, "n5").path("data").path("flow").asText()).isEqualTo("collect");
        assertThat(node(pruned, "n6").path("data").path("channel").asText()).as("messagerie").isEqualTo("whatsapp");
        assertThat(node(pruned, "n6").path("data").path("templates").get(0).path("text").asText()).isNotBlank();
        assertThat(node(pruned, "n7").path("data").path("model").asText()).as("facturation").isEqualTo("one-time");

        JsonNode edge = pruned.path("edges").get(0);
        assertThat(edge.path("id").asText()).isEqualTo("e1");
        assertThat(edge.path("source").asText()).isEqualTo("n1");
        assertThat(edge.path("target").asText()).isEqualTo("n3");
        assertThat(edge.path("kind").asText()).isEqualTo("http");
        assertThat(edge.path("label").asText()).isEqualTo("appelle l'API");
    }

    @Test
    void whateverIsNotInTheContractIsThrownAway() {
        JsonNode snapshot = JSON.readTree("""
                {
                  "schemaVersion": 1,
                  "viewport": { "zoom": 1.5 },
                  "meta": { "name": "Démo", "description": "x", "auteur": "quelqu'un" },
                  "nodes": [
                    {
                      "id": "n1", "type": "service", "position": { "x": 12, "y": 34 },
                      "selected": true, "width": 180, "dragging": false,
                      "data": {
                        "name": "api", "label": "API", "tech": "Spring Boot",
                        "couleur": "#ff0000", "collapsed": true,
                        "endpoints": [ { "method": "GET", "path": "/x", "summary": "s", "icone": "star" } ]
                      }
                    }
                  ],
                  "edges": [
                    { "id": "e1", "source": "n1", "target": "n1", "kind": "http", "label": "boucle",
                      "animated": true, "style": { "stroke": "red" } }
                  ]
                }
                """);

        JsonNode pruned = AiSnapshots.prune(snapshot);

        assertThat(pruned.has("viewport")).isFalse();
        assertThat(pruned.path("meta").has("auteur")).isFalse();
        JsonNode node = pruned.path("nodes").get(0);
        assertThat(node.propertyNames()).containsExactlyInAnyOrder("id", "type", "data");
        assertThat(node.path("data").propertyNames()).containsExactlyInAnyOrder("name", "label", "tech", "endpoints");
        assertThat(node.path("data").path("endpoints").get(0).propertyNames())
                .containsExactlyInAnyOrder("method", "path", "summary");
        assertThat(pruned.path("edges").get(0).propertyNames())
                .containsExactlyInAnyOrder("id", "source", "target", "kind", "label");
    }

    @Test
    void anAbsentSnapshotStaysAbsent() {
        assertThat(AiSnapshots.prune(null)).as("le conseiller global n'a pas de canvas").isNull();
        assertThat(AiSnapshots.prune(JSON.readTree("\"texte\"")).asText()).isEqualTo("texte");
    }

    @Test
    void anEmptySnapshotKeepsItsTwoLists() {
        JsonNode pruned = AiSnapshots.prune(JSON.readTree("{\"schemaVersion\":1,\"nodes\":[],\"edges\":[]}"));

        assertThat(pruned.path("nodes").isArray()).isTrue();
        assertThat(pruned.path("nodes").isEmpty()).isTrue();
        assertThat(pruned.path("edges").isArray()).isTrue();
    }

    /** Tout ce que porte l'original, sauf les positions, se retrouve à l'identique dans l'instantané réduit. */
    private static void keepsEverythingButPositions(JsonNode original, JsonNode pruned, String where) {
        if (original.isObject()) {
            for (String field : original.propertyNames()) {
                if (field.equals("position")) {
                    continue;
                }
                assertThat(pruned.has(field)).as("%s : le champ « %s » du contrat a disparu", where, field).isTrue();
                keepsEverythingButPositions(original.get(field), pruned.get(field), where + "." + field);
            }
        } else if (original.isArray()) {
            assertThat(pruned.size()).as("%s : taille de la liste", where).isEqualTo(original.size());
            for (int i = 0; i < original.size(); i++) {
                keepsEverythingButPositions(original.get(i), pruned.get(i), where + "[" + i + "]");
            }
        } else {
            assertThat(pruned).as("%s : valeur", where).isEqualTo(original);
        }
    }

    private static JsonNode node(JsonNode snapshot, String id) {
        for (JsonNode node : snapshot.path("nodes")) {
            if (id.equals(node.path("id").asText())) {
                return node;
            }
        }
        throw new AssertionError("Bloc absent de l'instantané réduit : " + id);
    }
}
