package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import tools.jackson.databind.JsonNode;

/**
 * Le fournisseur réellement utilisé en démonstration ({@code AI_PROVIDER=agent_ia}) : le backend parle au microservice
 * Python par HTTP. Tout se joue contre un faux microservice local ({@link FakeAgentIaServer}), sans réseau ni clé.
 *
 * <p>Ce qui est vérifié : une proposition valide passe la chaîne entière ; une sortie qui viole le contrat du canvas
 * est refusée (502 avec {@code errors}) ; une réponse non JSON, un 500, un 429, un 403 et un service trop lent se
 * traduisent par des erreurs lisibles qui ne disent rien d'interne ; une remarque d'audit qui vise un bloc absent est
 * écartée et comptée ; le jeton {@code X-Service-Token} part à chaque appel ; le quota compte un appel par demande.</p>
 */
@TestPropertySource(properties = {
        "lonkoo.ai.provider=agent_ia",
        "lonkoo.ai.service-token=jeton-du-service-ia-0123456789",
        // Un appel au modèle est borné à 1 s côté microservice ; le backend l'attend 7 s (deux appels plus la marge).
        "lonkoo.ai.timeout-seconds=1",
        "lonkoo.ai.agent-timeout-seconds=7"})
class AgentIaIntegrationTest extends AbstractPostgresIntegrationTest {

    private static final String SERVICE_TOKEN = "jeton-du-service-ia-0123456789";

    private static final FakeRealtimeServer REALTIME = FakeRealtimeServer.start();
    private static final FakeAgentIaServer AGENT = FakeAgentIaServer.start();

    @DynamicPropertySource
    static void serverProperties(DynamicPropertyRegistry registry) {
        registry.add("realtime.internal-url", () -> "http://127.0.0.1:" + REALTIME.port());
        registry.add("lonkoo.ai.agent-url", () -> "http://127.0.0.1:" + AGENT.port());
    }

    @AfterAll
    static void stopServers() {
        AGENT.stop();
        REALTIME.server.stop(0);
    }

    @Autowired
    private JdbcClient jdbc;

    private String seed;

    @BeforeEach
    void resetServers() throws IOException {
        seed = new String(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8);
        REALTIME.reset(seed);
        AGENT.reset();
    }

    // ------------------------------------------------------------------ Le cas qui marche

    @Test
    void aValidProposalCrossesTheWholeChain() throws Exception {
        AGENT.body = """
                {"canvas": %s, "summary": "Esquisse du microservice"}
                """.formatted(seed);
        Person owner = newGuest();

        MockHttpServletResponse response = ai(owner, "sketch", "{\"brief\":\"Une boutique\"}");

        assertThat(response.getStatus()).isEqualTo(200);
        JsonNode body = JSON.readTree(response.getContentAsString());
        assertThat(body.get("summary").asText()).isEqualTo("Esquisse du microservice");
        assertThat(body.get("demo").asBoolean()).as("ce n'est pas l'agent de démonstration").isFalse();
        assertThat(body.get("warnings")).as("rien à signaler sur une esquisse").isEmpty();
        assertThat(body.get("canvas").get("nodes").size()).isEqualTo(7);

        assertThat(AGENT.paths).containsExactly("/sketch");
        assertThat(AGENT.requestBodies.get(0)).contains("Une boutique");
    }

    @Test
    void theInstructionAndTheReducedSnapshotReachTheMicroservice() throws Exception {
        AGENT.body = """
                {"canvas": %s, "summary": "Complétion"}
                """.formatted(seed);
        Person owner = newGuest();

        assertThat(ai(owner, "complete", "{\"nodeIds\":[\"n3\"],\"instruction\":\"ajoute un cache\"}").getStatus()).isEqualTo(200);

        JsonNode sent = JSON.readTree(AGENT.requestBodies.get(0));
        assertThat(sent.path("instruction").asText()).isEqualTo("ajoute un cache");
        assertThat(sent.path("nodeIds").get(0).asText()).isEqualTo("n3");
        assertThat(sent.path("snapshot").toString()).as("l'instantané est réduit avant de partir").doesNotContain("position");
        assertThat(sent.path("snapshot").path("nodes").get(2).path("data").path("name").asText()).isEqualTo("api_marketplace");
    }

    // ------------------------------------------------------------------ Les sorties qu'on refuse

