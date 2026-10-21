package com.lonkoo.backend.canvas;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Component;

import tools.jackson.databind.JsonNode;

/**
 * Validation partagée d'un instantané de canvas : schéma JSON (draft 2020-12)
 * + règles que le schéma ne peut pas exprimer (identifiants uniques, liens vers
 * des blocs existants, noms uniques, mots réservés Java/SQL/YAML). Même
 * fonction pour l'instantané, l'import et la sortie de l'IA.
 */
@Component
public class CanvasValidator {

    private static final Set<String> RESERVED_WORDS = Set.of(
            // Java
            "class", "interface", "enum", "package", "import", "public", "private",
            "protected", "static", "final", "void", "extends", "implements", "new",
            "return", "if", "else", "for", "while", "switch", "case", "break",
            "continue", "try", "catch", "finally", "throw", "throws", "super", "this",
            // SQL
            "select", "insert", "update", "delete", "from", "where", "table", "index",
            "order", "group", "by", "join", "values", "create", "drop", "alter",
            // YAML (« on » et « off » sont aussi des booléens YAML)
            "true", "false", "null", "yes", "no", "on", "off");

    private final CanvasJsonValidator schemaValidator;

    public CanvasValidator(CanvasJsonValidator schemaValidator) {
        this.schemaValidator = schemaValidator;
    }

    /** Liste des règles déjà appliquées. */
    public List<String> validate(JsonNode snapshot) {
        List<String> errors = new ArrayList<>(schemaValidator.validate(snapshot));
        if (snapshot == null || !snapshot.isObject()) {
            return errors;
        }

        Set<String> nodeIds = new HashSet<>();
        JsonNode nodes = snapshot.get("nodes");
        if (nodes != null && nodes.isArray()) {
            for (JsonNode node : nodes) {
                String id = node.path("id").asText();
                if (!nodeIds.add(id)) {
                    errors.add("Identifiant de bloc dupliqué : " + id);
                }
                String name = node.path("data").path("name").asText();
                if (name.isBlank() || RESERVED_WORDS.contains(name)) {
                    errors.add("Nom de bloc invalide ou réservé : " + name);
                }
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
}