package com.lonkoo.backend.ai;

import java.util.Locale;
import java.util.Optional;

import tools.jackson.databind.JsonNode;

/**
 * Lit une remarque d'audit renvoyée par un agent. Une remarque incomplète ou invalide est écartée : jamais corrigée
 * ni complétée à la place de l'agent (une gravité inconnue ne devient pas « recommandée », un titre vide ne devient
 * pas un titre inventé). Les remarques qui visent un bloc absent du canvas sont écartées plus loin, par
 * {@link AiService}, qui les compte.
 */
final class AiFindingParser {

    private AiFindingParser() {
    }

    /**
     * @param item  l'élément du tableau {@code findings}
     * @param index sa position (à partir de 1), pour numéroter une remarque sans identifiant
     */
    static Optional<AiFinding> parse(JsonNode item, int index) {
        if (item == null || !item.isObject()) {
            return Optional.empty();
        }
        String targetNodeId = text(item, "targetNodeId");
        String title = text(item, "title");
        AiFinding.Severity severity = enumValue(AiFinding.Severity.class, text(item, "severity"));
        AiFinding.Category category = enumValue(AiFinding.Category.class, text(item, "category"));
        if (targetNodeId.isEmpty() || title.isEmpty() || severity == null || category == null) {
            return Optional.empty();
        }
        String id = text(item, "id");
        return Optional.of(new AiFinding(
                id.isEmpty() ? "remarque_" + index : id,
                severity,
                category,
                title,
                targetNodeId,
                text(item, "rationale"),
                text(item, "currentConfig"),
                text(item, "proposedConfig")));
    }

    private static String text(JsonNode item, String field) {
        JsonNode value = item.get(field);
        return value != null && value.isTextual() ? value.asText().strip() : "";
    }

    private static <E extends Enum<E>> E enumValue(Class<E> type, String value) {
        try {
            return Enum.valueOf(type, value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
