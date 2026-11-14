package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.lonkoo.backend.ai.AiClient;
import com.lonkoo.backend.ai.AiFinding;
import com.lonkoo.backend.ai.AiProposal;
import com.lonkoo.backend.ai.AiSnapshots;
import com.lonkoo.backend.ai.AiUnavailableException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Ce que le serveur garantit, quel que soit le fournisseur : un agent simulé renvoie n'importe quoi, et rien de faux ne
 * sort. Toute proposition est validée contre le contrat du canvas, les remarques sur des blocs absents sont écartées, la
 * panne du fournisseur est dite telle quelle, et l'agent n'est jamais appelé pour quelqu'un qui n'y a pas droit.
 */
class AiOutputGuardIntegrationTest extends AbstractPostgresIntegrationTest {

    private static final FakeRealtimeServer REALTIME = FakeRealtimeServer.start();

    private static final String INVALID_CANVAS = """
            {"schemaVersion":1,"nodes":[{"id":"x","type":"hologramme","position":{"x":0,"y":0},"data":{"name":"x"}}],"edges":[]}""";

    @DynamicPropertySource
    static void realtimeProperties(DynamicPropertyRegistry registry) {
        registry.add("realtime.internal-url", () -> "http://127.0.0.1:" + REALTIME.port());
    }

    @AfterAll
    static void stopRealtime() {
        REALTIME.server.stop(0);
    }

    @MockitoBean
    private AiClient agent;

    @Autowired
    private JdbcClient jdbc;

    private String seed;

    @BeforeEach
    void resetRealtime() throws IOException {
        seed = new String(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8);
        REALTIME.reset(seed);
    }

    // ------------------------------------------------------------------ Une proposition invalide n'est jamais renvoyée

    @Test
    void aProposalThatBreaksTheCanvasContractIsRefusedWithItsErrors() throws Exception {
        when(agent.sketch(anyString())).thenReturn(new AiProposal(JSON.readTree(INVALID_CANVAS), "Une idée"));
        Team team = newTeam();

        MockHttpServletResponse response = ai(team.owner(), team.canvas(), "sketch", "{\"brief\":\"x\"}");

        assertThat(response.getStatus()).as("la faute est celle du fournisseur : 502, pas 422").isEqualTo(502);
        assertThat(response.getContentType()).startsWith("application/problem+json");
        JsonNode problem = JSON.readTree(response.getContentAsString());
        assertThat(problem.get("title").asText()).isEqualTo("Réponse IA invalide");
        assertThat(problem.get("errors").size()).isPositive();
        assertThat(response.getContentAsString()).as("rien de la proposition n'est renvoyé").doesNotContain("hologramme\",\"position");
    }

    @Test
    void anEmptyAnswerIsRefusedToo() throws Exception {
        when(agent.sketch(anyString())).thenReturn(null);
        when(agent.complete(any(), anyList(), anyString())).thenReturn(new AiProposal(null, "rien"));
        Team team = newTeam();

        assertThat(ai(team.owner(), team.canvas(), "sketch", "{\"brief\":\"x\"}").getStatus()).isEqualTo(502);
        assertThat(ai(team.owner(), team.canvas(), "complete", "{}").getStatus()).isEqualTo(502);
    }

    @Test
    void aValidProposalWithoutASummaryIsStillReturned() throws Exception {
        when(agent.sketch(anyString())).thenReturn(new AiProposal(JSON.readTree(seed), null));
        Team team = newTeam();

        MockHttpServletResponse response = ai(team.owner(), team.canvas(), "sketch", "{\"brief\":\"x\"}");

        assertThat(response.getStatus()).isEqualTo(200);
        JsonNode body = JSON.readTree(response.getContentAsString());
        assertThat(body.get("summary").asText()).isEmpty();
        assertThat(body.get("demo").asBoolean()).as("un agent qui n'est pas de démonstration ne l'annonce pas").isFalse();
    }

