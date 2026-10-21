package com.lonkoo.backend.canvas;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Component;

import tools.jackson.databind.JsonNode;

/**
 * Validation partagée d'un instantané de canvas : schéma JSON (draft 2020-12) puis les règles que le
 * schéma ne peut pas exprimer, telles que les décrit {@code docs/schema-canvas.md} :
 * <ul>
 *   <li>identifiants de blocs et de liens uniques, liens vers des blocs existants ;</li>
 *   <li>{@code name} unique pour les blocs (dans le canvas), les entités (dans leur base) et les champs
 *       (dans leur entité) ;</li>
 *   <li>aucun identifiant technique ({@code name} d'un bloc, d'une entité, d'un champ ou d'un gabarit,
 *       page, topic) ne porte un mot réservé Java, SQL ou YAML ({@link ReservedWords}).</li>
 * </ul>
 * Même fonction pour l'instantané, la restauration, l'import et la sortie de l'IA.
 */
@Component
public class CanvasValidator {

    private final CanvasJsonValidator schemaValidator;

    public CanvasValidator(CanvasJsonValidator schemaValidator) {
        this.schemaValidator = schemaValidator;
    }

    /** Liste des erreurs (vide si l'instantané est valide). */
    public List<String> validate(JsonNode snapshot) {
        List<String> errors = new ArrayList<>(schemaValidator.validate(snapshot));
        if (snapshot == null || !snapshot.isObject()) {
            return errors;
        }

        Set<String> nodeIds = new HashSet<>();
        Set<String> nodeNames = new HashSet<>();
        JsonNode nodes = snapshot.get("nodes");
        if (nodes != null && nodes.isArray()) {
            for (JsonNode node : nodes) {
                String id = node.path("id").asText();
                if (!nodeIds.add(id)) {
                    errors.add("Identifiant de bloc dupliqué : " + id);
                }
                JsonNode data = node.path("data");
                String name = data.path("name").asText();
                String where = "bloc " + id;
                checkIdentifier(errors, name, "Nom de bloc", where);
                if (!name.isBlank() && !nodeNames.add(name)) {
                    errors.add("Nom de bloc dupliqué : " + name);
                }
                checkDataIdentifiers(errors, data, where);
            }
        }

        Set<String> edgeIds = new HashSet<>();
        JsonNode edges = snapshot.get("edges");
        if (edges != null && edges.isArray()) {
            for (JsonNode edge : edges) {
                String id = edge.path("id").asText();
                if (!edgeIds.add(id)) {
                    errors.add("Identifiant de lien dupliqué : " + id);
                }
                String source = edge.path("source").asText();
                String target = edge.path("target").asText();
                if (!nodeIds.contains(source)) {
                    errors.add("Lien " + id + " : source inconnue " + source);
                }
                if (!nodeIds.contains(target)) {
                    errors.add("Lien " + id + " : cible inconnue " + target);
                }
            }
        }

        return errors;
    }

    public boolean isValid(JsonNode snapshot) {
        return validate(snapshot).isEmpty();
    }

    /** Entités, champs, gabarits, pages et topics d'un bloc : unicité et mots réservés. */
    private void checkDataIdentifiers(List<String> errors, JsonNode data, String where) {
        Set<String> entityNames = new HashSet<>();
        for (JsonNode entity : array(data, "entities")) {
            String entityName = entity.path("name").asText();
            checkIdentifier(errors, entityName, "Nom d'entité", where);
            if (!entityName.isBlank() && !entityNames.add(entityName)) {
                errors.add("Nom d'entité dupliqué dans le " + where + " : " + entityName);
            }
            Set<String> fieldNames = new HashSet<>();
            for (JsonNode field : array(entity, "fields")) {
                String fieldName = field.path("name").asText();
                checkIdentifier(errors, fieldName, "Nom de champ", where + ", entité " + entityName);
                if (!fieldName.isBlank() && !fieldNames.add(fieldName)) {
                    errors.add("Nom de champ dupliqué dans l'entité " + entityName + " du " + where + " : " + fieldName);
                }
            }
        }
        for (JsonNode template : array(data, "templates")) {
            checkIdentifier(errors, template.path("name").asText(), "Nom de gabarit", where);
        }
        for (JsonNode page : array(data, "pages")) {
            checkIdentifier(errors, page.asText(), "Nom de page", where);
        }
        for (JsonNode topic : array(data, "topics")) {
            checkIdentifier(errors, topic.asText(), "Nom de topic", where);
        }
    }

    private static void checkIdentifier(List<String> errors, String identifier, String kind, String where) {
        if (identifier.isBlank()) {
            errors.add(kind + " vide (" + where + ")");
        } else if (ReservedWords.isReserved(identifier)) {
            errors.add(kind + " réservé (mot Java, SQL ou YAML) : " + identifier + " (" + where + ")");
        }
    }

    private static Iterable<JsonNode> array(JsonNode parent, String field) {
        JsonNode value = parent.path(field);
        return value.isArray() ? value : List.of();
    }
}
