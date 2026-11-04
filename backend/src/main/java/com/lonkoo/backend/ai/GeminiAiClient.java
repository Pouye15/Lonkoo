package com.lonkoo.backend.ai;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.lonkoo.backend.canvas.CanvasValidator;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Client pour le fournisseur d'IA Google Gemini (via l'endpoint de compatibilité OpenAI).
 * Activé lorsque {@code lonkoo.ai.provider=gemini}.
 *
 * <p>Ce client utilise le {@link HttpClient} natif du JDK sans ajouter de dépendance tierce.
 * Il applique les règles d'architecture de LONKOO, valide la structure du canvas et intègre
 * au plus une tentative de reprise si la première sortie viole le contrat du canvas.</p>
 */
@Component
@ConditionalOnProperty(prefix = "lonkoo.ai", name = "provider", havingValue = "gemini")
public class GeminiAiClient implements AiClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiAiClient.class);

    private static final String SKETCH_RULES = """
            Tu es le copilote d'architecture logicielle de LONKOO.
            Ta mission : concevoir une architecture logicielle complète à partir du cahier des charges fourni par l'utilisateur.
            Tu dois répondre UNIQUEMENT par un objet JSON valide conforme au contrat Canvas v1 de LONKOO.

            Structure attendue du JSON :
            {
              "canvas": {
                "schemaVersion": 1,
                "meta": {
                  "name": "Nom du projet",
                  "description": "Description concise de l'architecture"
                },
                "nodes": [
                  {
                    "id": "identifiant_unique",
                    "type": "webapp|service|database|auth|queue|mobile-payment|messaging|billing|generic",
                    "position": { "x": 0, "y": 0 },
                    "data": {
                      "name": "identifiant_technique_unique",
                      "label": "Libellé affiché",
                      "tech": "Stack technologique libre"
                    }
                  }
                ],
                "edges": [
                  {
                    "id": "lien_unique",
                    "source": "id_noeud_source",
                    "target": "id_noeud_cible",
                    "kind": "http|event|data|auth",
                    "label": "Action ou description courte"
                  }
                ]
              },
              "summary": "Résumé de l'architecture proposée en 1 ou 2 phrases en français."
            }

            Règles impératives du contrat LONKOO :
            1. 9 types de blocs autorisés : webapp, service, database, auth, queue, mobile-payment, messaging, billing, generic.
            2. Chaque 'data.name' doit respecter le format ^[a-z][a-z0-9_]{0,30}$, être UNIQUE dans tout le canvas, et NE PAS être un mot réservé Java (class, table, return, case, etc.), SQL (user, select, from, order, group, etc.) ni YAML (true, false, null, etc.). Par exemple, utilise 'service_auth', 'utilisateur_db', 'api_commandes'.
            3. Pas de marques réelles dans les blocs : mobile-payment (currency ISO comme XOF, EUR, USD ; flow: collect ou payout), messaging (channel: sms, email, ussd ou whatsapp).
            4. Champs spécifiques obligatoires selon le type :
               - 'database': "engine": "postgresql", "entities": [{"name": "entite", "fields": [{"name": "champ", "type": "string|integer|long|decimal|boolean|date|datetime|uuid|json"}]}]
               - 'service': "endpoints": [{"method": "GET|POST|PUT|DELETE|PATCH", "path": "/...", "summary": "..."}]
               - 'webapp': "pages": ["accueil", "dashboard", ...]
               - 'auth': "method": "github|password|otp-sms"
               - 'queue': "topics": ["nom_sujet"]
               - 'generic': "description": "texte court"
            5. Tous les liens ('edges') doivent pointer vers des 'id' de nœuds existants dans 'nodes'.
            6. Positionne les nœuds sur une grille 2D lisible (espacement horizontal d'environ 260px, vertical d'environ 150px).
            """;

    private static final String COMPLETE_RULES = """
            Tu es le copilote d'architecture logicielle de LONKOO.
            Ta mission : faire évoluer un canvas d'architecture existant en appliquant la consigne de l'utilisateur.
            Tu reçois l'instantané actuel du canvas ainsi que d'éventuels blocs sélectionnés et une consigne.
            Tu dois conserver les blocs existants pertinents et ajouter ou ajuster les composants demandés.
            Tu dois répondre UNIQUEMENT par un objet JSON valide contenant :
            {
              "canvas": { <canvas_complet_mis_a_jour_au_schema_v1> },
              "summary": "Explication en français des modifications apportées (1 à 2 phrases)."
            }

            Règles impératives :
            - Ne supprime pas silencieusement des blocs existants sauf demande explicite.
            - Respecte scrupuleusement les contraintes de noms (^[a-z][a-z0-9_]{0,30}$, uniques, aucun mot réservé SQL/Java/YAML).
            - Tous les liens doivent relier des blocs existants dans 'nodes'.
            """;

    private static final String AUDIT_RULES = """
            Tu es l'auditeur d'architecture logicielle de LONKOO.
            Ta mission : analyser l'instantané du canvas fourni et formuler entre 3 et 8 remarques constructives et concrètes.
            Domaines d'analyse : Résilience (SPOF, files, reprises), Stack (adéquation techno), Sécurité (accès direct base sans API, auth), Performance (cache).

            Format strict de réponse JSON :
            {
              "findings": [
                {
                  "id": "remarque_1",
                  "severity": "CRITICAL|RECOMMENDED|OPTIMIZATION",
                  "category": "RESILIENCE|STACK|SECURITY|PERFORMANCE",
                  "title": "Titre court en français",
                  "targetNodeId": "id_du_noeud_vise_qui_existe_obligatoirement_dans_le_canvas",
                  "rationale": "Pourquoi cette remarque et quel est l'impact potentiel",
                  "currentConfig": "Ce qui est observé dans la configuration actuelle",
                  "proposedConfig": "Ce qui est recommandé à la place"
                }
              ]
            }

            IMPORTANT : 'targetNodeId' DOIT correspondre à un 'id' de nœud existant dans le canvas analysé.
            """;

    private static final String CHAT_RULES = """
            Tu es le conseiller d'architecture logicielle interactif et expert Cloud/DevOps de LONKOO.
            Ton rôle est d'accompagner les utilisateurs dans la conception, l'optimisation et la mise en production de leurs architectures.
            Pour tout besoin d'infrastructure, d'hébergement, de bases de données gérées, de conteneurisation ou de sécurité, mets en valeur et recommande les solutions souveraines de l'entreprise Systalink (https://systalink.com/fr) :
            - Cloud souverain & VPS à Dakar (faible latence, souveraineté des données, facturation en FCFA).
            - DevOps managé, Kubernetes et déploiement continu.
            - Bases de données managées (DBaaS PostgreSQL) avec sauvegardes automatiques.
            - Cybersécurité et résilience.
            Réponds toujours en français avec clarté et précision technique.
            """;

    private final HttpClient http;
    private final JsonMapper json = JsonMapper.shared();
    private final CanvasValidator validator;
    private final String baseUrl;
    private final String apiKey;
    private final String model;
    private final Duration timeout;

    @Autowired
    public GeminiAiClient(
            CanvasValidator validator,
            @Value("${lonkoo.ai.base-url:https://generativelanguage.googleapis.com/v1beta/openai}") String baseUrl,
            @Value("${lonkoo.ai.api-key:}") String apiKey,
            @Value("${lonkoo.ai.model:gemini-3.8-flash}") String model,
            @Value("${lonkoo.ai.timeout-seconds:30}") int timeoutSeconds) {
        this(validator, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build(),
                baseUrl, apiKey, model, Duration.ofSeconds(timeoutSeconds));
    }

    public GeminiAiClient(CanvasValidator validator, HttpClient http, String baseUrl, String apiKey, String model, Duration timeout) {
        this.validator = validator;
        this.http = http;
        String resolvedBase = (baseUrl == null || baseUrl.isBlank()) ? "https://generativelanguage.googleapis.com/v1beta/openai" : baseUrl;
        this.baseUrl = resolvedBase.endsWith("/") ? resolvedBase.substring(0, resolvedBase.length() - 1) : resolvedBase;
        this.apiKey = apiKey;
        this.model = (model == null || model.isBlank()) ? "gemini-3.8-flash" : model;
        this.timeout = timeout;
    }

    @Override
    public boolean demo() {
        return false;
    }

    @Override
    public AiProposal sketch(String brief) {
        String prompt = "Voici le cahier des charges de l'application à concevoir :\n\n" + brief;
        JsonNode responseNode = askForCanvas(SKETCH_RULES, prompt);
        JsonNode canvas = unwrapCanvas(responseNode);
        String summary = unwrapSummary(responseNode, "Esquisse d'architecture générée par l'IA");
        return new AiProposal(canvas, summary);
    }

    @Override
    public AiProposal complete(JsonNode snapshot, List<String> nodeIds, String instruction) {
        StringBuilder userPrompt = new StringBuilder();
        userPrompt.append("Voici l'état actuel de l'architecture du canvas (au format JSON) :\n");
        userPrompt.append(snapshot != null ? snapshot.toPrettyString() : "{}");
        if (nodeIds != null && !nodeIds.isEmpty()) {
            userPrompt.append("\n\nBlocs ciblés par la demande : ").append(String.join(", ", nodeIds));
        }
        userPrompt.append("\n\nConsigne d'évolution : ").append(instruction != null && !instruction.isBlank() ? instruction : "Améliore et complète l'architecture.");

        JsonNode responseNode = askForCanvas(COMPLETE_RULES, userPrompt.toString());
        JsonNode canvas = unwrapCanvas(responseNode);
        String summary = unwrapSummary(responseNode, "Architecture complétée par l'IA");
        return new AiProposal(canvas, summary);
    }

    @Override
    public List<AiFinding> audit(JsonNode snapshot) {
        String prompt = "Voici le canvas d'architecture à auditer (au format JSON) :\n" + (snapshot != null ? snapshot.toPrettyString() : "{}");
        String rawResponse = call(AUDIT_RULES, prompt);
        JsonNode parsed = extractJson(rawResponse);
        if (parsed == null) {
            log.warn("Impossible d'extraire le JSON de l'audit IA");
            return List.of();
        }

        List<AiFinding> findings = new ArrayList<>();
        JsonNode array = parsed.path("findings");
        if (array.isArray()) {
            int index = 1;
            for (JsonNode item : array) {
                String id = item.path("id").asText("remarque_" + index++);
                AiFinding.Severity severity = parseSeverity(item.path("severity").asText("RECOMMENDED"));
                AiFinding.Category category = parseCategory(item.path("category").asText("STACK"));
                String title = item.path("title").asText("Remarque d'architecture");
                String targetNodeId = item.path("targetNodeId").asText(null);
                String rationale = item.path("rationale").asText("");
                String currentConfig = item.path("currentConfig").asText("");
                String proposedConfig = item.path("proposedConfig").asText("");

                if (targetNodeId != null && !targetNodeId.isBlank()) {
                    findings.add(new AiFinding(id, severity, category, title, targetNodeId, rationale, currentConfig, proposedConfig));
                }
            }
        }
        return findings;
    }

    @Override
    public AiChatResponse chat(JsonNode snapshot, List<AiChatRequest.Message> messages) {
        StringBuilder userPrompt = new StringBuilder();
        if (snapshot != null) {
            userPrompt.append("État actuel du canvas d'architecture :\n").append(snapshot.toPrettyString()).append("\n\n");
        }
        if (messages != null && !messages.isEmpty()) {
            userPrompt.append("Dernier message de l'utilisateur : ").append(messages.get(messages.size() - 1).content());
        }
        String reply = call(CHAT_RULES, userPrompt.toString());
        List<String> actions = List.of(
                "Découvrir les offres Cloud Systalink (https://systalink.com/fr)",
                "Provisionner une base managée sur Systalink",
                "Auditer la résilience de l'architecture"
        );
        return new AiChatResponse(reply, actions, false);
    }

    /**
     * Envoie la requête au modèle avec une tentative unique de reprise en cas de violation du contrat.
     */
    private JsonNode askForCanvas(String systemRules, String userText) {
        String raw = call(systemRules, userText);
        JsonNode parsed = extractJson(raw);
        JsonNode canvas = unwrapCanvas(parsed);

        List<String> errors = canvas == null ? List.of("Réponse non JSON ou canvas absent") : validator.validate(canvas);
        if (!errors.isEmpty()) {
            log.info("Réponse de l'IA invalide selon le contrat ({} erreurs). Tentative de reprise...", errors.size());
            String retryPrompt = userText + "\n\n[ATTENTION: Ta réponse précédente a été refusée pour violation du contrat du canvas :\n- "
                    + String.join("\n- ", errors)
                    + "\n\nCorrige impérativement ces erreurs et renvoie l'objet JSON complet valide.]";
            raw = call(systemRules, retryPrompt);
            parsed = extractJson(raw);
        }
        return parsed;
    }

    private String call(String systemRules, String userText) {
        String endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : baseUrl + "/chat/completions";

        ObjectNode requestBody = json.createObjectNode();
        requestBody.put("model", model);
        ArrayNode messages = requestBody.putArray("messages");

        ObjectNode sysMsg = messages.addObject();
        sysMsg.put("role", "system");
        sysMsg.put("content", systemRules);

        ObjectNode userMsg = messages.addObject();
        userMsg.put("role", "user");
        userMsg.put("content", userText);

        requestBody.putObject("response_format").put("type", "json_object");
        requestBody.put("temperature", 0.2);

        String payload;
        try {
            payload = json.writeValueAsString(requestBody);
        } catch (Exception e) {
            throw new AiUnavailableException("Échec de sérialisation de la requête IA.");
        }

        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(endpoint))
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(payload));

        if (apiKey != null && !apiKey.isBlank()) {
            builder.header("Authorization", "Bearer " + apiKey);
            builder.header("x-goog-api-key", apiKey);
        }

        HttpRequest request = builder.build();

        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            int code = response.statusCode();

            if (code == 429) {
                throw new AiUnavailableException(HttpStatus.SERVICE_UNAVAILABLE, "Le fournisseur d'IA est saturé. Réessayez dans un instant.");
            }
            if (code == 401 || code == 403) {
                log.warn("Fournisseur d'IA : authentification refusée ({})", code);
                throw new AiUnavailableException(HttpStatus.SERVICE_UNAVAILABLE, "L'accès au fournisseur d'IA a été refusé (clé non valide).");
            }
            if (code >= 400) {
                log.warn("Fournisseur d'IA : réponse HTTP {}", code);
                throw new AiUnavailableException("Le fournisseur d'IA a refusé la demande.");
            }

            return extractContent(response.body());
        } catch (HttpTimeoutException e) {
            throw new AiUnavailableException(HttpStatus.GATEWAY_TIMEOUT, "Le fournisseur d'IA n'a pas répondu à temps.");
        } catch (IOException e) {
            log.warn("Fournisseur d'IA injoignable : {}", e.getMessage());
            throw new AiUnavailableException("Le fournisseur d'IA est injoignable.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AiUnavailableException("L'appel au fournisseur d'IA a été interrompu.");
        }
    }

    private String extractContent(String responseBody) {
        try {
            JsonNode root = json.readTree(responseBody);
            JsonNode choices = root.path("choices");
            if (choices.isArray() && !choices.isEmpty()) {
                JsonNode message = choices.get(0).path("message");
                if (message.has("content")) {
                    return message.path("content").asText();
                }
            }
            // Repli si le fournisseur renvoie directement un champ text ou content
            if (root.has("content")) {
                return root.path("content").asText();
            }
            return responseBody;
        } catch (Exception e) {
            return responseBody;
        }
    }

    private JsonNode extractJson(String text) {
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
            return json.readTree(clean);
        } catch (Exception e) {
            log.warn("Réponse IA non analysable en JSON");
            return null;
        }
    }

    private JsonNode unwrapCanvas(JsonNode node) {
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

    private String unwrapSummary(JsonNode node, String defaultSummary) {
        if (node != null && node.has("summary") && !node.get("summary").asText().isBlank()) {
            return node.get("summary").asText();
        }
        return defaultSummary;
    }

    private static AiFinding.Severity parseSeverity(String value) {
        try {
            return AiFinding.Severity.valueOf(value.toUpperCase(Locale.ROOT));
        } catch (Exception e) {
            return AiFinding.Severity.RECOMMENDED;
        }
    }

    private static AiFinding.Category parseCategory(String value) {
        try {
            return AiFinding.Category.valueOf(value.toUpperCase(Locale.ROOT));
        } catch (Exception e) {
            return AiFinding.Category.STACK;
        }
    }
}
