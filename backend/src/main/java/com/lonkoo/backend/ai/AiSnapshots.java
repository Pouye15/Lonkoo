package com.lonkoo.backend.ai;

import java.util.List;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Réduction d'un instantané de canvas avant de l'envoyer au fournisseur d'IA : un instantané va jusqu'à 1 Mio et
 * 200 blocs (positions, décorations, champs hors contrat comprises), et c'est le premier poste de coût en jetons.
 *
 * <p>Ne reste que ce qui sert au raisonnement : par bloc son {@code id}, son {@code type} et, dans {@code data}, le
 * nom technique, le libellé, la technologie et les champs métier du contrat ({@code docs/schema-canvas.md}) ; par lien
 * son {@code id}, sa source, sa cible, son {@code kind} et son libellé ; enfin {@code schemaVersion} et {@code meta}.
 * Tout le reste part : les positions, les champs de présentation, et tout ce qui n'est pas au contrat.</p>
 *
 * <p>Le résultat n'est <strong>pas</strong> un instantané valide (le contrat exige une position par bloc) : c'est une
 * donnée d'entrée pour le modèle, jamais un canvas à enregistrer. {@link AiService} l'applique une seule fois, avant
 * l'appel, pour tous les fournisseurs.</p>
 */
public final class AiSnapshots {

    /** Les champs de {@code data} qui comptent pour le raisonnement : identité, technologie et champs métier du contrat. */
    private static final List<String> DATA_FIELDS = List.of(
            "name", "label", "tech",
            "engine", "entities", "endpoints", "pages", "method", "topics",
            "currency", "flow", "channel", "model", "templates", "description");

    private static final List<String> META_FIELDS = List.of("name", "description");
    private static final List<String> NODE_FIELDS = List.of("id", "type");
    private static final List<String> EDGE_FIELDS = List.of("id", "source", "target", "kind", "label");
    private static final List<String> ENTITY_FIELDS = List.of("name");
    private static final List<String> FIELD_FIELDS = List.of("name", "type", "required", "unique");
    private static final List<String> ENDPOINT_FIELDS = List.of("method", "path", "summary");
    private static final List<String> TEMPLATE_FIELDS = List.of("name", "text");

    private AiSnapshots() {
    }

    /**
     * L'instantané réduit à ce qui sert au raisonnement. {@code null} (le conseiller global n'a pas de canvas) et une
     * valeur qui n'est pas un objet ressortent telles quelles.
     */
    public static JsonNode prune(JsonNode snapshot) {
        if (snapshot == null || !snapshot.isObject()) {
            return snapshot;
        }
        ObjectNode pruned = JsonMapper.shared().createObjectNode();
        if (snapshot.has("schemaVersion")) {
            pruned.set("schemaVersion", snapshot.get("schemaVersion").deepCopy());
        }
        JsonNode meta = snapshot.get("meta");
        if (meta != null && meta.isObject()) {
            pruned.set("meta", keepOnly(meta, META_FIELDS));
        }

        ArrayNode nodes = pruned.putArray("nodes");
        for (JsonNode node : arrayOf(snapshot, "nodes")) {
            if (node.isObject()) {
                nodes.add(pruneNode(node));
            }
        }
        ArrayNode edges = pruned.putArray("edges");
        for (JsonNode edge : arrayOf(snapshot, "edges")) {
            if (edge.isObject()) {
                edges.add(keepOnly(edge, EDGE_FIELDS));
            }
        }
        return pruned;
    }

    private static ObjectNode pruneNode(JsonNode node) {
        ObjectNode kept = keepOnly(node, NODE_FIELDS);
        JsonNode data = node.get("data");
        if (data != null && data.isObject()) {
            kept.set("data", pruneData(data));
        }
        return kept;
    }

    private static ObjectNode pruneData(JsonNode data) {
        ObjectNode kept = JsonMapper.shared().createObjectNode();
        for (String field : DATA_FIELDS) {
            JsonNode value = data.get(field);
            if (value == null || value.isNull()) {
                continue;
            }
            switch (field) {
                case "entities" -> kept.set(field, pruneEntities(value));
                case "endpoints" -> kept.set(field, pruneObjects(value, ENDPOINT_FIELDS));
                case "templates" -> kept.set(field, pruneObjects(value, TEMPLATE_FIELDS));
                default -> kept.set(field, value.deepCopy());
            }
        }
        return kept;
    }

    /** Les entités d'une base, avec leurs champs : le modèle de données compte, pas sa présentation. */
    private static ArrayNode pruneEntities(JsonNode entities) {
        ArrayNode kept = JsonMapper.shared().createArrayNode();
        if (!entities.isArray()) {
            return kept;
        }
        for (JsonNode entity : entities) {
            if (!entity.isObject()) {
                continue;
            }
            ObjectNode keptEntity = keepOnly(entity, ENTITY_FIELDS);
            JsonNode fields = entity.get("fields");
            if (fields != null) {
                keptEntity.set("fields", pruneObjects(fields, FIELD_FIELDS));
            }
            kept.add(keptEntity);
        }
        return kept;
    }

    private static ArrayNode pruneObjects(JsonNode array, List<String> fields) {
        ArrayNode kept = JsonMapper.shared().createArrayNode();
        if (!array.isArray()) {
            return kept;
        }
        for (JsonNode item : array) {
            if (item.isObject()) {
                kept.add(keepOnly(item, fields));
            }
        }
        return kept;
    }

    private static ObjectNode keepOnly(JsonNode source, List<String> fields) {
        ObjectNode kept = JsonMapper.shared().createObjectNode();
        for (String field : fields) {
            JsonNode value = source.get(field);
            if (value != null && !value.isNull()) {
                kept.set(field, value.deepCopy());
            }
        }
        return kept;
    }

    private static Iterable<JsonNode> arrayOf(JsonNode snapshot, String field) {
        JsonNode array = snapshot.get(field);
        return array != null && array.isArray() ? array : List.of();
    }
}