    @Test
    void aJsonThatBreaksTheCanvasContractIsRefusedWithItsErrors() throws Exception {
        AGENT.body = """
                {"canvas": {"schemaVersion": 1, "nodes": [{"id": "x", "type": "hologramme",
                 "position": {"x": 0, "y": 0}, "data": {"name": "x"}}], "edges": []}, "summary": "raté"}
                """;
        Person owner = newGuest();

        MockHttpServletResponse response = ai(owner, "sketch", "{\"brief\":\"x\"}");

        assertThat(response.getStatus()).isEqualTo(502);
        assertThat(response.getContentType()).startsWith("application/problem+json");
        JsonNode problem = JSON.readTree(response.getContentAsString());
        assertThat(problem.get("title").asText()).isEqualTo("Réponse IA invalide");
        assertThat(problem.get("errors").size()).isPositive();
        assertThat(response.getContentAsString()).doesNotContain(SERVICE_TOKEN);
    }

    @Test
    void aProposalWithoutAnyCanvasIsRefusedToo() throws Exception {
        AGENT.body = "{\"summary\": \"j'ai oublié le canvas\"}";
        Person owner = newGuest();

        MockHttpServletResponse response = ai(owner, "sketch", "{\"brief\":\"x\"}");

        assertThat(response.getStatus()).isEqualTo(502);
        assertThat(JSON.readTree(response.getContentAsString()).get("errors").size()).isPositive();
    }

    @Test
    void aResponseThatIsNotJsonIsAFailure() throws Exception {
        AGENT.body = "Service IA : erreur interne (trace Python)";
        Person owner = newGuest();

        MockHttpServletResponse response = ai(owner, "sketch", "{\"brief\":\"x\"}");

        assertThat(response.getStatus()).isEqualTo(502);
        String detail = JSON.readTree(response.getContentAsString()).get("detail").asText();
        assertThat(detail).isEqualTo("Le service IA a renvoyé une réponse inutilisable.");
        assertThat(detail).doesNotContain("Python");
    }

    // ------------------------------------------------------------------ Les pannes du microservice

    @Test
    void anInternalErrorOfTheMicroserviceGivesABadGateway() throws Exception {
        AGENT.status = 500;
        AGENT.body = "{\"detail\": \"GEMINI_API_KEY manquante\"}";
        Person owner = newGuest();

        MockHttpServletResponse response = ai(owner, "sketch", "{\"brief\":\"x\"}");

        assertThat(response.getStatus()).isEqualTo(502);
        assertThat(response.getContentAsString()).as("rien du détail interne ne ressort")
                .doesNotContain("GEMINI_API_KEY").doesNotContain(SERVICE_TOKEN);
    }

    @Test
    void aSaturatedMicroserviceGivesServiceUnavailable() throws Exception {
        AGENT.status = 429;
        AGENT.body = "{\"detail\": \"quota du modèle atteint\"}";
        Person owner = newGuest();

        MockHttpServletResponse response = ai(owner, "sketch", "{\"brief\":\"x\"}");

        assertThat(response.getStatus()).isEqualTo(503);
        assertThat(JSON.readTree(response.getContentAsString()).get("detail").asText())
                .isEqualTo("Service IA temporairement surchargé.");
    }

    @Test
    void aRefusedServiceTokenNeverTellsWhy() throws Exception {
        AGENT.status = 403;
        AGENT.body = "{\"detail\": \"X-Service-Token invalide\"}";
        Person owner = newGuest();

        MockHttpServletResponse response = ai(owner, "sketch", "{\"brief\":\"x\"}");

        assertThat(response.getStatus()).isEqualTo(502);
        String content = response.getContentAsString();
        assertThat(JSON.readTree(content).get("detail").asText()).isEqualTo("Le service IA n'a pas accepté l'appel interne.");
        assertThat(content).doesNotContain(SERVICE_TOKEN).doesNotContain("X-Service-Token");
    }

    @Test
    void aMicroserviceThatAnswersTooLateGivesAGatewayTimeout() throws Exception {
        AGENT.delayMillis = 10_000;
        Person owner = newGuest();

        MockHttpServletResponse response = ai(owner, "sketch", "{\"brief\":\"x\"}");

        assertThat(response.getStatus()).isEqualTo(504);
        assertThat(JSON.readTree(response.getContentAsString()).get("detail").asText())
                .isEqualTo("Le service IA n'a pas répondu à temps.");
    }

    // ------------------------------------------------------------------ L'audit

    @Test
    void aRemarkAboutABlockThatDoesNotExistIsDiscardedAndCounted() throws Exception {
        AGENT.body = """
                {"findings": [
                  {"id": "f1", "severity": "CRITICAL", "category": "SECURITY", "title": "Base exposée",
                   "targetNodeId": "n4", "rationale": "parce que", "currentConfig": "avant", "proposedConfig": "après"},
                  {"id": "f2", "severity": "RECOMMENDED", "category": "RESILIENCE", "title": "Bloc imaginaire",
                   "targetNodeId": "bloc-fantome", "rationale": "", "currentConfig": "", "proposedConfig": ""}
                ]}
                """;
        Person owner = newGuest();

        JsonNode body = JSON.readTree(ai(owner, "audit", null).getContentAsString());

        assertThat(body.get("findings").size()).isEqualTo(1);
        assertThat(body.get("findings").get(0).get("targetNodeId").asText()).isEqualTo("n4");
        assertThat(body.get("discarded").asInt()).isEqualTo(1);
        assertThat(body.get("demo").asBoolean()).isFalse();
    }

