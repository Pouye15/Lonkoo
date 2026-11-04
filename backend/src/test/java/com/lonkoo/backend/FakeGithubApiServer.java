package com.lonkoo.backend;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Faux GitHub (API REST) pour les tests d'envoi de projet : compte et autorisations, création de dépôt, API Git
 * Data (commit, arbres, branche) avec un vrai état en mémoire, de quoi relire ce qui a été poussé. Les tests règlent
 * les pannes (jeton refusé, dépôt existant, débit limité, branche tardive, workflow refusé) et lisent les requêtes.
 */
final class FakeGithubApiServer {

    /** Une requête reçue, avec son en-tête d'autorisation et son corps JSON. */
    record Call(String method, String path, String authorization, JsonNode body) {
    }

    /** Une exécution de workflow simulée ; les tests changent {@code status} et {@code conclusion}. */
    static final class Run {
        final long id;
        final String repo;
        volatile String status = "queued";
        volatile String conclusion;
        final java.time.Instant createdAt = java.time.Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS);

        Run(long id, String repo) {
            this.id = id;
            this.repo = repo;
        }

        String json() {
            return "{\"id\":" + id + ",\"status\":\"" + status + "\",\"conclusion\":" + (conclusion == null ? "null" : "\"" + conclusion + "\"")
                    + ",\"html_url\":\"https://github.com/" + repo + "/actions/runs/" + id + "\",\"created_at\":\"" + createdAt
                    + "\",\"event\":\"workflow_dispatch\",\"head_branch\":\"main\"}";
        }
    }

    /** Un dépôt simulé : la branche par défaut pointe un commit, chaque commit un arbre, chaque arbre ses fichiers. */
    static final class Repo {
        final String fullName;
        final boolean isPrivate;
        String head;
        final Map<String, String> commitTrees = new ConcurrentHashMap<>();
        final Map<String, Map<String, String>> trees = new ConcurrentHashMap<>();
        int refMisses;

        Repo(String fullName, boolean isPrivate) {
            this.fullName = fullName;
            this.isPrivate = isPrivate;
        }

        Map<String, String> files() {
            return trees.get(commitTrees.get(head));
        }
    }

    private static final java.util.concurrent.atomic.AtomicLong RUN_IDS = new java.util.concurrent.atomic.AtomicLong(7_000_000_000L);
    private static final Pattern REPO = Pattern.compile("/repos/([^/]+/[^/]+)(/.*)?");
    private static final JsonMapper JSON = JsonMapper.shared();

    final HttpServer server;
    volatile String login = "octocat";
    volatile String token = "gho_jeton_de_test";
    /** Valeur de {@code X-OAuth-Scopes}, ou {@code null} pour ne pas l'envoyer (jeton sans autorisations annoncées). */
    volatile String scopes = "public_repo, read:user, workflow";
    /** Nombre de lectures de la branche qui répondent 404 juste après la création (auto_init pas encore visible). */
    volatile int refMissesAfterCreate = 0;
    /** Statut forcé pour la prochaine requête dont le chemin contient la clé (puis retiré). */
    final Map<String, Integer> failOnce = new ConcurrentHashMap<>();
    /** Corps de la réponse forcée ci-dessus, par chemin. */
    final Map<String, String> failBodies = new ConcurrentHashMap<>();
    /** Statut forcé à chaque requête dont le chemin contient la clé. */
    final Map<String, Integer> failAlways = new ConcurrentHashMap<>();
    final Set<String> existingNames = new HashSet<>();
    final Map<String, Repo> repos = new ConcurrentHashMap<>();
    final List<Call> calls = new CopyOnWriteArrayList<>();
    /** Quand vrai, un arbre contenant un fichier de workflow est refusé comme le fait GitHub sans l'autorisation. */
    volatile boolean enforceWorkflowScope = true;
    /** Quand vrai, la connexion est coupée sans réponse (GitHub injoignable ou en panne réseau). */
    volatile boolean dropConnections;
    /** Lancer un workflow demande l'autorisation « repo » (comme GitHub pour un jeton OAuth). */
    volatile boolean dispatchNeedsRepoScope = true;
    /** Le lancement répond 200 avec l'identifiant de l'exécution (sinon 204 sans rien). */
    volatile boolean dispatchReturnsRun;
    /** Nombre de listes d'exécutions qui répondent « aucune » avant de montrer l'exécution lancée (indexation tardive). */
    volatile int runsHiddenPolls;
    final List<Run> runs = new CopyOnWriteArrayList<>();

    private FakeGithubApiServer(HttpServer server) {
        this.server = server;
    }

    static FakeGithubApiServer start() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            FakeGithubApiServer fake = new FakeGithubApiServer(server);
            server.createContext("/", fake::handle);
            server.start();
            return fake;
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    void reset() {
        login = "octocat";
        token = "gho_jeton_de_test";
        scopes = "public_repo, read:user, workflow";
        refMissesAfterCreate = 0;
        failOnce.clear();
        failBodies.clear();
        failAlways.clear();
        existingNames.clear();
        repos.clear();
        calls.clear();
        enforceWorkflowScope = true;
        dropConnections = false;
        dispatchNeedsRepoScope = true;
        dispatchReturnsRun = false;
        runsHiddenPolls = 0;
        runs.clear();
    }

    /** Une autorisation précise de {@code X-OAuth-Scopes} (« public_repo » n'est pas « repo »). */
    private boolean hasScope(String scope) {
        String current = scopes;
        return current != null && java.util.Arrays.stream(current.split(",")).map(String::trim).anyMatch(scope::equals);
    }

    Run lastRun() {
        return runs.get(runs.size() - 1);
    }

    List<Call> callsTo(String method, String pathPart) {
        return calls.stream().filter(c -> c.method().equals(method) && c.path().contains(pathPart)).toList();
    }

    private void handle(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();
        String authorization = exchange.getRequestHeaders().getFirst("Authorization");
        String raw = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        JsonNode body = raw.isBlank() ? null : JSON.readTree(raw);
        calls.add(new Call(method, path, authorization, body));

        if (dropConnections) {
            exchange.close();
            return;
        }
        try {
            if (!("Bearer " + token).equals(authorization)) {
                respond(exchange, 401, "{\"message\":\"Bad credentials\"}");
                return;
            }
            for (Map.Entry<String, Integer> forced : failAlways.entrySet()) {
                if (path.contains(forced.getKey())) {
                    respond(exchange, forced.getValue(), failBodies.getOrDefault(forced.getKey(), "{\"message\":\"Erreur simulée\"}"));
                    return;
                }
            }
            for (Map.Entry<String, Integer> forced : failOnce.entrySet()) {
                if (path.contains(forced.getKey()) && failOnce.remove(forced.getKey(), forced.getValue())) {
                    respond(exchange, forced.getValue(), failBodies.getOrDefault(forced.getKey(), "{\"message\":\"Erreur simulée\"}"));
                    return;
                }
            }
            route(exchange, method, path, body);
        } catch (RuntimeException e) {
            respond(exchange, 500, "{\"message\":\"" + e.getClass().getSimpleName() + "\"}");
        }
    }

    private void route(HttpExchange exchange, String method, String path, JsonNode body) throws IOException {
        if (method.equals("GET") && path.equals("/user")) {
            if (scopes != null) {
                exchange.getResponseHeaders().add("X-OAuth-Scopes", scopes);
            }
            respond(exchange, 200, "{\"login\":\"" + login + "\",\"id\":1}");
        } else if (method.equals("POST") && path.equals("/user/repos")) {
            createRepo(exchange, body);
        } else {
            Matcher m = REPO.matcher(path);
            if (!m.matches() || !repos.containsKey(m.group(1))) {
                respond(exchange, 404, "{\"message\":\"Not Found\"}");
                return;
            }
            repoRoute(exchange, method, repos.get(m.group(1)), m.group(2) == null ? "" : m.group(2), body);
        }
    }

    private void createRepo(HttpExchange exchange, JsonNode body) throws IOException {
        String name = body.path("name").asText();
        String fullName = login + "/" + name;
        if (existingNames.contains(name) || repos.containsKey(fullName)) {
            respond(exchange, 422, "{\"message\":\"Repository creation failed.\",\"errors\":[{\"resource\":\"Repository\","
                    + "\"code\":\"custom\",\"field\":\"name\",\"message\":\"name already exists on this account\"}]}");
            return;
        }
        boolean isPrivate = body.path("private").asBoolean(false);
        Repo repo = new Repo(fullName, isPrivate);
        String tree = sha();
        repo.head = sha();
        repo.commitTrees.put(repo.head, tree);
        Map<String, String> files = new LinkedHashMap<>();
        if (body.path("auto_init").asBoolean(false)) {
            files.put("README.md", "# " + name + "\n");
        }
        repo.trees.put(tree, files);
        repo.refMisses = refMissesAfterCreate;
        repos.put(fullName, repo);
        respond(exchange, 201, repoJson(repo));
    }

    private void repoRoute(HttpExchange exchange, String method, Repo repo, String rest, JsonNode body) throws IOException {
        if (method.equals("GET") && rest.isEmpty()) {
            respond(exchange, 200, repoJson(repo));
        } else if (method.equals("GET") && rest.equals("/git/ref/heads/main")) {
            if (repo.refMisses > 0) {
                repo.refMisses--;
                respond(exchange, 404, "{\"message\":\"Not Found\"}");
            } else {
                respond(exchange, 200, "{\"ref\":\"refs/heads/main\",\"object\":{\"sha\":\"" + repo.head + "\",\"type\":\"commit\"}}");
            }
        } else if (method.equals("GET") && rest.startsWith("/git/commits/")) {
            String tree = repo.commitTrees.get(rest.substring("/git/commits/".length()));
            respond(exchange, tree == null ? 404 : 200, tree == null ? "{\"message\":\"Not Found\"}" : "{\"tree\":{\"sha\":\"" + tree + "\"}}");
        } else if (method.equals("POST") && rest.equals("/git/trees")) {
            createTree(exchange, repo, body);
        } else if (method.equals("POST") && rest.equals("/git/commits")) {
            String tree = body.path("tree").asText();
            String parent = body.path("parents").path(0).asText();
            if (!repo.trees.containsKey(tree) || !repo.commitTrees.containsKey(parent)) {
                respond(exchange, 422, "{\"message\":\"Invalid tree or parent\"}");
                return;
            }
            String commit = sha();
            repo.commitTrees.put(commit, tree);
            respond(exchange, 201, "{\"sha\":\"" + commit + "\"}");
        } else if (method.equals("POST") && rest.startsWith("/actions/workflows/") && rest.endsWith("/dispatches")) {
            dispatch(exchange, repo, rest.substring("/actions/workflows/".length(), rest.length() - "/dispatches".length()), body);
        } else if (method.equals("GET") && rest.startsWith("/actions/workflows/") && rest.endsWith("/runs")) {
            if (runsHiddenPolls > 0) {
                runsHiddenPolls--;
                respond(exchange, 200, "{\"total_count\":0,\"workflow_runs\":[]}");
                return;
            }
            StringBuilder list = new StringBuilder();
            for (int i = runs.size() - 1; i >= 0; i--) {
                list.append(list.length() == 0 ? "" : ",").append(runs.get(i).json());
            }
            respond(exchange, 200, "{\"total_count\":" + runs.size() + ",\"workflow_runs\":[" + list + "]}");
        } else if (method.equals("GET") && rest.startsWith("/actions/runs/")) {
            String id = rest.substring("/actions/runs/".length());
            Run run = runs.stream().filter(r -> String.valueOf(r.id).equals(id) && r.repo.equals(repo.fullName)).findFirst().orElse(null);
            respond(exchange, run == null ? 404 : 200, run == null ? "{\"message\":\"Not Found\"}" : run.json());
        } else if (method.equals("PATCH") && rest.equals("/git/refs/heads/main")) {
            String commit = body.path("sha").asText();
            if (!repo.commitTrees.containsKey(commit)) {
                respond(exchange, 422, "{\"message\":\"Object does not exist\"}");
                return;
            }
            repo.head = commit;
            respond(exchange, 200, "{\"ref\":\"refs/heads/main\",\"object\":{\"sha\":\"" + commit + "\"}}");
        } else {
            respond(exchange, 404, "{\"message\":\"Not Found\"}");
        }
    }

    private void dispatch(HttpExchange exchange, Repo repo, String workflowFile, JsonNode body) throws IOException {
        boolean exists = repo.files() != null && repo.files().containsKey(".github/workflows/" + workflowFile);
        if (!exists) {
            respond(exchange, 404, "{\"message\":\"Not Found\"}");
        } else if (dispatchNeedsRepoScope && scopes != null && !hasScope("repo")) {
            respond(exchange, 403, "{\"message\":\"Resource not accessible by personal access token\"}");
        } else if (!"main".equals(body.path("ref").asText())) {
            respond(exchange, 422, "{\"message\":\"No ref found for: " + body.path("ref").asText() + "\"}");
        } else {
            Run run = new Run(RUN_IDS.incrementAndGet(), repo.fullName);
            runs.add(run);
            if (dispatchReturnsRun) {
                respond(exchange, 200, "{\"workflow_run_id\":" + run.id + ",\"run_url\":\"https://api.github.com/x\",\"html_url\":\"https://github.com/" + repo.fullName + "/actions/runs/" + run.id + "\"}");
            } else {
                exchange.sendResponseHeaders(204, -1);
                exchange.close();
            }
        }
    }

    private void createTree(HttpExchange exchange, Repo repo, JsonNode body) throws IOException {
        Map<String, String> base = repo.trees.get(body.path("base_tree").asText());
        if (base == null) {
            respond(exchange, 422, "{\"message\":\"base_tree does not exist\"}");
            return;
        }
        Map<String, String> files = new LinkedHashMap<>(base);
        for (JsonNode entry : body.path("tree")) {
            String path = entry.path("path").asText();
            if (enforceWorkflowScope && path.startsWith(".github/workflows/") && (scopes == null || !hasScope("workflow"))) {
                respond(exchange, 404, "{\"message\":\"refusing to allow an OAuth App to create or update workflow `" + path
                        + "` without `workflow` scope\"}");
                return;
            }
            files.put(path, entry.path("content").asText());
        }
        String tree = sha();
        repo.trees.put(tree, files);
        respond(exchange, 201, "{\"sha\":\"" + tree + "\"}");
    }

    private static String repoJson(Repo repo) {
        return "{\"full_name\":\"" + repo.fullName + "\",\"html_url\":\"https://github.com/" + repo.fullName
                + "\",\"default_branch\":\"main\",\"private\":" + repo.isPrivate + "}";
    }

    private static String sha() {
        return (UUID.randomUUID().toString() + UUID.randomUUID()).replace("-", "").substring(0, 40);
    }

    private void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
