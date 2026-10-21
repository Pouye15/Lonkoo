package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;

import com.lonkoo.backend.canvas.CanvasJsonValidator;
import com.lonkoo.backend.canvas.CanvasValidator;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Règles métier du validateur de canvas (sans base ni temps réel) : identifiants
 * uniques, liens vers des blocs existants, mots réservés.
 */
class CanvasValidatorTest {

    private final JsonMapper jsonMapper = JsonMapper.shared();
    private final CanvasValidator validator = new CanvasValidator(new CanvasJsonValidator());

    @Test
    void validSnapshotPasses() {
        assertThat(validator.isValid(tree("""
                {
                  "schemaVersion": 1,
                  "nodes": [
                    {"id": "n1", "type": "service", "position": {"x": 0, "y": 0},
                     "data": {"name": "api"}}
                  ],
                  "edges": []
                }
                """))).isTrue();
    }

    @Test
    void edgeToUnknownNodeFails() {
        assertThat(validator.isValid(tree("""
                {
                  "schemaVersion": 1,
                  "nodes": [
                    {"id": "n1", "type": "service", "position": {"x": 0, "y": 0},
                     "data": {"name": "api"}}
                  ],
                  "edges": [
                    {"id": "e1", "source": "n1", "target": "n-inexistant"}
                  ]
                }
                """))).isFalse();
    }

    @Test
    void duplicateNodeIdFails() {
        assertThat(validator.isValid(tree("""
                {
                  "schemaVersion": 1,
                  "nodes": [
                    {"id": "n1", "type": "service", "position": {"x": 0, "y": 0},
                     "data": {"name": "api_a"}},
                    {"id": "n1", "type": "service", "position": {"x": 0, "y": 0},
                     "data": {"name": "api_b"}}
                  ],
                  "edges": []
                }
                """))).isFalse();
    }

    @Test
    void reservedWordNameFails() {
        assertThat(validator.isValid(tree("""
                {
                  "schemaVersion": 1,
                  "nodes": [
                    {"id": "n1", "type": "service", "position": {"x": 0, "y": 0},
                     "data": {"name": "class"}}
                  ],
                  "edges": []
                }
                """))).isFalse();
    }

    private tools.jackson.databind.JsonNode tree(String json) {
        try {
            return jsonMapper.readTree(json);
        } catch (JacksonException e) {
            throw new IllegalArgumentException("JSON de test invalide", e);
        }
    }
}