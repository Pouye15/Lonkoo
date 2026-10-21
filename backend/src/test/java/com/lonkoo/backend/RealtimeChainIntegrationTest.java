package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import tools.jackson.databind.JsonNode;

/**
 * Test de chaîne : le backend Spring réel (PostgreSQL embarqué) face au serveur temps réel Node réel
 * et à des clients Hocuspocus réels qui écrivent selon {@code docs/schema-canvas.md}.
 *
 * <p>C'est le seul test qui traverse les deux processus ; il aurait détecté le client HTTP/2 refusé
 * par Node, le jeton de service absent, le chemin {@code /ws}, la disposition Yjs divergente et le
 * 500 au lieu de 422. Ignoré si {@code node} ou {@code realtime/node_modules} manquent
 * (en CI : {@code actions/setup-node} puis {@code npm ci} dans {@code realtime/}).</p>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RealtimeChainIntegrationTest extends AbstractPostgresIntegrationTest {

    private static final String SERVICE_TOKEN = "test-service-token";
    private static final String TICKET_SECRET = "test-ticket-secret-0123456789abcdef0123456789abcdef";
    private static final int NODE_PORT = freePort();
    private static final Path REALTIME_DIR = Path.of("..", "realtime").toAbsolutePath().normalize();
    private static final int SEED_NODES = 7;

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    private final HttpClient http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();
    private final List<Process> processes = new CopyOnWriteArrayList<>();
    private Process realtime;

    @DynamicPropertySource
    static void realtimeProperties(DynamicPropertyRegistry registry) {
        registry.add("realtime.internal-url", () -> "http://localhost:" + NODE_PORT);
    }

    @BeforeEach
    void startRealtime() throws Exception {
        assumeTrue(Files.isDirectory(REALTIME_DIR.resolve("node_modules/@hocuspocus")),
                "realtime/node_modules absent : lancer « npm ci » dans realtime/");
        assumeTrue(nodeIsAvailable(), "node est introuvable");
        launchRealtime();
    }

    @AfterEach
    void stopEverything() throws Exception {
        for (Process process : processes) {
            process.destroyForcibly();
        }
        stopRealtime();
    }

    // ------------------------------------------------------------------ Scénarios

    @Test
    void edit_snapshot_version_and_live_restore() throws Exception {
        Demo demo = newDemo();

        // Avant tout client : l'instantané est celui du modèle d'exemple (appel Spring -> Node).
        HttpResponse<String> first = demo.get("/api/canvases/" + demo.canvasId + "/snapshot");
        assertThat(first.statusCode()).isEqualTo(200);
        assertThat(nodesOf(first)).hasSize(SEED_NODES);

        // Un client qui suit le contrat ajoute un bloc : le backend le voit.
        assertThat(client(demo, "add-node", 800)).contains("SYNCED nodes=" + SEED_NODES, "DONE nodes=" + (SEED_NODES + 1));
        assertThat(nodesOf(demo.get("/api/canvases/" + demo.canvasId + "/snapshot"))).hasSize(SEED_NODES + 1);

        // Version nommée : 201, résumé sans instantané ; le détail porte l'instantané.
        HttpResponse<String> created = demo.post("/api/canvases/" + demo.canvasId + "/versions", "{\"name\":\"v1\",\"message\":\"avec un bloc\"}");
        assertThat(created.statusCode()).isEqualTo(201);
        JsonNode version = JSON.readTree(created.body());
        assertThat(version.has("snapshot")).isFalse();
        String versionId = version.get("id").asText();
        JsonNode detail = JSON.readTree(demo.get("/api/canvases/" + demo.canvasId + "/versions/" + versionId).body());
        assertThat(detail.get("snapshot").get("nodes")).hasSize(SEED_NODES + 1);

        // On efface tout, on enregistre une version vide (valide), puis on restaure v1 pendant qu'un
        // second client observe le canvas : il voit le changement sans se reconnecter.
        assertThat(client(demo, "wipe", 500)).contains("DONE nodes=0");
        assertThat(nodesOf(demo.get("/api/canvases/" + demo.canvasId + "/snapshot"))).isEmpty();
        assertThat(demo.post("/api/canvases/" + demo.canvasId + "/versions", "{\"name\":\"vide\"}").statusCode()).isEqualTo(201);

        try (Watcher watcher = watch(demo)) {
            watcher.awaitLine("SYNCED nodes=0");
            HttpResponse<String> restore = demo.post("/api/canvases/" + demo.canvasId + "/versions/" + versionId + "/restore", null);
            assertThat(restore.statusCode()).isEqualTo(204);
            watcher.awaitLine("UPDATE nodes=" + (SEED_NODES + 1));
        }
        assertThat(nodesOf(demo.get("/api/canvases/" + demo.canvasId + "/snapshot"))).hasSize(SEED_NODES + 1);
    }

    @Test
    void state_survives_a_realtime_restart() throws Exception {
        Demo demo = newDemo();
        assertThat(client(demo, "add-node", 500)).contains("DONE nodes=" + (SEED_NODES + 1));

        // Enregistrement en base (à la déconnexion du dernier client ou après le debounce).
        waitUntil(() -> jdbc.sql("select count(*) from canvas_states where canvas_id = ?")
                .param(UUID.fromString(demo.canvasId)).query(Integer.class).single() == 1, 10_000);

        stopRealtime();
        launchRealtime();

        List<String> ids = new ArrayList<>();
        nodesOf(demo.get("/api/canvases/" + demo.canvasId + "/snapshot")).forEach(node -> ids.add(node.get("id").asText()));
        assertThat(ids).hasSize(SEED_NODES + 1).contains("n-e2e");
    }

    @Test
    void a_read_only_member_cannot_modify_the_canvas() throws Exception {
        Demo owner = newDemo();
        Demo reader = owner.joinAs("READ");

        assertThat(client(reader, "add-node", 800)).contains("SYNCED nodes=" + SEED_NODES);
        assertThat(nodesOf(owner.get("/api/canvases/" + owner.canvasId + "/snapshot")))
                .as("la modification du lecteur est ignorée par le serveur").hasSize(SEED_NODES);

        // Témoin : le propriétaire, lui, peut écrire.
        client(owner, "add-node", 500);
        assertThat(nodesOf(owner.get("/api/canvases/" + owner.canvasId + "/snapshot"))).hasSize(SEED_NODES + 1);
    }

    @Test
    void an_invalid_snapshot_is_rejected_with_422() throws Exception {
        Demo demo = newDemo();
        client(demo, "add-bad-node", 500);

        HttpResponse<String> response = demo.post("/api/canvases/" + demo.canvasId + "/versions", "{\"name\":\"mauvaise\"}");

        assertThat(response.statusCode()).isEqualTo(422);
        assertThat(response.headers().firstValue("Content-Type").orElse("")).startsWith("application/problem+json");
        JsonNode problem = JSON.readTree(response.body());
        assertThat(problem.get("errors").get(0).asText()).contains("class");
        assertThat(JSON.readTree(demo.get("/api/canvases/" + demo.canvasId + "/versions").body())).isEmpty();
    }

    @Test
    void a_stopped_realtime_server_is_service_unavailable() throws Exception {
        Demo demo = newDemo();
        stopRealtime();

        HttpResponse<String> snapshot = demo.get("/api/canvases/" + demo.canvasId + "/snapshot");
        assertThat(snapshot.statusCode()).isEqualTo(503);
        assertThat(snapshot.headers().firstValue("Content-Type").orElse("")).startsWith("application/problem+json");
        assertThat(demo.post("/api/canvases/" + demo.canvasId + "/versions", "{\"name\":\"x\"}").statusCode()).isEqualTo(503);
    }

    @Test
    void internal_routes_of_the_realtime_server_require_the_service_token() throws Exception {
        Demo demo = newDemo();
        String url = "http://localhost:" + NODE_PORT + "/internal/canvases/" + demo.canvasId + "/snapshot";

        assertThat(rawGet(url, null).statusCode()).isEqualTo(401);
        assertThat(rawGet(url, "Bearer mauvais-jeton").statusCode()).isEqualTo(401);
        HttpResponse<String> ok = rawGet(url, "Bearer " + SERVICE_TOKEN);
        assertThat(ok.statusCode()).isEqualTo(200);
        assertThat(JSON.readTree(ok.body()).get("nodes")).hasSize(SEED_NODES);

        HttpResponse<String> anonymousRestore = http.send(HttpRequest.newBuilder(
                URI.create("http://localhost:" + NODE_PORT + "/internal/canvases/" + demo.canvasId + "/restore"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"nodes\":[],\"edges\":[]}")).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(anonymousRestore.statusCode()).isEqualTo(401);
        assertThat(nodesOf(demo.get("/api/canvases/" + demo.canvasId + "/snapshot"))).hasSize(SEED_NODES);
    }

    @Test
    void the_websocket_is_accepted_on_slash_and_on_ws() throws Exception {
        Demo demo = newDemo();
        String ticket = demo.ticket();
        for (String path : List.of("", "/ws")) {
            List<String> lines = run("ws://localhost:" + NODE_PORT + path, demo.canvasId, ticket, "none", 200);
            assertThat(lines).as("chemin « %s »", path).contains("SYNCED nodes=" + SEED_NODES);
        }
    }

    // ------------------------------------------------------------------ Un invité et son canvas de démonstration

    private final class Demo {
        final String cookie;
        final String projectId;
        final String canvasId;

        Demo(String cookie, String projectId, String canvasId) {
            this.cookie = cookie;
            this.projectId = projectId;
            this.canvasId = canvasId;
        }

        HttpResponse<String> get(String path) throws Exception {
            return call("GET", path, cookie, null);
        }

        HttpResponse<String> post(String path, String body) throws Exception {
            return call("POST", path, cookie, body);
        }

        String ticket() throws Exception {
            HttpResponse<String> response = post("/api/canvases/" + canvasId + "/realtime-ticket", null);
            assertThat(response.statusCode()).isEqualTo(200);
            return JSON.readTree(response.body()).get("ticket").asText();
        }

        /** Un second invité rejoint ce canvas par lien de partage avec le rôle demandé. */
        Demo joinAs(String role) throws Exception {
            HttpResponse<String> link = post("/api/canvases/" + canvasId + "/share-links", "{\"role\":\"" + role + "\",\"ttlHours\":1}");
            assertThat(link.statusCode()).isEqualTo(201);
            String url = JSON.readTree(link.body()).get("url").asText();
            HttpResponse<String> joined = call("POST", "/api/join/" + url.substring(url.lastIndexOf('/') + 1), null, null);
            assertThat(joined.statusCode()).isEqualTo(200);
            String joinedCookie = joined.headers().firstValue("Set-Cookie").orElseThrow().split(";")[0];
            return new Demo(joinedCookie, projectId, canvasId);
        }
    }

    private Demo newDemo() throws Exception {
        HttpResponse<String> guest = call("POST", "/api/auth/guest", null, null);
        assertThat(guest.statusCode()).isEqualTo(201);
        String cookie = guest.headers().firstValue("Set-Cookie").orElseThrow().split(";")[0];
        String projectId = JSON.readTree(call("GET", "/api/projects", cookie, null).body()).get(0).get("id").asText();
        String canvasId = JSON.readTree(call("GET", "/api/projects/" + projectId + "/canvases", cookie, null).body())
                .get(0).get("id").asText();
        return new Demo(cookie, projectId, canvasId);
    }

    private HttpResponse<String> call(String method, String path, String cookie, String body) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        if (body != null) {
            builder.header("Content-Type", "application/json");
        }
        if (cookie != null) {
            builder.header("Cookie", cookie);
        }
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> rawGet(String url, String authorization) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url)).GET();
        if (authorization != null) {
            builder.header("Authorization", authorization);
        }
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode nodesOf(HttpResponse<String> snapshotResponse) throws Exception {
        assertThat(snapshotResponse.statusCode()).as(snapshotResponse.body()).isEqualTo(200);
        JsonNode nodes = JSON.readTree(snapshotResponse.body()).get("nodes");
        assertThat(nodes.isArray()).as("« nodes » doit être un tableau").isTrue();
        return nodes;
    }

    // ------------------------------------------------------------------ Processus Node

    private static int freePort() {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static boolean nodeIsAvailable() {
        try {
            Process process = new ProcessBuilder("node", "--version").redirectErrorStream(true).start();
            process.getInputStream().readAllBytes();
            return process.waitFor(10, TimeUnit.SECONDS) && process.exitValue() == 0;
        } catch (IOException | InterruptedException e) {
            return false;
        }
    }

    private void launchRealtime() throws Exception {
        ProcessBuilder builder = new ProcessBuilder("node", "src/index.js")
                .directory(REALTIME_DIR.toFile())
                .redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.appendTo(new File("target/realtime-chain.log")));
        builder.environment().put("REALTIME_PORT", String.valueOf(NODE_PORT));
        builder.environment().put("BACKEND_INTERNAL_URL", "http://localhost:" + port);
        builder.environment().put("REALTIME_SERVICE_TOKEN", SERVICE_TOKEN);
        builder.environment().put("REALTIME_TICKET_SECRET", TICKET_SECRET);
        builder.environment().put("REALTIME_STORE_DEBOUNCE_MS", "100");
        realtime = builder.start();
        waitUntil(() -> {
            try (Socket ignored = new Socket("localhost", NODE_PORT)) {
                return true;
            } catch (IOException e) {
                return false;
            }
        }, 10_000);
    }

    private void stopRealtime() throws InterruptedException {
        if (realtime != null) {
            realtime.destroyForcibly();
            realtime.waitFor(5, TimeUnit.SECONDS);
            realtime = null;
        }
    }

    /** Lance le client de test (écrit selon le contrat) et rend ses lignes de sortie. */
    private List<String> client(Demo demo, String action, int holdMillis) throws Exception {
        return run("ws://localhost:" + NODE_PORT, demo.canvasId, demo.ticket(), action, holdMillis);
    }

    private List<String> run(String wsUrl, String canvasId, String ticket, String action, int holdMillis) throws Exception {
        Process process = clientProcess(wsUrl, canvasId, ticket, action, holdMillis);
        List<String> lines = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                lines.add(line);
            }
        }
        assertThat(process.waitFor(20, TimeUnit.SECONDS)).as("le client de test doit se terminer").isTrue();
        return lines;
    }

    private Process clientProcess(String wsUrl, String canvasId, String ticket, String action, int holdMillis) throws IOException {
        Process process = new ProcessBuilder("node", "scripts/chain-client.mjs", wsUrl, canvasId, ticket, action, String.valueOf(holdMillis))
                .directory(REALTIME_DIR.toFile())
                .redirectErrorStream(true)
                .start();
        processes.add(process);
        return process;
    }

    private Watcher watch(Demo demo) throws Exception {
        return new Watcher(clientProcess("ws://localhost:" + NODE_PORT, demo.canvasId, demo.ticket(), "watch", 6000));
    }

    /** Client qui observe le canvas et garde ses lignes de sortie. */
    private static final class Watcher implements AutoCloseable {
        private final Process process;
        private final List<String> lines = new CopyOnWriteArrayList<>();

        Watcher(Process process) {
            this.process = process;
            Thread reader = new Thread(() -> {
                try (BufferedReader in = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = in.readLine()) != null) {
                        lines.add(line);
                    }
                } catch (IOException ignored) {
                    // processus arrêté
                }
            }, "watcher-output");
            reader.setDaemon(true);
            reader.start();
        }

        void awaitLine(String expected) throws Exception {
            waitUntil(() -> lines.contains(expected), 8_000, () -> "ligne attendue « " + expected + " », reçu : " + lines);
        }

        @Override
        public void close() {
            process.destroyForcibly();
        }
    }

    private static void waitUntil(BooleanSupplier condition, long timeoutMillis) throws Exception {
        waitUntil(condition, timeoutMillis, () -> "condition non atteinte en " + timeoutMillis + " ms");
    }

    private static void waitUntil(BooleanSupplier condition, long timeoutMillis, java.util.function.Supplier<String> message)
            throws Exception {
        long deadline = System.currentTimeMillis() + timeoutMillis;
        while (System.currentTimeMillis() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            Thread.sleep(50);
        }
        throw new AssertionError(message.get());
    }
}
