package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;


/**
 * Versions nommées, instantané et restauration, face à un faux serveur temps réel : jeton de
 * service présenté, 422 avec le détail des erreurs, 502 quand le temps réel échoue, rôles.
 * (La même chaîne avec le vrai serveur Node est dans {@code RealtimeChainIntegrationTest}.)
 */
class VersionsApiIntegrationTest extends AbstractPostgresIntegrationTest {

    private static final String SERVICE_TOKEN = "test-service-token";
    private static final FakeRealtime REALTIME = FakeRealtime.start();

    @DynamicPropertySource
    static void realtimeProperties(DynamicPropertyRegistry registry) {
        registry.add("realtime.internal-url", () -> "http://127.0.0.1:" + REALTIME.port());
    }

    @AfterAll
    static void stopRealtime() {
        REALTIME.server.stop(0);
    }

    @BeforeEach
    void resetRealtime() throws IOException {
        REALTIME.reset(seedJson());
    }

    // ------------------------------------------------------------------ Versions

    @Test
    void createListAndReadAVersion() throws Exception {
        Canvas canvas = newCanvas();

        mockMvc.perform(post("/api/canvases/" + canvas.id + "/versions").session(canvas.session)
                .contentType("application/json").content("{\"name\":\"v1\",\"message\":\"premier jalon\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("v1"))
                .andExpect(jsonPath("$.message").value("premier jalon"))
                .andExpect(jsonPath("$.schemaVersion").value(1))
                .andExpect(jsonPath("$.snapshot").doesNotExist());

        String listJson = mockMvc.perform(get("/api/canvases/" + canvas.id + "/versions").session(canvas.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andReturn().getResponse().getContentAsString();
        String versionId = JSON.readTree(listJson).get(0).get("id").asText();

        mockMvc.perform(get("/api/canvases/" + canvas.id + "/versions/" + versionId).session(canvas.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canvasId").value(canvas.id))
                .andExpect(jsonPath("$.snapshot.nodes.length()").value(7))
                .andExpect(jsonPath("$.snapshot.schemaVersion").value(1));

        assertThat(REALTIME.authorizations).allMatch(("Bearer " + SERVICE_TOKEN)::equals);
    }

    @Test
    void anInvalidSnapshotIsRejectedWith422AndTheListOfErrors() throws Exception {
        Canvas canvas = newCanvas();
        // Un bloc dont le nom est un mot réservé (« class ») : refusé par la validation métier.
        REALTIME.snapshot = """
                {"schemaVersion":1,"nodes":[{"id":"n1","type":"service","position":{"x":0,"y":0},"data":{"name":"class"}}],"edges":[]}
                """;

        mockMvc.perform(post("/api/canvases/" + canvas.id + "/versions").session(canvas.session)
                .contentType("application/json").content("{\"name\":\"mauvaise\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.status").value(422))
                .andExpect(jsonPath("$.title").value("Instantané invalide"))
                .andExpect(jsonPath("$.errors.length()").value(1))
                .andExpect(jsonPath("$.errors[0]").value(containsString("class")));

        mockMvc.perform(get("/api/canvases/" + canvas.id + "/versions").session(canvas.session))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void restoreSendsTheStoredSnapshotToTheRealtimeServer() throws Exception {
        Canvas canvas = newCanvas();
        String versionId = createVersion(canvas, "v1");
        REALTIME.snapshot = "{\"schemaVersion\":1,\"nodes\":[],\"edges\":[]}";

        mockMvc.perform(post("/api/canvases/" + canvas.id + "/versions/" + versionId + "/restore").session(canvas.session))
                .andExpect(status().isNoContent());

        assertThat(REALTIME.restoreBodies).hasSize(1);
        assertThat(JSON.readTree(REALTIME.restoreBodies.get(0))).isEqualTo(JSON.readTree(seedJson()));
    }

    @Test
    void theSnapshotRouteReturnsTheLiveSnapshot() throws Exception {
        Canvas canvas = newCanvas();
        REALTIME.snapshot = "{\"schemaVersion\":1,\"nodes\":[],\"edges\":[],\"meta\":{\"name\":\"en direct\"}}";

        mockMvc.perform(get("/api/canvases/" + canvas.id + "/snapshot").session(canvas.session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.meta.name").value("en direct"));
    }

    // ------------------------------------------------------------------ Pannes du temps réel

    @Test
    void aRealtimeErrorIsBadGatewayAsProblemJson() throws Exception {
        Canvas canvas = newCanvas();
        String versionId = createVersion(canvas, "v1");
        REALTIME.snapshotStatus = 500;
        REALTIME.restoreStatus = 500;

        mockMvc.perform(post("/api/canvases/" + canvas.id + "/versions").session(canvas.session)
                .contentType("application/json").content("{\"name\":\"v2\"}"))
                .andExpect(status().isBadGateway())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.detail").value(containsString("500")));
        mockMvc.perform(get("/api/canvases/" + canvas.id + "/snapshot").session(canvas.session))
                .andExpect(status().isBadGateway());
        mockMvc.perform(post("/api/canvases/" + canvas.id + "/versions/" + versionId + "/restore").session(canvas.session))
                .andExpect(status().isBadGateway());
    }

    @Test
    void aRefusedServiceTokenIsReportedAsAConfigurationProblem() throws Exception {
        Canvas canvas = newCanvas();
        REALTIME.expectedToken = "un-autre-jeton";

        mockMvc.perform(get("/api/canvases/" + canvas.id + "/snapshot").session(canvas.session))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.detail").value(containsString("jeton de service")));
    }

    // ------------------------------------------------------------------ Rôles et accès

    @Test
    void aReadOnlyMemberCanReadVersionsButNotCreateOrRestoreThem() throws Exception {
        Canvas owner = newCanvas();
        String versionId = createVersion(owner, "v1");
        MockHttpSession reader = joinAs(owner, "READ");

        mockMvc.perform(get("/api/canvases/" + owner.id + "/versions").session(reader))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/canvases/" + owner.id + "/versions/" + versionId).session(reader))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/canvases/" + owner.id + "/versions").session(reader)
                .contentType("application/json").content("{\"name\":\"interdit\"}"))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        mockMvc.perform(post("/api/canvases/" + owner.id + "/versions/" + versionId + "/restore").session(reader))
                .andExpect(status().isForbidden());
        assertThat(REALTIME.restoreBodies).isEmpty();
    }

    @Test
    void aWritingMemberCanCreateVersions() throws Exception {
        Canvas owner = newCanvas();
        MockHttpSession writer = joinAs(owner, "WRITE");

        mockMvc.perform(post("/api/canvases/" + owner.id + "/versions").session(writer)
                .contentType("application/json").content("{\"name\":\"par un membre\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void someoneWhoIsNotAMemberSeesNothing() throws Exception {
        Canvas owner = newCanvas();
        String versionId = createVersion(owner, "v1");
        MockHttpSession stranger = newCanvas().session;

        mockMvc.perform(get("/api/canvases/" + owner.id + "/versions").session(stranger)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/canvases/" + owner.id + "/versions/" + versionId).session(stranger)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/canvases/" + owner.id + "/snapshot").session(stranger)).andExpect(status().isNotFound());
        mockMvc.perform(post("/api/canvases/" + owner.id + "/versions").session(stranger)
                .contentType("application/json").content("{\"name\":\"x\"}")).andExpect(status().isNotFound());
        mockMvc.perform(post("/api/canvases/" + owner.id + "/versions/" + versionId + "/restore").session(stranger))
                .andExpect(status().isNotFound());
    }

    @Test
    void aVersionOfAnotherCanvasIsNotFound() throws Exception {
        Canvas first = newCanvas();
        String versionId = createVersion(first, "v1");
        MvcResult second = mockMvc.perform(post("/api/projects/" + first.projectId + "/canvases").session(first.session)
                .contentType("application/json").content("{\"name\":\"Deuxième\"}"))
                .andExpect(status().isCreated()).andReturn();
        String secondId = JSON.readTree(second.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(get("/api/canvases/" + secondId + "/versions/" + versionId).session(first.session))
                .andExpect(status().isNotFound());
        mockMvc.perform(post("/api/canvases/" + secondId + "/versions/" + versionId + "/restore").session(first.session))
                .andExpect(status().isNotFound());
    }

    @Test
    void aVersionNameIsRequired() throws Exception {
        Canvas canvas = newCanvas();
        mockMvc.perform(post("/api/canvases/" + canvas.id + "/versions").session(canvas.session)
                .contentType("application/json").content("{\"name\":\" \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
    }

    // ------------------------------------------------------------------ Outils

    private record Canvas(MockHttpSession session, String projectId, String id) {
    }

    private Canvas newCanvas() throws Exception {
        MvcResult guest = mockMvc.perform(post("/api/auth/guest")).andExpect(status().isCreated()).andReturn();
        MockHttpSession session = (MockHttpSession) guest.getRequest().getSession(false);
        String projects = mockMvc.perform(get("/api/projects").session(session)).andReturn().getResponse().getContentAsString();
        String projectId = JSON.readTree(projects).get(0).get("id").asText();
        String canvases = mockMvc.perform(get("/api/projects/" + projectId + "/canvases").session(session))
                .andReturn().getResponse().getContentAsString();
        return new Canvas(session, projectId, JSON.readTree(canvases).get(0).get("id").asText());
    }

    private String createVersion(Canvas canvas, String name) throws Exception {
        String json = mockMvc.perform(post("/api/canvases/" + canvas.id + "/versions").session(canvas.session)
                .contentType("application/json").content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JSON.readTree(json).get("id").asText();
    }

    /** Un second invité rejoint le canvas par lien de partage avec le rôle demandé. */
    private MockHttpSession joinAs(Canvas owner, String role) throws Exception {
        String link = mockMvc.perform(post("/api/canvases/" + owner.id + "/share-links").session(owner.session)
                .contentType("application/json").content("{\"role\":\"" + role + "\",\"ttlHours\":1}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String url = JSON.readTree(link).get("url").asText();
        MvcResult joined = mockMvc.perform(post("/api/join/" + url.substring(url.lastIndexOf('/') + 1)))
                .andExpect(status().isOk()).andReturn();
        return (MockHttpSession) joined.getRequest().getSession(false);
    }

    private static String seedJson() throws IOException {
        return new String(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8);
    }

    /** Faux serveur temps réel : instantané et restauration, jeton de service vérifié. */
    private static final class FakeRealtime {
        final HttpServer server;
        volatile String snapshot;
        volatile int snapshotStatus = 200;
        volatile int restoreStatus = 204;
        volatile String expectedToken = SERVICE_TOKEN;
        final List<String> restoreBodies = new CopyOnWriteArrayList<>();
        final List<String> authorizations = new CopyOnWriteArrayList<>();

        private FakeRealtime(HttpServer server) {
            this.server = server;
        }

        static FakeRealtime start() {
            try {
                HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
                FakeRealtime fake = new FakeRealtime(server);
                server.createContext("/internal/canvases/", fake::handle);
                server.start();
                return fake;
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }

        int port() {
            return server.getAddress().getPort();
        }

        void reset(String seed) {
            snapshot = seed;
            snapshotStatus = 200;
            restoreStatus = 204;
            expectedToken = SERVICE_TOKEN;
            restoreBodies.clear();
            authorizations.clear();
        }

        private void handle(HttpExchange exchange) throws IOException {
            String authorization = exchange.getRequestHeaders().getFirst("Authorization");
            authorizations.add(String.valueOf(authorization));
            String path = exchange.getRequestURI().getPath();
            if (!("Bearer " + expectedToken).equals(authorization)) {
                respond(exchange, 401, "{}");
            } else if (path.endsWith("/snapshot") && "GET".equals(exchange.getRequestMethod())) {
                respond(exchange, snapshotStatus, snapshotStatus == 200 ? snapshot : "{}");
            } else if (path.endsWith("/restore") && "POST".equals(exchange.getRequestMethod())) {
                restoreBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                respond(exchange, restoreStatus, null);
            } else {
                respond(exchange, 404, "{}");
            }
        }

        private void respond(HttpExchange exchange, int status, String body) throws IOException {
            if (body == null || status == 204) {
                exchange.sendResponseHeaders(status, -1);
            } else {
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, bytes.length);
                exchange.getResponseBody().write(bytes);
            }
            exchange.close();
        }
    }
}
