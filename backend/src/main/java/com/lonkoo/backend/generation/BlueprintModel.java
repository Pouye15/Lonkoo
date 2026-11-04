package com.lonkoo.backend.generation;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import tools.jackson.databind.JsonNode;

/**
 * Le canvas tel que le générateur le lit : blocs, liens, tables et endpoints. Construit à partir d'un instantané
 * <strong>déjà validé</strong> (schéma et règles du contrat) : les identifiants y respectent
 * {@code ^[a-z][a-z0-9_]{0,30}$}, ne sont pas des mots réservés et sont uniques.
 */
final class BlueprintModel {

    record Block(String id, String type, String name, String label, String tech, JsonNode data) {
        /** Titre lisible (texte libre : à échapper selon la destination). */
        String title() {
            return label != null && !label.isBlank() ? label : name;
        }
    }

    record Link(String id, String source, String target, String kind, String label) {
    }

    record Field(String name, String type, boolean required, boolean unique) {
    }

    record Entity(String database, String name, List<Field> fields) {
    }

    record Endpoint(String method, String path, String summary) {
    }

    /** Nom du projet : texte libre, à échapper. */
    final String displayName;
    /** Identifiant du projet : minuscules, chiffres et tirets (noms de dossiers, d'images et de services). */
    final String slug;
    /** Paquet Java de la racine du code généré. */
    final String packageName;
    final List<Block> blocks;
    final List<Link> links;
    final JsonNode snapshot;

    private BlueprintModel(String displayName, String slug, String packageName, List<Block> blocks, List<Link> links, JsonNode snapshot) {
        this.displayName = displayName;
        this.slug = slug;
        this.packageName = packageName;
        this.blocks = blocks;
        this.links = links;
        this.snapshot = snapshot;
    }

    static BlueprintModel of(JsonNode snapshot, String projectName) {
        String display = Texts.plain(projectName, 80);
        if (display.isEmpty()) {
            display = Texts.plain(snapshot.path("meta").path("name").asText(""), 80);
        }
        if (display.isEmpty()) {
            display = "Projet LONKOO";
        }
        String slug = slugOf(display);

        List<Block> blocks = new ArrayList<>();
        for (JsonNode node : snapshot.path("nodes")) {
            JsonNode data = node.path("data");
            blocks.add(new Block(
                    node.path("id").asText(),
                    node.path("type").asText(),
                    data.path("name").asText(),
                    textOrNull(data, "label"),
                    textOrNull(data, "tech"),
                    data));
        }
        List<Link> links = new ArrayList<>();
        for (JsonNode edge : snapshot.path("edges")) {
            links.add(new Link(
                    edge.path("id").asText(),
                    edge.path("source").asText(),
                    edge.path("target").asText(),
                    edge.path("kind").asText("http"),
                    textOrNull(edge, "label")));
        }
        return new BlueprintModel(display, slug, packageOf(slug), List.copyOf(blocks), List.copyOf(links), snapshot);
    }

    private static String textOrNull(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isTextual() ? value.asText() : null;
    }

    /** « Marketplace mobile ! » devient {@code marketplace-mobile} ; 40 caractères au plus, jamais vide. */
    static String slugOf(String text) {
        String slug = java.text.Normalizer.normalize(text, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        if (slug.length() > 40) {
            slug = slug.substring(0, 40).replaceAll("-+$", "");
        }
        return slug.isEmpty() ? "projet" : slug;
    }

    /** Paquet Java : {@code com.example.<slug sans tirets>}, jamais un mot-clé ni un début de chiffre. */
    private static String packageOf(String slug) {
        String segment = slug.replace("-", "");
        if (segment.isEmpty() || Character.isDigit(segment.charAt(0)) || Naming.isJavaKeyword(segment)) {
            segment = "app" + segment;
        }
        return "com.example." + segment;
    }

    List<Block> ofType(String type) {
        return blocks.stream().filter(block -> block.type().equals(type)).toList();
    }

    /** Les tables de toutes les bases de données du canvas. */
    List<Entity> entities() {
        List<Entity> entities = new ArrayList<>();
        for (Block database : ofType("database")) {
            for (JsonNode entity : database.data().path("entities")) {
                List<Field> fields = new ArrayList<>();
                for (JsonNode field : entity.path("fields")) {
                    fields.add(new Field(
                            field.path("name").asText(),
                            field.path("type").asText(),
                            field.path("required").asBoolean(false),
                            field.path("unique").asBoolean(false)));
                }
                entities.add(new Entity(database.name(), entity.path("name").asText(), List.copyOf(fields)));
            }
        }
        return entities;
    }

    List<Endpoint> endpoints(Block service) {
        List<Endpoint> endpoints = new ArrayList<>();
        for (JsonNode endpoint : service.data().path("endpoints")) {
            endpoints.add(new Endpoint(
                    endpoint.path("method").asText(),
                    endpoint.path("path").asText(),
                    textOrNull(endpoint, "summary")));
        }
        return endpoints;
    }

    List<String> list(Block block, String field) {
        List<String> values = new ArrayList<>();
        for (JsonNode item : block.data().path(field)) {
            values.add(item.asText());
        }
        return values;
    }

    Block block(String id) {
        return blocks.stream().filter(block -> block.id().equals(id)).findFirst().orElse(null);
    }
}
