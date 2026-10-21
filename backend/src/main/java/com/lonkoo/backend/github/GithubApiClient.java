package com.lonkoo.backend.github;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;

import com.lonkoo.backend.model.GithubUser;
import com.lonkoo.backend.web.GithubAuthException;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Client des deux appels du flux OAuth GitHub :
 * <ol>
 *   <li>échange du code contre un jeton d'accès ({@code POST …/login/oauth/access_token}) ;</li>
 *   <li>lecture du profil ({@code GET /user}).</li>
 * </ol>
 * Les deux adresses sont configurables : GitHub en production, un faux serveur local en test. Aucun
 * code, jeton ni secret n'est journalisé ni repris dans un message d'erreur.
 *
 * <p>Erreurs : 400 quand le code est invalide ou expiré, 502 quand GitHub répond une erreur ou un
 * contenu inutilisable, 503 s'il est injoignable, 504 s'il met trop de temps.</p>
 */
public class GithubApiClient {

    private static final Logger log = LoggerFactory.getLogger(GithubApiClient.class);

    private final JsonMapper jsonMapper = JsonMapper.shared();
    // HTTP/1.1 explicite : le client par défaut tente HTTP/2 en clair (Upgrade: h2c), que des serveurs refusent.
    private final HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;
    private final String tokenEndpoint;
    private final String userEndpoint;
    private final Duration timeout;

    public GithubApiClient(String clientId, String clientSecret, String redirectUri,
            String tokenEndpoint, String userEndpoint, Duration timeout) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.tokenEndpoint = tokenEndpoint;
        this.userEndpoint = userEndpoint;
        this.timeout = timeout;
    }

    /** Échange le code OAuth contre un jeton d'accès. */
    public String exchangeCode(String code) {
        String body;
        try {
            var payload = jsonMapper.createObjectNode();
            payload.put("client_id", clientId);
            payload.put("client_secret", clientSecret);
            payload.put("code", code);
            payload.put("redirect_uri", redirectUri);
            body = jsonMapper.writeValueAsString(payload);
        } catch (JacksonException e) {
            throw new IllegalStateException("Impossible de construire la demande de jeton", e);
        }

        HttpRequest request = HttpRequest.newBuilder(URI.create(tokenEndpoint))
                .timeout(timeout)
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> response = send(request);
        if (response.statusCode() != 200) {
            log.warn("GitHub : échange du code, réponse {}", response.statusCode());
            throw new GithubAuthException(HttpStatus.BAD_GATEWAY, "GitHub a répondu une erreur à l'échange du code");
        }

        JsonNode json = readJson(response.body(), "l'échange du code");
        // GitHub répond 200 avec un champ « error » quand le code est refusé.
        String error = json.path("error").asText(null);
        if (error != null) {
            log.warn("GitHub : échange du code refusé ({})", error);
            if ("bad_verification_code".equals(error)) {
                throw new GithubAuthException(HttpStatus.BAD_REQUEST,
                        "Le code de connexion GitHub est invalide ou expiré");
            }
            // incorrect_client_credentials, redirect_uri_mismatch… : problème de configuration, pas de l'utilisateur.
            throw new GithubAuthException(HttpStatus.BAD_GATEWAY,
                    "GitHub a refusé la demande (application OAuth à vérifier)");
        }
        String accessToken = json.path("access_token").asText(null);
        if (accessToken == null || accessToken.isBlank()) {
            log.warn("GitHub : réponse sans jeton d'accès");
            throw new GithubAuthException(HttpStatus.BAD_GATEWAY, "GitHub n'a pas fourni de jeton d'accès");
        }
        return accessToken;
    }

    /** Lit le profil GitHub de l'utilisateur avec le jeton fourni. */
    public GithubUser fetchUser(String accessToken) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(userEndpoint))
                .timeout(timeout)
                .header("Accept", "application/vnd.github+json")
                .header("Authorization", "Bearer " + accessToken)
                .GET()
                .build();

        HttpResponse<String> response = send(request);
        if (response.statusCode() != 200) {
            log.warn("GitHub : lecture du profil, réponse {}", response.statusCode());
            throw new GithubAuthException(HttpStatus.BAD_GATEWAY, "GitHub n'a pas pu fournir le profil");
        }

        JsonNode json = readJson(response.body(), "la lecture du profil");
        long id = json.path("id").asLong(0);
        String login = json.path("login").asText(null);
        if (id == 0 || login == null || login.isBlank()) {
            throw new GithubAuthException(HttpStatus.BAD_GATEWAY, "GitHub a renvoyé un profil illisible");
        }
        return new GithubUser(id, login, textOrNull(json, "name"), textOrNull(json, "avatar_url"));
    }

    private static String textOrNull(JsonNode json, String field) {
        JsonNode node = json.path(field);
        return node.isMissingNode() || node.isNull() ? null : node.asText();
    }

    private HttpResponse<String> send(HttpRequest request) {
        try {
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (HttpConnectTimeoutException e) {
            log.warn("GitHub : connexion impossible (délai dépassé)");
            throw new GithubAuthException(HttpStatus.SERVICE_UNAVAILABLE, "GitHub est injoignable");
        } catch (HttpTimeoutException e) {
            log.warn("GitHub : pas de réponse à temps");
            throw new GithubAuthException(HttpStatus.GATEWAY_TIMEOUT, "GitHub n'a pas répondu à temps");
        } catch (IOException e) {
            // Cause racine dans le journal seulement (ex. SSLHandshakeException : certificat non reconnu par Java),
            // jamais dans la réponse. Ces messages ne contiennent ni code, ni jeton, ni secret.
            Throwable root = e;
            while (root.getCause() != null) {
                root = root.getCause();
            }
            log.warn("GitHub : échec de la requête : {} ({})", e.getClass().getSimpleName(), root);
            throw new GithubAuthException(HttpStatus.SERVICE_UNAVAILABLE, "GitHub est injoignable");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new GithubAuthException(HttpStatus.SERVICE_UNAVAILABLE, "Appel à GitHub interrompu");
        }
    }

    private JsonNode readJson(String body, String action) {
        try {
            return jsonMapper.readTree(body);
        } catch (JacksonException e) {
            log.warn("GitHub : réponse illisible pour {}", action);
            throw new GithubAuthException(HttpStatus.BAD_GATEWAY, "GitHub a renvoyé une réponse illisible");
        }
    }
}
