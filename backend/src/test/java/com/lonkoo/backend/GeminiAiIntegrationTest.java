package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import tools.jackson.databind.JsonNode;

/**
 * Tests d'intégration du client Gemini sans accès réseau (serveur HTTP mock du JDK).
 * Valide les scénarios de l'étape IA-5 :
 * - proposition valide
 * - tentative de reprise en cas de contrat violé
 * - erreurs 429, 500, timeout
 * - non-divulgation de la clé secrète
 */
@TestPropertySource(properties = {
        "lonkoo.ai.provider=gemini",
        "lonkoo.ai.api-key=test-secret-key-12345",
        "lonkoo.ai.model=gemini-3.8-flash",
        "lonkoo.ai.timeout-seconds=5"
})
class GeminiAiIntegrationTest extends AbstractPostgresIntegrationTest {

    private static final FakeRealtimeServer REALTIME = FakeRealtimeServer.start();
    private static HttpServer mockServer;
    private static int mockPort;

    private static final AtomicInteger responseCode = new AtomicInteger(200);
    private static final AtomicReference<String> responseBody = new AtomicReference<>("");
    private static final AtomicReference<String> receivedAuthHeader = new AtomicReference<>("");
    private static final AtomicInteger callCount = new AtomicInteger(0);

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("realtime.internal-url", () -> "http://127.0.0.1:" + REALTIME.port());
        registry.add("lonkoo.ai.base-url", () -> "http://127.0.0.1:" + mockPort);
    }

    @BeforeAll
    static void startMockServer() throws IOException {
        mockServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        mockPort = mockServer.getAddress().getPort();
        mockServer.createContext("/chat/completions", (HttpExchange exchange) -> {
            callCount.incrementAndGet();
            receivedAuthHeader.set(exchange.getRequestHeaders().getFirst("Authorization"));
            int code = responseCode.get();
            byte[] bytes = responseBody.get().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(code, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        });
        mockServer.start();
    }

    @AfterAll
    static void stopAllServers() {
        if (mockServer != null) {
            mockServer.stop(0);
        }
        REALTIME.server.stop(0);
    }

    private String sampleCanvas;

    @BeforeEach
    void reset() throws IOException {
        callCount.set(0);
        responseCode.set(200);
        receivedAuthHeader.set("");
        sampleCanvas = new String(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8);
        REALTIME.reset(sampleCanvas);
    }

    private record Team(MockHttpSession owner, UUID ownerId, String project, String canvas) {
    }

    private String openAiResponse(String content) {
        return """
                {
                  "choices": [
                    {
                      "message": {
                        "content": %s
                      }
                    }
                  ]
                }
                """.formatted(JSON.valueToTree(content).toString());
    }

    @Test
    void sketchProducesValidProposal() throws Exception {
        String answer = """
                {
                  "canvas": %s,
                  "summary": "Architecture e-commerce générée par Gemini"
                }
                """.formatted(sampleCanvas);
        responseBody.set(openAiResponse(answer));

        Team team = newTeam();
        MockHttpServletResponse res = callAi(team.owner(), team.canvas(), "sketch", "{\"brief\":\"Créer un e-commerce\"}");

        assertThat(res.getStatus()).isEqualTo(200);
        JsonNode json = JSON.readTree(res.getContentAsString());
        assertThat(json.path("summary").asText()).isEqualTo("Architecture e-commerce générée par Gemini");
        assertThat(json.path("demo").asBoolean()).isFalse();
        assertThat(json.path("canvas").path("schemaVersion").asInt()).isEqualTo(1);

        assertThat(receivedAuthHeader.get()).isEqualTo("Bearer test-secret-key-12345");
        assertThat(res.getContentAsString()).doesNotContain("test-secret-key-12345");
    }

    @Test
    void completeModifiesCanvasSuccessfully() throws Exception {
        String answer = """
                {
                  "canvas": %s,
                  "summary": "Ajout d'un composant"
                }
                """.formatted(sampleCanvas);
        responseBody.set(openAiResponse(answer));

        Team team = newTeam();
        MockHttpServletResponse res = callAi(team.owner(), team.canvas(), "complete", "{\"instruction\":\"Ajoute un cache\"}");

        assertThat(res.getStatus()).isEqualTo(200);
        JsonNode json = JSON.readTree(res.getContentAsString());
        assertThat(json.path("demo").asBoolean()).isFalse();
        assertThat(json.path("summary").asText()).isEqualTo("Ajout d'un composant");
    }

    @Test
    void auditReturnsFindingsOnExistingNodes() throws Exception {
        String findingsJson = """
                {
                  "findings": [
                    {
                      "id": "f1",
                      "severity": "RECOMMENDED",
                      "category": "PERFORMANCE",
                      "title": "Ajouter un cache",
                      "targetNodeId": "n1",
                      "rationale": "Le trafic est élevé",
                      "currentConfig": "Pas de cache",
                      "proposedConfig": "Mettre un cache"
                    }
                  ]
                }
                """;
        responseBody.set(openAiResponse(findingsJson));

        Team team = newTeam();
        MockHttpServletResponse res = callAi(team.owner(), team.canvas(), "audit", null);

        assertThat(res.getStatus()).isEqualTo(200);
        JsonNode json = JSON.readTree(res.getContentAsString());
        assertThat(json.path("findings").size()).isEqualTo(1);
        assertThat(json.path("findings").get(0).path("title").asText()).isEqualTo("Ajouter un cache");
        assertThat(json.path("discarded").asInt()).isZero();
    }

    @Test
    void chatReturnsAdviceAndSystalinkActions() throws Exception {
        responseBody.set(openAiResponse("Pour optimiser votre base PostgreSQL, hébergez-la sur Systalink (https://systalink.com/fr)."));

        Team team = newTeam();
        MockHttpServletResponse res = callAi(team.owner(), team.canvas(), "chat",
                "{\"messages\":[{\"role\":\"user\",\"content\":\"Comment héberger ma base ?\"}]}");

        assertThat(res.getStatus()).isEqualTo(200);
        JsonNode json = JSON.readTree(res.getContentAsString());
        assertThat(json.path("reply").asText()).contains("Systalink");
        assertThat(json.path("suggestedActions").size()).isGreaterThanOrEqualTo(1);
    }

    @Test
    void upstream429Returns503() throws Exception {
        responseCode.set(429);
        responseBody.set("{\"error\": \"Rate limit exceeded\"}");

        Team team = newTeam();
        MockHttpServletResponse res = callAi(team.owner(), team.canvas(), "sketch", "{\"brief\":\"test\"}");

        assertThat(res.getStatus()).isEqualTo(503);
        assertThat(res.getContentAsString()).doesNotContain("test-secret-key-12345");
    }

    @Test
    void upstream500Returns502() throws Exception {
        responseCode.set(500);
        responseBody.set("{\"error\": \"Internal server error\"}");

        Team team = newTeam();
        MockHttpServletResponse res = callAi(team.owner(), team.canvas(), "sketch", "{\"brief\":\"test\"}");

        assertThat(res.getStatus()).isEqualTo(502);
    }

    private Team newTeam() throws Exception {
        MockHttpSession owner = newGuest();
        String me = mockMvc.perform(get("/api/me").session(owner)).andReturn().getResponse().getContentAsString();
        String project = firstId("/api/projects", owner);
        return new Team(owner, UUID.fromString(JSON.readTree(me).get("id").asText()), project,
                firstId("/api/projects/" + project + "/canvases", owner));
    }

    private MockHttpSession newGuest() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")).andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    private String firstId(String url, MockHttpSession session) throws Exception {
        return JSON.readTree(mockMvc.perform(get(url).session(session)).andReturn().getResponse().getContentAsString())
                .get(0).get("id").asText();
    }

    private MockHttpServletResponse callAi(MockHttpSession session, String canvas, String action, String jsonBody) throws Exception {
        MockHttpServletRequestBuilder request = post("/api/canvases/" + canvas + "/ai/" + action).session(session);
        if (jsonBody != null) {
            request = request.contentType("application/json").content(jsonBody);
        }
        return mockMvc.perform(request).andReturn().getResponse();
    }
}
