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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Client HTTP pour le microservice Python {@code agent_ia}.
 * Activé lorsque {@code lonkoo.ai.provider=agent_ia}.
 */
@Component
@ConditionalOnProperty(prefix = "lonkoo.ai", name = "provider", havingValue = "agent_ia")
public class AgentIaClient implements AiClient {

    private static final Logger log = LoggerFactory.getLogger(AgentIaClient.class);

    private final HttpClient http;
    private final JsonMapper json = JsonMapper.shared();
    private final String baseUrl;
    private final String serviceToken;
    private final Duration timeout;

    @Autowired
    public AgentIaClient(
            @Value("${lonkoo.ai.agent-url:http://agent_ia:8000}") String baseUrl,
            @Value("${lonkoo.ai.service-token:}") String serviceToken,
            @Value("${lonkoo.ai.timeout-seconds:30}") int timeoutSeconds) {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build(),
                baseUrl, serviceToken, Duration.ofSeconds(timeoutSeconds));
    }

    public AgentIaClient(HttpClient http, String baseUrl, String serviceToken, Duration timeout) {
        this.http = http;
        String resolved = (baseUrl == null || baseUrl.isBlank()) ? "http://agent_ia:8000" : baseUrl;
        this.baseUrl = resolved.endsWith("/") ? resolved.substring(0, resolved.length() - 1) : resolved;
        this.serviceToken = serviceToken;
        this.timeout = timeout;
        if (serviceToken == null || serviceToken.isBlank()) {
            log.warn("AI_SERVICE_TOKEN est vide : l'agent IA refusera les appels (le jeton du temps réel n'est jamais réutilisé).");
        }
    }

    @Override
    public boolean demo() {
        return false;
    }

    @Override
    public AiProposal sketch(String brief) {
        ObjectNode req = json.createObjectNode();
        req.put("brief", brief);

        JsonNode res = post("/sketch", req);
        return new AiProposal(res.path("canvas"), res.path("summary").asText("Esquisse générée"));
    }

    @Override
    public AiProposal complete(JsonNode snapshot, List<String> nodeIds, String instruction) {
        ObjectNode req = json.createObjectNode();
        req.set("snapshot", snapshot != null ? snapshot : json.createObjectNode());
        ArrayNode arr = req.putArray("nodeIds");
        if (nodeIds != null) {
            nodeIds.forEach(arr::add);
        }
        req.put("instruction", instruction != null ? instruction : "");

        JsonNode res = post("/complete", req);
        return new AiProposal(res.path("canvas"), res.path("summary").asText("Complétion générée"));
    }

    @Override
    public List<AiFinding> audit(JsonNode snapshot) {
        ObjectNode req = json.createObjectNode();
        req.set("snapshot", snapshot != null ? snapshot : json.createObjectNode());

        JsonNode res = post("/audit", req);
        List<AiFinding> findings = new ArrayList<>();
        JsonNode array = res.path("findings");
        if (array.isArray()) {
            int index = 1;
            for (JsonNode item : array) {
                AiFindingParser.parse(item, index++).ifPresent(findings::add);
            }
        }
        return findings;
    }

    @Override
    public AiChatResponse chat(JsonNode snapshot, List<AiChatRequest.Message> messages) {
        ObjectNode req = json.createObjectNode();
        if (snapshot != null) {
            req.set("snapshot", snapshot);
        }
        ArrayNode msgs = req.putArray("messages");
        if (messages != null) {
            for (AiChatRequest.Message m : messages) {
                ObjectNode node = msgs.addObject();
                node.put("role", m.role());
                node.put("content", m.content());
            }
        }

        JsonNode res = post("/chat", req);
        String reply = res.path("reply").asText("Je suis à votre écoute.");
        List<String> actions = new ArrayList<>();
        JsonNode acts = res.path("suggestedActions");
        if (acts.isArray()) {
            for (JsonNode a : acts) {
                actions.add(a.asText());
            }
        }
        return new AiChatResponse(reply, actions, false);
    }

    @Override
    public void chatStream(JsonNode snapshot, List<AiChatRequest.Message> messages, java.io.OutputStream out) throws IOException {
        ObjectNode req = json.createObjectNode();
        if (snapshot != null) {
            req.set("snapshot", snapshot);
        }
        ArrayNode msgs = req.putArray("messages");
        if (messages != null) {
            for (AiChatRequest.Message m : messages) {
                ObjectNode node = msgs.addObject();
                node.put("role", m.role());
                node.put("content", m.content());
            }
        }

        String payload;
        try {
            payload = json.writeValueAsString(req);
        } catch (Exception e) {
            throw new AiUnavailableException("Échec de sérialisation de la requête.");
        }

        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(baseUrl + "/chat/stream"))
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .header("Accept", "text/event-stream")
                .POST(HttpRequest.BodyPublishers.ofString(payload));

        if (serviceToken != null && !serviceToken.isBlank()) {
            builder.header("X-Service-Token", serviceToken);
        }

        try {
            HttpResponse<java.io.InputStream> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() != 200) {
                log.error("Erreur agent_ia /chat/stream HTTP {}", response.statusCode());
                out.write("data: {\"error\": \"Le service IA est temporairement indisponible.\"}\n\n"
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8));
                out.flush();
                return;
            }
            try (java.io.InputStream in = response.body()) {
                byte[] buffer = new byte[1024];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                    out.flush();
                }
            }
        } catch (HttpTimeoutException e) {
            throw new AiUnavailableException(HttpStatus.GATEWAY_TIMEOUT, "Le service IA n'a pas répondu à temps.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Flux interrompu", e);
        }
    }

    private JsonNode post(String path, ObjectNode body) {
        String payload;
        try {
            payload = json.writeValueAsString(body);
        } catch (Exception e) {
            throw new AiUnavailableException("Échec de sérialisation de la requête.");
        }

        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(payload));

        if (serviceToken != null && !serviceToken.isBlank()) {
            builder.header("X-Service-Token", serviceToken);
        }

        try {
            HttpResponse<String> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            int code = response.statusCode();
            if (code == 429) {
                throw new AiUnavailableException(HttpStatus.SERVICE_UNAVAILABLE, "Service IA temporairement surchargé.");
            }
            if (code == 403 || code == 401) {
                log.error("Service agent_ia : authentification refusée ({})", code);
                throw new AiUnavailableException(HttpStatus.INTERNAL_SERVER_ERROR, "Erreur de configuration interne du service IA.");
            }
            if (code >= 400) {
                log.warn("Service agent_ia : code d'erreur HTTP {}", code);
                throw new AiUnavailableException("Le service IA a rejeté la requête.");
            }
            return json.readTree(response.body());
        } catch (HttpTimeoutException e) {
            throw new AiUnavailableException(HttpStatus.GATEWAY_TIMEOUT, "Le service IA n'a pas répondu à temps.");
        } catch (IOException e) {
            log.warn("Service agent_ia injoignable : {}", e.getMessage());
            throw new AiUnavailableException("Le service IA est temporairement injoignable.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AiUnavailableException("L'appel IA a été interrompu.");
        }
    }
}
