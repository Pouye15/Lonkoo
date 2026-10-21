package com.lonkoo.backend.github;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lonkoo.backend.github.GithubPushException.Kind;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Client de l'API REST de GitHub pour l'envoi d'un projet généré : lecture du compte et des autorisations, création
 * du dépôt, puis un seul commit poussé par l'API Git Data (arbres, commit, référence) avec le jeton de l'utilisateur.
 *
 * <p>Le jeton est un paramètre de chaque appel : il n'est ni conservé, ni journalisé, ni repris dans une erreur. Les
 * messages des {@link GithubPushException} sont en français et sans contenu brut de GitHub. L'adresse de l'API est
 * configurable ({@code github.api.base-url}) : GitHub en production, un faux serveur en test.</p>
 */
public class GithubRepoClient {

    private static final Logger log = LoggerFactory.getLogger(GithubRepoClient.class);
    private static final String API_VERSION = "2022-11-28";
    private static final Pattern FULL_NAME = Pattern.compile("[A-Za-z0-9._-]{1,100}/[A-Za-z0-9._-]{1,100}");
    private static final Pattern BRANCH = Pattern.compile("[A-Za-z0-9._/-]{1,100}");
    private static final Pattern SHA = Pattern.compile("[0-9a-f]{40}");
    private static final int TREE_BATCH_ENTRIES = 100;
    private static final int TREE_BATCH_BYTES = 4 * 1024 * 1024;
    private static final int REF_ATTEMPTS = 6;

    /** Le compte du jeton et ses autorisations ; {@code scopes} est vide quand GitHub n'en annonce pas. */
    public record Account(String login, Set<String> scopes, boolean scopesKnown) {
        public boolean has(String scope) {
            return scopes.contains(scope);
        }
    }

    /** Un dépôt GitHub : nom complet {@code compte/nom}, adresse de la page et branche par défaut. */
    public record Repo(String fullName, String htmlUrl, String defaultBranch) {
    }

    private record Response(int status, String body, java.net.http.HttpHeaders headers) {
        JsonNode json(JsonMapper mapper) {
            try {
                return mapper.readTree(body);
            } catch (JacksonException e) {
                throw new GithubPushException(Kind.OTHER, "GitHub a renvoyé une réponse illisible.");
            }
        }
    }

    private final JsonMapper json = JsonMapper.shared();
    // HTTP/1.1 explicite : le client par défaut tente HTTP/2 en clair (Upgrade: h2c), que des serveurs refusent.
    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final String baseUrl;
    private final Duration timeout;
    private final Duration retryDelay;

