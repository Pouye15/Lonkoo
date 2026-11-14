package com.lonkoo.backend.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Lecture de ce qu'un fournisseur d'IA renvoie, partagée par {@link GeminiAiClient} (le modèle en direct) et
 * {@link AgentIaClient} (le microservice) : extraire le JSON d'un texte, en sortir le canvas, traduire la gravité et la
 * catégorie d'une remarque, et lire la liste des remarques.
 *
 * <p>Rien n'est journalisé du contenu : ni la saisie, ni la réponse du modèle. Une sortie inutilisable se signale par
 * {@code null}, à charge de l'appelant de lever {@link AiUnavailableException} : une panne du modèle ne doit jamais
 * passer pour « aucune remarque ».</p>
 */
public final class AiResponses {

    private static final Logger log = LoggerFactory.getLogger(AiResponses.class);

    private AiResponses() {
    }

    /**
     * Le JSON contenu dans la réponse du modèle, éventuellement entouré d'un bloc de code Markdown.
     * {@code null} si rien n'est analysable (c'est une panne, pas une réponse vide).
     */
    public static JsonNode extractJson(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        String clean = text.strip();
        if (clean.startsWith("```json")) {
            clean = clean.substring(7);
        } else if (clean.startsWith("```")) {
            clean = clean.substring(3);
        }
        if (clean.endsWith("```")) {
            clean = clean.substring(0, clean.length() - 3);
        }
        clean = clean.strip();
        try {
            return JsonMapper.shared().readTree(clean);
        } catch (RuntimeException e) {
            log.warn("Réponse de l'IA non analysable en JSON");
            return null;
        }
    }

    /**
     * Le canvas d'une réponse : soit la propriété {@code canvas}, soit l'objet lui-même s'il ressemble déjà à un
     * instantané. {@code null} s'il n'y en a pas.
     */
    public static JsonNode unwrapCanvas(JsonNode node) {
        if (node == null) {
            return null;
        }
        if (node.has("canvas") && node.get("canvas").isObject()) {
            return node.get("canvas");
        }
        if (node.has("schemaVersion") || node.has("nodes")) {
            return node;
        }
        return null;
    }

    /** Le résumé de la réponse, ou {@code defaultSummary} s'il est absent ou vide. */
    public static String unwrapSummary(JsonNode node, String defaultSummary) {
        if (node != null && node.has("summary") && !node.get("summary").asText("").isBlank()) {
            return node.get("summary").asText("");
        }
        return defaultSummary;
    }

    /**
     * Les remarques d'audit d'une réponse {@code {"findings": [...]}}.
     *
     * <p>{@code null} quand la réponse ne contient <strong>aucune liste</strong> {@code findings} exploitable : c'est
     * une panne du fournisseur, et non un audit sans remarque. Une liste présente mais vide rend bien une liste vide :
     * un canvas sans rien à signaler est une réponse légitime.</p>
     */
    public static List<AiFinding> findings(JsonNode response) {
        if (response == null) {
            return null;
        }
        JsonNode array = response.get("findings");
        if (array == null || !array.isArray()) {
            return null;
        }
        List<AiFinding> findings = new ArrayList<>();
        int index = 1;
        for (JsonNode item : array) {
            String id = item.path("id").asText("remarque_" + index++);
            String targetNodeId = item.path("targetNodeId").asText("");
            if (targetNodeId.isBlank()) {
                continue;
            }
            findings.add(new AiFinding(
                    id,
                    parseSeverity(item.path("severity").asText("RECOMMENDED")),
                    parseCategory(item.path("category").asText("STACK")),
                    item.path("title").asText("Remarque d'architecture"),
                    targetNodeId,
                    item.path("rationale").asText(""),
                    item.path("currentConfig").asText(""),
                    item.path("proposedConfig").asText("")));
        }
        return findings;
    }

    /** La gravité annoncée, ou {@code RECOMMENDED} si elle est inconnue. */
    public static AiFinding.Severity parseSeverity(String value) {
        try {
            return AiFinding.Severity.valueOf(value.toUpperCase(Locale.ROOT));
        } catch (RuntimeException e) {
            return AiFinding.Severity.RECOMMENDED;
        }
    }

    /** La catégorie annoncée, ou {@code STACK} si elle est inconnue. */
    public static AiFinding.Category parseCategory(String value) {
        try {
            return AiFinding.Category.valueOf(value.toUpperCase(Locale.ROOT));
        } catch (RuntimeException e) {
            return AiFinding.Category.STACK;
        }
    }
}