    @Test
    void anAuditWithoutAnyUsableListIsAFailureNotASoundArchitecture() throws Exception {
        AGENT.body = "{\"resultat\": \"je ne sais pas\"}";
        Person owner = newGuest();

        MockHttpServletResponse response = ai(owner, "audit", null);

        assertThat(response.getStatus()).as("502 plutôt que « aucune remarque »").isEqualTo(502);
        assertThat(JSON.readTree(response.getContentAsString()).get("detail").asText())
                .isEqualTo("Le service IA n'a pas rendu d'audit exploitable.");
    }

    @Test
    void anAuditWithAnEmptyListIsALegitimateAnswer() throws Exception {
        AGENT.body = "{\"findings\": []}";
        Person owner = newGuest();

        MockHttpServletResponse response = ai(owner, "audit", null);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(JSON.readTree(response.getContentAsString()).get("findings").size()).isZero();
    }

    // ------------------------------------------------------------------ Le jeton et le quota

    @Test
    void theServiceTokenGoesWithEveryCallAndNeverComesBack() throws Exception {
        AGENT.plannedBodies.add("{\"canvas\": %s, \"summary\": \"ok\"}".formatted(seed));
        AGENT.plannedBodies.add("{\"findings\": []}");
        AGENT.plannedBodies.add("{\"reply\": \"Bonjour\", \"suggestedActions\": [\"Auditer\"]}");
        Person owner = newGuest();

        assertThat(ai(owner, "sketch", "{\"brief\":\"x\"}").getStatus()).isEqualTo(200);
        assertThat(ai(owner, "audit", null).getStatus()).isEqualTo(200);
        MockHttpServletResponse chat = ai(owner, "chat", "{\"messages\":[{\"role\":\"user\",\"content\":\"salut\"}]}");

        assertThat(chat.getStatus()).isEqualTo(200);
        assertThat(JSON.readTree(chat.getContentAsString()).get("reply").asText()).isEqualTo("Bonjour");
        assertThat(AGENT.paths).containsExactly("/sketch", "/audit", "/chat");
        assertThat(AGENT.tokens).as("le jeton de service part à chaque appel").containsExactly(
                SERVICE_TOKEN, SERVICE_TOKEN, SERVICE_TOKEN);
        assertThat(chat.getContentAsString()).doesNotContain(SERVICE_TOKEN);
    }

    @Test
    void oneUserCallCostsExactlyOneCallOfQuota() throws Exception {
        AGENT.body = "{\"canvas\": %s, \"summary\": \"ok\"}".formatted(seed);
        Person owner = newGuest();

        assertThat(ai(owner, "sketch", "{\"brief\":\"x\"}").getStatus()).isEqualTo(200);

        assertThat(jdbc.sql("select coalesce(sum(calls), 0) from ai_usage where user_id = ? and day = (now() at time zone 'utc')::date")
                .param(owner.id()).query(Integer.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("select coalesce(sum(chat_calls), 0) from ai_usage where user_id = ? and day = (now() at time zone 'utc')::date")
                .param(owner.id()).query(Integer.class).single()).as("le dialogue a son propre compteur").isZero();
    }

    // ------------------------------------------------------------------ Outils

    private record Person(MockHttpSession session, UUID id, String canvas) {
    }

    private MockHttpServletResponse ai(Person person, String route, String body) throws Exception {
        MockHttpServletRequestBuilder request = post("/api/canvases/" + person.canvas() + "/ai/" + route)
                .session(person.session());
        if (body != null) {
            request = request.contentType("application/json").content(body);
        }
        return mockMvc.perform(request).andReturn().getResponse();
    }

    private Person newGuest() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")).andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        UUID id = UUID.fromString(JSON.readTree(
                mockMvc.perform(get("/api/me").session(session)).andReturn().getResponse().getContentAsString())
                .get("id").asText());
        String project = firstId("/api/projects", session);
        return new Person(session, id, firstId("/api/projects/" + project + "/canvases", session));
    }

    private String firstId(String url, MockHttpSession session) throws Exception {
        return JSON.readTree(mockMvc.perform(get(url).session(session)).andReturn().getResponse().getContentAsString())
                .get(0).get("id").asText();
    }
}
