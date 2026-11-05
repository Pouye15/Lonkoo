package com.lonkoo.backend.generation;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Écrit {@code openapi.yaml} (OpenAPI 3.0) : un chemin par endpoint du canvas, un schéma par table. Toutes les
 * chaînes sont écrites entre guillemets (clés comprises) : un texte libre ne peut pas devenir de la structure YAML.
 */
final class OpenApiWriter {

    private final BlueprintModel model;
    private final Map<String, String> files;
    private final SpringBackendWriter backend;

    OpenApiWriter(BlueprintModel model, Map<String, String> files, SpringBackendWriter backend) {
        this.model = model;
        this.files = files;
        this.backend = backend;
    }

    void write() {
        StringBuilder y = new StringBuilder();
        y.append("openapi: 3.0.3\n");
        y.append("info:\n");
        y.append("  title: ").append(Texts.yaml(model.displayName + " : API")).append('\n');
        y.append("  version: \"0.1.0\"\n");
        y.append("  description: ").append(Texts.yaml("Contrat d'API généré par LONKOO à partir du canvas. Les opérations qui répondent 501 sont à implémenter.")).append('\n');
        y.append("servers:\n  - url: http://localhost:8080\n    description: Développement local\n");

        Map<String, List<SpringBackendWriter.Operation>> byPath = new LinkedHashMap<>();
        for (SpringBackendWriter.Operation op : backend.operations()) {
            byPath.computeIfAbsent(op.path(), key -> new java.util.ArrayList<>()).add(op);
        }
        y.append("paths:\n");
        if (byPath.isEmpty()) {
            y.setLength(y.length() - "paths:\n".length());
            y.append("paths: {}\n");
        }
        Set<String> operationIds = new HashSet<>();
        for (Map.Entry<String, List<SpringBackendWriter.Operation>> path : byPath.entrySet()) {
            y.append("  ").append(Texts.yaml(path.getKey())).append(":\n");
            for (SpringBackendWriter.Operation op : path.getValue()) {
                operation(y, op, Naming.unique(op.operationId(), operationIds));
            }
        }

        if (backend.hasEntities()) {
            y.append("components:\n  schemas:\n");
            for (SpringBackendWriter.EntityInfo entity : backend.entities()) {
                schema(y, entity);
            }
        }
        files.put("openapi.yaml", y.toString());
    }

    private void operation(StringBuilder y, SpringBackendWriter.Operation op, String operationId) {
        SpringBackendWriter.EntityInfo entity = op.entity();
        String summary = op.summary() != null && !op.summary().isBlank() ? Texts.plain(op.summary(), 80) : op.method() + " " + op.path();
        y.append("    ").append(op.method().toLowerCase()).append(":\n");
        y.append("      operationId: ").append(Texts.yaml(operationId)).append('\n');
        y.append("      summary: ").append(Texts.yaml(summary)).append('\n');
        y.append("      tags: [").append(Texts.yaml(op.tag())).append("]\n");
        if (!op.pathVariables().isEmpty()) {
            y.append("      parameters:\n");
            for (String variable : op.pathVariables()) {
                y.append("        - name: ").append(Texts.yaml(variable)).append("\n          in: path\n          required: true\n          schema:\n            type: string\n");
                if (entity != null) {
                    y.append("            format: uuid\n");
                }
            }
        }
        if (entity != null && (op.kind() == SpringBackendWriter.Kind.CREATE || op.kind() == SpringBackendWriter.Kind.UPDATE)) {
            y.append("      requestBody:\n        required: true\n        content:\n          application/json:\n            schema:\n")
                    .append("              $ref: ").append(Texts.yaml("#/components/schemas/" + entity.className())).append('\n');
        }
        y.append("      responses:\n");
        String ref = entity == null ? "" : "#/components/schemas/" + entity.className();
        switch (op.kind()) {
            case LIST -> response(y, "200", "Liste", "type: array\n                items:\n                  $ref: " + Texts.yaml(ref));
            case CREATE -> {
                response(y, "201", "Créé", "$ref: " + Texts.yaml(ref));
                invalidAndConflict(y);
            }
            case GET -> {
                response(y, "200", "Enregistrement", "$ref: " + Texts.yaml(ref));
                y.append("        \"404\":\n          description: Introuvable\n");
            }
            case UPDATE -> {
                response(y, "200", "Enregistrement", "$ref: " + Texts.yaml(ref));
                y.append("        \"404\":\n          description: Introuvable\n");
                invalidAndConflict(y);
            }
            case DELETE -> {
                y.append("        \"204\":\n          description: Supprimé\n");
                y.append("        \"404\":\n          description: Introuvable\n");
            }
            case STUB -> y.append("        \"501\":\n          description: À implémenter\n");
        }
    }

    /** Ce que le projet généré répond (ApiErrorHandler) : 400 nomme les champs obligatoires manquants, 409 un doublon. */
    private void invalidAndConflict(StringBuilder y) {
        response(y, "400", "Données invalides : un champ obligatoire manque ou est vide",
                "type: object\n                properties:\n                  detail:\n                    type: string\n"
                        + "                  champs:\n                    type: object\n                    additionalProperties:\n                      type: string");
        response(y, "409", "Valeur déjà utilisée ou contrainte de la base non respectée",
                "type: object\n                properties:\n                  detail:\n                    type: string");
    }

    private void response(StringBuilder y, String status, String description, String schema) {
        y.append("        \"").append(status).append("\":\n          description: ").append(Texts.yaml(description)).append('\n');
        y.append("          content:\n            application/json:\n              schema:\n                ").append(schema).append('\n');
    }

    private void schema(StringBuilder y, SpringBackendWriter.EntityInfo entity) {
        y.append("    ").append(Texts.yaml(entity.className())).append(":\n      type: object\n");
        List<String> required = entity.fields().stream().filter(f -> f.field().required()).map(SpringBackendWriter.FieldInfo::javaName).toList();
        if (!required.isEmpty()) {
            y.append("      required: [").append(String.join(", ", required.stream().map(Texts::yaml).toList())).append("]\n");
        }
        y.append("      properties:\n        \"id\":\n          type: string\n          format: uuid\n          readOnly: true\n");
        for (SpringBackendWriter.FieldInfo field : entity.fields()) {
            y.append("        ").append(Texts.yaml(field.javaName())).append(":\n");
            switch (field.field().type()) {
                case "integer" -> y.append("          type: integer\n          format: int32\n");
                case "long" -> y.append("          type: integer\n          format: int64\n");
                case "decimal" -> y.append("          type: number\n");
                case "boolean" -> y.append("          type: boolean\n");
                case "date" -> y.append("          type: string\n          format: date\n");
                case "datetime" -> y.append("          type: string\n          format: date-time\n");
                case "uuid" -> y.append("          type: string\n          format: uuid\n");
                case "json" -> y.append("          type: object\n          additionalProperties: true\n");
                default -> y.append("          type: string\n");
            }
        }
    }
}