    // ------------------------------------------------------------------ Audit : seules les remarques sur des blocs réels restent

    @Test
    void remarksAboutBlocksThatDoNotExistAreDiscardedAndCounted() throws Exception {
        when(agent.audit(any())).thenReturn(Arrays.asList(
                finding("a", "n3"), finding("b", "bloc-imaginaire"), null, finding("c", null), finding("d", "n4")));
        Team team = newTeam();

        JsonNode body = JSON.readTree(ai(team.owner(), team.canvas(), "audit", null).getContentAsString());

        assertThat(body.get("findings").size()).isEqualTo(2);
        assertThat(body.get("findings").get(0).get("id").asText()).isEqualTo("a");
        assertThat(body.get("findings").get(1).get("id").asText()).isEqualTo("d");
        assertThat(body.get("discarded").asInt()).isEqualTo(3);
    }

    @Test
    void anAgentThatReturnsNoListGivesNoRemarks() throws Exception {
        when(agent.audit(any())).thenReturn(null);
        Team team = newTeam();

        JsonNode body = JSON.readTree(ai(team.owner(), team.canvas(), "audit", null).getContentAsString());

        assertThat(body.get("findings").size()).isZero();
        assertThat(body.get("discarded").asInt()).isZero();
    }

    // ------------------------------------------------------------------ Ce que l'agent reçoit

    @Test
    void theAgentReceivesTheLiveCanvasReducedTheSelectionAndTheTrimmedText() throws Exception {
        when(agent.complete(any(), anyList(), anyString())).thenReturn(new AiProposal(JSON.readTree(seed), "ok"));
        Team team = newTeam();

        MockHttpServletResponse response = ai(team.owner(), team.canvas(),
                "complete", "{\"nodeIds\":[\"n1\",\"n4\"],\"instruction\":\"  ajoute un cache  \"}");
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(JSON.readTree(response.getContentAsString()).get("warnings"))
                .as("la liste est toujours présente, vide quand rien n'a disparu").isEmpty();

        ArgumentCaptor<JsonNode> sent = ArgumentCaptor.forClass(JsonNode.class);
        verify(agent).complete(sent.capture(), eq(List.of("n1", "n4")), eq("ajoute un cache"));
        assertThat(sent.getValue()).as("l'instantané est réduit avant de partir").isEqualTo(AiSnapshots.prune(JSON.readTree(seed)));
        assertThat(sent.getValue().toString()).as("ni position, ni champ hors contrat").doesNotContain("position");
        assertThat(sent.getValue().toString()).as("ce qui sert au raisonnement reste").contains("api_marketplace").contains("entities");
    }

    // ------------------------------------------------------------------ Une complétion qui perd un bloc est signalée

    @Test
    void aCompletionThatDropsABlockIsSignalledAndNotRefused() throws Exception {
        ObjectNode shrunk = (ObjectNode) JSON.readTree(seed);
        // Le dernier bloc (facturation) et le lien qui le vise partent : le canvas reste valide, mais un bloc manque.
        ((ArrayNode) shrunk.get("nodes")).remove(6);
        ((ArrayNode) shrunk.get("edges")).remove(5);
        when(agent.complete(any(), anyList(), anyString())).thenReturn(new AiProposal(shrunk, "J'ai retiré la facturation"));
        Team team = newTeam();

        MockHttpServletResponse response = ai(team.owner(), team.canvas(), "complete", "{\"instruction\":\"retire la facturation\"}");

        assertThat(response.getStatus()).as("une suppression peut être voulue : on signale, on ne refuse pas").isEqualTo(200);
        JsonNode body = JSON.readTree(response.getContentAsString());
        assertThat(body.get("canvas").get("nodes").size()).isEqualTo(6);
        assertThat(body.get("warnings").size()).isEqualTo(1);
        assertThat(body.get("warnings").get(0).asText()).contains("facturation").contains("vérifiez");
    }