    public GithubRepoClient(String baseUrl, Duration timeout, Duration retryDelay) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.timeout = timeout;
        this.retryDelay = retryDelay;
    }

    /** Le compte du jeton : son identifiant et les autorisations accordées (en-tête {@code X-OAuth-Scopes}). */
    public Account account(String token) {
        Response response = send("GET", "/user", token, null);
        require(response, 200, "la lecture du compte");
        String login = response.json(json).path("login").asText(null);
        if (login == null || login.isBlank()) {
            throw new GithubPushException(Kind.OTHER, "GitHub a renvoyé un compte illisible.");
        }
        Optional<String> header = response.headers().firstValue("X-OAuth-Scopes");
        Set<String> scopes = new LinkedHashSet<>();
        header.ifPresent(value -> Arrays.stream(value.split(",")).map(String::trim).filter(s -> !s.isEmpty()).forEach(scopes::add));
        return new Account(login, scopes, header.isPresent());
    }

    /** Crée le dépôt avec un premier commit (README vide) : l'API Git Data refuse un dépôt sans aucun commit. */
    public Repo createRepository(String token, String name, String description, boolean isPrivate) {
        ObjectNode body = json.createObjectNode();
        body.put("name", name);
        body.put("description", description);
        body.put("private", isPrivate);
        body.put("auto_init", true);
        Response response = send("POST", "/user/repos", token, body);
        if (response.status() == 422 && response.body().contains("already exists")) {
            throw new GithubPushException(Kind.NAME_TAKEN, "Un dépôt nommé « " + name + " » existe déjà sur votre compte GitHub.");
        }
        require(response, 201, "la création du dépôt");
        return repoOf(response.json(json));
    }

    /** Un dépôt existant, par son nom complet. */
    public Repo findRepository(String token, String fullName) {
        checkFullName(fullName);
        Response response = send("GET", "/repos/" + fullName, token, null);
        require(response, 200, "la lecture du dépôt");
        return repoOf(response.json(json));
    }

    /**
     * Pousse les fichiers dans un seul commit sur la branche par défaut du dépôt et rend l'empreinte du commit.
     * Les arbres sont envoyés par lots (100 fichiers, 4 Mio) à partir de l'arbre courant de la branche.
     */
    public String push(String token, Repo repo, Map<String, String> files, String message) {
        String base = "/repos/" + repo.fullName() + "/git";
        String head = headOf(token, base, repo.defaultBranch());
        String tree = text(exchange("GET", base + "/commits/" + head, token, null, 200, "la lecture du commit initial").path("tree"), "sha");

        List<Map.Entry<String, String>> pending = new ArrayList<>(files.entrySet());
        int from = 0;
        while (from < pending.size()) {
            ArrayNode entries = json.createArrayNode();
            int bytes = 0;
            int to = from;
            while (to < pending.size() && entries.size() < TREE_BATCH_ENTRIES
                    && (entries.isEmpty() || bytes + sizeOf(pending.get(to).getValue()) <= TREE_BATCH_BYTES)) {
                Map.Entry<String, String> file = pending.get(to++);
                ObjectNode entry = entries.addObject();
                entry.put("path", file.getKey());
                entry.put("mode", "100644");
                entry.put("type", "blob");
                entry.put("content", file.getValue());
                bytes += sizeOf(file.getValue());
            }
            ObjectNode body = json.createObjectNode();
            body.put("base_tree", tree);
            body.set("tree", entries);
            tree = text(exchange("POST", base + "/trees", token, body, 201, "l'envoi des fichiers"), "sha");
            from = to;
        }

        ObjectNode commit = json.createObjectNode();
        commit.put("message", message);
        commit.put("tree", tree);
        commit.putArray("parents").add(head);
        String sha = text(exchange("POST", base + "/commits", token, commit, 201, "la création du commit"), "sha");

        ObjectNode ref = json.createObjectNode();
        ref.put("sha", sha);
        ref.put("force", false);
        exchange("PATCH", base + "/refs/heads/" + repo.defaultBranch(), token, ref, 200, "la mise à jour de la branche");
        return sha;
    }

    // ------------------------------------------------------------------ Interne

    /** L'empreinte du commit en tête de branche. Juste après la création, la branche peut tarder à apparaître. */
    private String headOf(String token, String base, String branch) {
        for (int attempt = 1; ; attempt++) {
            Response response = send("GET", base + "/ref/heads/" + branch, token, null);
            if (response.status() == 200) {
                String sha = text(response.json(json).path("object"), "sha");
                if (!SHA.matcher(sha).matches()) {
                    throw new GithubPushException(Kind.OTHER, "GitHub a renvoyé une empreinte de commit illisible.");
                }
                return sha;
            }
            boolean notYet = response.status() == 404 || response.status() == 409;
            if (notYet && attempt == REF_ATTEMPTS) {
                throw new GithubPushException(Kind.UNAVAILABLE,
                        "La branche du nouveau dépôt n'est pas encore disponible sur GitHub : réessayez dans un instant.");
            }
            if (!notYet) {
                require(response, 200, "la lecture de la branche");
            }
            pause();
        }
    }

    private void pause() {
        try {
            Thread.sleep(retryDelay.toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new GithubPushException(Kind.UNAVAILABLE, "L'envoi a été interrompu.");
        }
    }

    private Repo repoOf(JsonNode node) {
        String fullName = node.path("full_name").asText("");
        String url = node.path("html_url").asText("");
        String branch = node.path("default_branch").asText("main");
        checkFullName(fullName);
        if (!BRANCH.matcher(branch).matches() || branch.contains("..")) {
            throw new GithubPushException(Kind.OTHER, "GitHub a renvoyé un nom de branche illisible.");
        }
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            throw new GithubPushException(Kind.OTHER, "GitHub a renvoyé une adresse de dépôt illisible.");
        }
        return new Repo(fullName, url, branch);
    }

    private static void checkFullName(String fullName) {
        if (!FULL_NAME.matcher(fullName).matches() || fullName.contains("..")) {
            throw new GithubPushException(Kind.OTHER, "GitHub a renvoyé un nom de dépôt illisible.");
        }
    }

    private static int sizeOf(String content) {
        return content.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
    }

    private static String text(JsonNode node, String field) {
        String value = node.path(field).asText(null);
        if (value == null || value.isBlank()) {
            throw new GithubPushException(Kind.OTHER, "GitHub a renvoyé une réponse incomplète.");
        }
        return value;
    }

    private JsonNode exchange(String method, String path, String token, ObjectNode body, int expected, String action) {
        Response response = send(method, path, token, body);
        require(response, expected, action);
        return response.json(json);
    }

    /** Laisse passer le statut attendu, traduit tout le reste en {@link GithubPushException}. */
    private void require(Response response, int expected, String action) {
        if (response.status() == expected) {
            return;
        }
        int status = response.status();
        log.warn("GitHub : {}, réponse {}", action, status);
        String lower = response.body().toLowerCase(java.util.Locale.ROOT);
        if (status == 401) {
            throw new GithubPushException(Kind.TOKEN_REJECTED, "GitHub ne reconnaît plus votre connexion : reconnectez-vous avec GitHub.");
        }
        if ((status == 403 || status == 429) && (lower.contains("rate limit") || "0".equals(header(response, "x-ratelimit-remaining"))
                || response.headers().firstValue("Retry-After").isPresent())) {
            throw new GithubPushException(Kind.RATE_LIMITED, "GitHub limite le nombre de requêtes : réessayez dans quelques minutes.");
        }
        if ((status == 403 || status == 404 || status == 422) && lower.contains("workflow")) {
            throw new GithubPushException(Kind.WORKFLOW_SCOPE,
                    "GitHub refuse les fichiers de workflow sans l'autorisation « workflow ».");
        }
        if (status == 403 || status == 404) {
            throw new GithubPushException(Kind.NOT_ALLOWED,
                    "GitHub refuse " + action + " avec votre autorisation actuelle (code " + status + ").");
        }
        if (status >= 500) {
            throw new GithubPushException(Kind.UNAVAILABLE, "GitHub rencontre un incident (code " + status + ") : réessayez dans un instant.");
        }
        throw new GithubPushException(Kind.OTHER, "GitHub a refusé " + action + " (code " + status + ").");
    }

    private static String header(Response response, String name) {
        return response.headers().firstValue(name).orElse(null);
    }

    private Response send(String method, String path, String token, ObjectNode body) {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .timeout(timeout)
                .header("Accept", "application/vnd.github+json")
                .header("X-GitHub-Api-Version", API_VERSION)
                .header("User-Agent", "lonkoo-backend")
                .header("Authorization", "Bearer " + token);
        if (body == null) {
            request.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            request.header("Content-Type", "application/json")
                    .method(method, HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        }
        try {
            HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
            return new Response(response.statusCode(), response.body() == null ? "" : response.body(), response.headers());
        } catch (HttpConnectTimeoutException e) {
            log.warn("GitHub : connexion impossible (délai dépassé)");
            throw new GithubPushException(Kind.UNAVAILABLE, "GitHub est injoignable.");
        } catch (HttpTimeoutException e) {
            log.warn("GitHub : pas de réponse à temps");
            throw new GithubPushException(Kind.UNAVAILABLE, "GitHub n'a pas répondu à temps.");
        } catch (IOException e) {
            Throwable root = e;
            while (root.getCause() != null) {
                root = root.getCause();
            }
            log.warn("GitHub : échec de la requête : {} ({})", e.getClass().getSimpleName(), root.getClass().getSimpleName());
            throw new GithubPushException(Kind.UNAVAILABLE, "GitHub est injoignable.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new GithubPushException(Kind.UNAVAILABLE, "L'envoi a été interrompu.");
        }
    }
}
