package com.lonkoo.backend.realtime;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Client backend &rarr; serveur temps réel (routes HTTP internes § 7.2) : instantané JSON courant
 * et restauration. Chaque appel présente le jeton de service ({@code REALTIME_SERVICE_TOKEN}).
 *
 * <p>Le client force HTTP/1.1 : par défaut, {@link HttpClient} tente une montée en HTTP/2 en clair
 * ({@code Upgrade: h2c}) que le serveur Node n'accepte pas.</p>
 */
@Component
public class RealtimeSnapshotClient {

    private static final Logger log = LoggerFactory.getLogger(RealtimeSnapshotClient.class);

    private final JsonMapper jsonMapper = JsonMapper.shared();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final String baseUrl;
    private final String authorization;
    private final Duration requestTimeout;

    @Autowired
    public RealtimeSnapshotClient(
            @Value("${realtime.internal-url}") String baseUrl,
            @Value("${realtime.service-token}") String serviceToken,
            @Value("${realtime.request-timeout-seconds:10}") int requestTimeoutSeconds) {
        this(baseUrl, serviceToken, Duration.ofSeconds(requestTimeoutSeconds));
    }

    public RealtimeSnapshotClient(String baseUrl, String serviceToken, Duration requestTimeout) {
        if (serviceToken == null || serviceToken.isBlank()) {
            throw new IllegalStateException("realtime.service-token (REALTIME_SERVICE_TOKEN) ne doit pas être vide");
        }
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.authorization = "Bearer " + serviceToken;
        this.requestTimeout = requestTimeout;
    }

    /** Retourne l'instantané JSON courant du canvas. */
    public JsonNode snapshot(UUID canvasId) {
        HttpRequest request = request(canvasId, "snapshot").GET().build();
        HttpResponse<String> response = send(request, "lecture de l'instantané");
        if (response.statusCode() != 200) {
            throw unexpectedStatus(response.statusCode(), "lecture de l'instantané");
        }
        try {
            return jsonMapper.readTree(response.body());
        } catch (JacksonException e) {
            log.warn("Temps réel : instantané illisible pour le canvas {}", canvasId);
            throw new RealtimeUnavailableException(HttpStatus.BAD_GATEWAY,
                    "Le serveur temps réel a renvoyé un instantané illisible");
        }
    }

    /** Remplace le contenu courant par l'instantané fourni. */
    public void restore(UUID canvasId, JsonNode snapshot) {
        String body;
        try {
            body = jsonMapper.writeValueAsString(snapshot);
        } catch (JacksonException e) {
            throw new IllegalStateException("Impossible de sérialiser l'instantané", e);
        }
        HttpRequest request = request(canvasId, "restore")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> response = send(request, "restauration");
        if (response.statusCode() != 204) {
            throw unexpectedStatus(response.statusCode(), "restauration");
        }
    }

    /** Demande au serveur temps réel de fermer les connexions ouvertes sur ce canvas (droits retirés, projet supprimé). */
    public void closeConnections(UUID canvasId) {
        HttpRequest request = request(canvasId, "close").POST(HttpRequest.BodyPublishers.noBody()).build();
        HttpResponse<String> response = send(request, "fermeture des connexions");
        if (response.statusCode() != 204) {
            throw unexpectedStatus(response.statusCode(), "fermeture des connexions");
        }
    }

    private HttpRequest.Builder request(UUID canvasId, String action) {
        return HttpRequest.newBuilder(URI.create(baseUrl + "/internal/canvases/" + canvasId + "/" + action))
                .timeout(requestTimeout)
                .header("Authorization", authorization);
    }

    private HttpResponse<String> send(HttpRequest request, String action) {
        try {
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (HttpConnectTimeoutException e) {
            log.warn("Temps réel : connexion impossible ({})", action);
            throw new RealtimeUnavailableException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Le serveur temps réel est injoignable");
        } catch (HttpTimeoutException e) {
            log.warn("Temps réel : pas de réponse à temps ({})", action);
            throw new RealtimeUnavailableException(HttpStatus.GATEWAY_TIMEOUT,
                    "Le serveur temps réel n'a pas répondu à temps");
        } catch (IOException e) {
            log.warn("Temps réel : échec de la requête ({}) : {}", action, e.toString());
            throw new RealtimeUnavailableException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Le serveur temps réel est injoignable");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RealtimeUnavailableException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Appel au serveur temps réel interrompu");
        }
    }

    private RealtimeUnavailableException unexpectedStatus(int status, String action) {
        log.warn("Temps réel : réponse {} inattendue ({})", status, action);
        String detail = status == 401
                ? "Le serveur temps réel a refusé le jeton de service (configuration à vérifier)"
                : "Le serveur temps réel a répondu " + status;
        return new RealtimeUnavailableException(HttpStatus.BAD_GATEWAY, detail);
    }
}
