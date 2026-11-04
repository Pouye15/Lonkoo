package com.lonkoo.backend.ai;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Une remarque d'audit incomplète ou invalide est écartée, jamais complétée à la place de l'agent.
 */
class AiFindingParserTest {

    private static final JsonMapper JSON = JsonMapper.shared();

    private static JsonNode item(String json) {
        return JSON.readTree(json);
    }

    private static final String COMPLETE = """
            {"id":"r1","severity":"critical","category":"Security","title":"Base exposée","targetNodeId":"n1",
             "rationale":"Joignable depuis Internet","currentConfig":"port ouvert","proposedConfig":"réseau privé"}
            """;

    @Test
    void aCompleteFindingIsKeptAsIs() {
        AiFinding finding = AiFindingParser.parse(item(COMPLETE), 1).orElseThrow();

        assertThat(finding.id()).isEqualTo("r1");
        assertThat(finding.severity()).isEqualTo(AiFinding.Severity.CRITICAL);
        assertThat(finding.category()).isEqualTo(AiFinding.Category.SECURITY);
        assertThat(finding.title()).isEqualTo("Base exposée");
        assertThat(finding.targetNodeId()).isEqualTo("n1");
        assertThat(finding.proposedConfig()).isEqualTo("réseau privé");
    }

    @Test
    void aMissingIdGetsATechnicalNumber() {
        AiFinding finding = AiFindingParser.parse(item("""
                {"severity":"OPTIMIZATION","category":"STACK","title":"t","targetNodeId":"n1"}"""), 3).orElseThrow();

        assertThat(finding.id()).isEqualTo("remarque_3");
        assertThat(finding.rationale()).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            // gravité absente, inconnue ou pas un texte : avant, elle devenait « recommandée » en silence
            "{\"category\":\"STACK\",\"title\":\"t\",\"targetNodeId\":\"n1\"}",
            "{\"severity\":\"URGENT\",\"category\":\"STACK\",\"title\":\"t\",\"targetNodeId\":\"n1\"}",
            "{\"severity\":3,\"category\":\"STACK\",\"title\":\"t\",\"targetNodeId\":\"n1\"}",
            // catégorie absente ou inconnue : avant, elle devenait « stack »
            "{\"severity\":\"CRITICAL\",\"title\":\"t\",\"targetNodeId\":\"n1\"}",
            "{\"severity\":\"CRITICAL\",\"category\":\"COULEUR\",\"title\":\"t\",\"targetNodeId\":\"n1\"}",
            // titre absent ou vide : avant, « Remarque d'architecture »
            "{\"severity\":\"CRITICAL\",\"category\":\"STACK\",\"targetNodeId\":\"n1\"}",
            "{\"severity\":\"CRITICAL\",\"category\":\"STACK\",\"title\":\"  \",\"targetNodeId\":\"n1\"}",
            // bloc visé absent ou pas un texte
            "{\"severity\":\"CRITICAL\",\"category\":\"STACK\",\"title\":\"t\"}",
            "{\"severity\":\"CRITICAL\",\"category\":\"STACK\",\"title\":\"t\",\"targetNodeId\":[\"n1\"]}",
            // pas un objet
            "\"texte\"",
            "12",
            "null"
    })
    void anIncompleteOrInvalidFindingIsDropped(String json) {
        assertThat(AiFindingParser.parse(item(json), 1)).isEmpty();
    }

    @Test
    void aNullItemIsDropped() {
        assertThat(AiFindingParser.parse(null, 1)).isEmpty();
    }
}
