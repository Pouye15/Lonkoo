package com.lonkoo.backend.canvas;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Valide un instantané de canvas contre {@code canvas.schema.json} (draft
 * 2020-12). Même fonction partagée pour le seed (WP4a), les versions (WP7),
 * l'import et plus tard la sortie de l'IA.
 */
@Component
public class CanvasJsonValidator {

    private final JsonMapper jsonMapper = JsonMapper.shared();
    private final Schema schema;

    public CanvasJsonValidator() {
        this.schema = loadSchema();
    }

    private Schema loadSchema() {
        try (InputStream in = new ClassPathResource("seed/canvas.schema.json").getInputStream()) {
            JsonNode raw = jsonMapper.readTree(in);
            if (!(raw instanceof ObjectNode schemaNode)) {
                throw new IllegalStateException("Le schéma du canvas n'est pas un objet JSON");
            }
            // Le contrat partagé utilise un $id relatif (« canvas.schema.json »),
            // accepté par le validateur Python de la CI mais rejeté par
            // json-schema-validator 3.x qui exige un IRI absolu. On le normalise
            // ici sans modifier le document partagé (qui ne change que par PR).
            schemaNode.put("$id", "http://lonkoo.dev/schemas/canvas.schema.json");
            return SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12)
                    .getSchema(schemaNode);
        } catch (IOException | JacksonException e) {
            throw new IllegalStateException("Impossible de charger le schéma du canvas", e);
        }
    }

    /**
     * Valide un arbre JSON déjà parsé.
     *
     * @return la liste des erreurs (vide si valide)
     */
    public List<String> validate(JsonNode node) {
        return schema.validate(node).stream()
                .map(e -> e.getEvaluationPath() + ": " + e.getMessage())
                .toList();
    }

    /**
     * Valide un instantané sous forme textuelle.
     */
    public List<String> validate(String json) {
        try {
            return validate(jsonMapper.readTree(json));
        } catch (JacksonException e) {
            return List.of("JSON invalide : " + e.getMessage());
        }
    }

    public JsonNode readTree(String json) throws JacksonException {
        return jsonMapper.readTree(json);
    }
}