    @Test
    void aSketchAlwaysCarriesAnEmptyListOfWarnings() throws Exception {
        when(agent.sketch(anyString())).thenReturn(new AiProposal(JSON.readTree(seed), "Une idée"));
        Team team = newTeam();

        JsonNode body = JSON.readTree(ai(team.owner(), team.canvas(), "sketch", "{\"brief\":\"x\"}").getContentAsString());

        assertThat(body.has("warnings")).isTrue();
        assertThat(body.get("warnings")).isEmpty();
    }

    // ------------------------------------------------------------------ La panne du fournisseur

    @Test
    void aProviderFailureIsReportedAsItIs() throws Exception {
        when(agent.sketch(anyString())).thenThrow(new AiUnavailableException(HttpStatus.SERVICE_UNAVAILABLE, "Le fournisseur d'IA est surchargé."));
        when(agent.audit(any())).thenThrow(new AiUnavailableException(HttpStatus.GATEWAY_TIMEOUT, "Le fournisseur d'IA n'a pas répondu à temps."));
        Team team = newTeam();

        MockHttpServletResponse sketch = ai(team.owner(), team.canvas(), "sketch", "{\"brief\":\"x\"}");
        assertThat(sketch.getStatus()).isEqualTo(503);
        assertThat(JSON.readTree(sketch.getContentAsString()).get("detail").asText()).isEqualTo("Le fournisseur d'IA est surchargé.");
        assertThat(ai(team.owner(), team.canvas(), "audit", null).getStatus()).isEqualTo(504);
    }

    // ------------------------------------------------------------------ L'agent n'est jamais appelé sans droit

    @Test
    void theAgentIsNeverCalledForSomeoneWhoHasNoRight() throws Exception {
        Team team = newTeam();
        MockHttpSession stranger = newGuest();
        MockHttpSession reader = newMember(team, "READ");

        assertThat(ai(stranger, team.canvas(), "sketch", "{\"brief\":\"x\"}").getStatus()).isEqualTo(404);
        assertThat(ai(stranger, team.canvas(), "audit", null).getStatus()).isEqualTo(404);
        assertThat(ai(reader, team.canvas(), "sketch", "{\"brief\":\"x\"}").getStatus()).isEqualTo(403);
        assertThat(ai(reader, team.canvas(), "complete", "{}").getStatus()).isEqualTo(403);
        assertThat(mockMvc.perform(post("/api/canvases/" + team.canvas() + "/ai/audit")).andReturn().getResponse().getStatus()).isEqualTo(401);

        verifyNoInteractions(agent);
    }

    // ------------------------------------------------------------------ Outils

    private static AiFinding finding(String id, String target) {
        return new AiFinding(id, AiFinding.Severity.RECOMMENDED, AiFinding.Category.SECURITY, "Titre " + id, target, "Parce que", "avant", "après");
    }

    private record Team(MockHttpSession owner, String project, String canvas) {
    }

    private MockHttpServletResponse ai(MockHttpSession session, String canvas, String route, String body) throws Exception {
        MockHttpServletRequestBuilder request = post("/api/canvases/" + canvas + "/ai/" + route).session(session);
        if (body != null) {
            request = request.contentType("application/json").content(body);
        }
        return mockMvc.perform(request).andReturn().getResponse();
    }

    private Team newTeam() throws Exception {
        MockHttpSession owner = newGuest();
        String project = firstId("/api/projects", owner);
        return new Team(owner, project, firstId("/api/projects/" + project + "/canvases", owner));
    }

    private MockHttpSession newMember(Team team, String role) throws Exception {
        MockHttpSession member = newGuest();
        String me = mockMvc.perform(get("/api/me").session(member)).andReturn().getResponse().getContentAsString();
        jdbc.sql("insert into project_members (project_id, user_id, role) values (?, ?, ?)")
                .param(UUID.fromString(team.project())).param(UUID.fromString(JSON.readTree(me).get("id").asText())).param(role).update();
        return member;
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
}
