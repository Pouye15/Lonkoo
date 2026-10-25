package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
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
 * L'agent de démonstration ({@code AI_PROVIDER=fake}) : des réponses figées, étiquetées {@code demo}, valides au contrat du
 * canvas, qui n'écrivent rien. Elles passent par la même chaîne qu'un vrai fournisseur : droits, plafonds, lecture de
 * l'instantané courant, validation, journal d'audit.
 */
@TestPropertySource(properties = "lonkoo.ai.provider=fake")
class AiFakeAgentIntegrationTest extends AbstractPostgresIntegrationTest {

    private static final FakeRealtimeServer REALTIME = FakeRealtimeServer.start();

    @DynamicPropertySource
    static void realtimeProperties(DynamicPropertyRegistry registry) {
        registry.add("realtime.internal-url", () -> "http://127.0.0.1:" + REALTIME.port());
    }

    @AfterAll
    static void stopRealtime() {
        REALTIME.server.stop(0);
    }

    @Autowired
    private JdbcClient jdbc;

    private String seed;

    @BeforeEach
    void resetRealtime() throws IOException {
        seed = new String(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8);
        REALTIME.reset(seed);
    }

    private record Team(MockHttpSession owner, UUID ownerId, String project, String canvas) {
    }

    // ------------------------------------------------------------------ Esquisse

    @Test
    void aSketchIsTheExampleModelLabelledAsDemoAndNothingIsWritten() throws Exception {
        Team team = newTeam();

        MockHttpServletResponse response = ai(team.owner(), team.canvas(), "sketch", "{\"brief\":\"  Une boutique avec paiement mobile  \"}");

        assertThat(response.getStatus()).isEqualTo(200);
        JsonNode body = JSON.readTree(response.getContentAsString());
        assertThat(body.get("demo").asBoolean()).as("une réponse figée le dit").isTrue();
        assertThat(body.get("summary").asText()).contains("démonstration");
        assertThat(body.get("canvas").get("nodes").size()).isEqualTo(JSON.readTree(seed).get("nodes").size());
        assertThat(REALTIME.restoreBodies).as("une proposition n'est jamais écrite dans le document partagé").isEmpty();
        assertThat(count("select count(*) from canvas_versions where canvas_id = ?", UUID.fromString(team.canvas())))
                .as("ni dans une version").isZero();
    }

    @Test
    void everyCallIsJournalledWithoutAnyTextTheCallerTyped() throws Exception {
        Team team = newTeam();

        ai(team.owner(), team.canvas(), "sketch", "{\"brief\":\"texte-secret-du-cahier-des-charges\"}");
        ai(team.owner(), team.canvas(), "complete", "{\"instruction\":\"consigne-secrete\"}");
        ai(team.owner(), team.canvas(), "audit", null);

        assertThat(jdbc.sql("select action from audit_log where target = ? and action like 'ai.%' order by id")
                .param("canvas:" + team.canvas()).query(String.class).list()).containsExactly("ai.sketch", "ai.complete", "ai.audit");
        assertThat(jdbc.sql("select coalesce(string_agg(coalesce(detail::text, ''), ''), '') from audit_log where target = ?")
                .param("canvas:" + team.canvas()).query(String.class).single())
                .doesNotContain("secret");
    }

    @Test
    void textLongerThanTheLimitIsRefusedAndTheLimitItselfIsAllowed() throws Exception {
        Team team = newTeam();

        assertThat(ai(team.owner(), team.canvas(), "sketch", "{\"brief\":\"" + "a".repeat(8001) + "\"}").getStatus()).isEqualTo(400);
        assertThat(ai(team.owner(), team.canvas(), "sketch", "{\"brief\":\"" + "a".repeat(8000) + "\"}").getStatus()).isEqualTo(200);
        assertThat(ai(team.owner(), team.canvas(), "complete", "{\"instruction\":\"" + "b".repeat(8001) + "\"}").getStatus()).isEqualTo(400);
        assertThat(count("select count(*) from audit_log where action = 'ai.sketch' and target = ?", "canvas:" + team.canvas()))
                .as("un refus n'est pas un appel").isEqualTo(1);
    }

    // ------------------------------------------------------------------ Complétion

    @Test
    void aCompletionAddsACacheLinkedToTheSelectedBlock() throws Exception {
        Team team = newTeam();
        int before = JSON.readTree(seed).get("nodes").size();

        JsonNode body = JSON.readTree(ai(team.owner(), team.canvas(), "complete", "{\"nodeIds\":[\"n3\"],\"instruction\":\"ajoute un cache\"}")
                .getContentAsString());

        JsonNode canvas = body.get("canvas");
        assertThat(canvas.get("nodes").size()).isEqualTo(before + 1);
        JsonNode added = canvas.get("nodes").get(before);
        assertThat(added.get("type").asText()).isEqualTo("generic");
        JsonNode edge = canvas.get("edges").get(canvas.get("edges").size() - 1);
        assertThat(edge.get("source").asText()).isEqualTo("n3");
        assertThat(edge.get("target").asText()).isEqualTo(added.get("id").asText());
        assertThat(body.get("demo").asBoolean()).isTrue();
    }

    @Test
    void withoutASelectionTheCompletionStartsFromTheFirstBlock() throws Exception {
        Team team = newTeam();

        JsonNode canvas = JSON.readTree(ai(team.owner(), team.canvas(), "complete", "{}").getContentAsString()).get("canvas");

        assertThat(canvas.get("edges").get(canvas.get("edges").size() - 1).get("source").asText()).isEqualTo("n1");
    }

    @Test
    void aCompletionStaysValidWhenItsNamesAreAlreadyTaken() throws Exception {
        Team team = newTeam();
        REALTIME.snapshot = """
                {"schemaVersion":1,"meta":{"name":"Déjà un cache"},
                 "nodes":[{"id":"ia-cache","type":"generic","position":{"x":0,"y":0},"data":{"name":"cache_ia"}}],
                 "edges":[]}""";

        MockHttpServletResponse response = ai(team.owner(), team.canvas(), "complete", "{}");

        assertThat(response.getStatus()).as("les noms pris sont évités, le canvas reste valide").isEqualTo(200);
        JsonNode nodes = JSON.readTree(response.getContentAsString()).get("canvas").get("nodes");
        assertThat(nodes.size()).isEqualTo(2);
        assertThat(nodes.get(1).get("id").asText()).isNotEqualTo("ia-cache");
        assertThat(nodes.get(1).get("data").get("name").asText()).isNotEqualTo("cache_ia");
    }

    @Test
    void aBlockThatIsNotInTheCanvasIsRefused() throws Exception {
        Team team = newTeam();

        assertThat(ai(team.owner(), team.canvas(), "complete", "{\"nodeIds\":[\"n3\",\"fantome\"]}").getStatus()).isEqualTo(400);
        assertThat(count("select count(*) from audit_log where action = 'ai.complete' and target = ?", "canvas:" + team.canvas()))
                .as("un refus n'est pas un appel").isZero();
    }

    // ------------------------------------------------------------------ Audit

    @Test
    void anAuditGivesRemarksOnRealBlocksAndChangesNothing() throws Exception {
        Team team = newTeam();
        List<String> ids = new ArrayList<>();
        JSON.readTree(seed).get("nodes").forEach(n -> ids.add(n.get("id").asText()));

        JsonNode body = JSON.readTree(ai(team.owner(), team.canvas(), "audit", null).getContentAsString());

        assertThat(body.get("findings").size()).isEqualTo(3);
        assertThat(body.get("discarded").asInt()).isZero();
        assertThat(body.get("demo").asBoolean()).isTrue();
        for (JsonNode finding : body.get("findings")) {
            assertThat(ids).contains(finding.get("targetNodeId").asText());
            assertThat(finding.get("severity").asText()).isIn("CRITICAL", "RECOMMENDED", "OPTIMIZATION");
            assertThat(finding.get("category").asText()).isIn("RESILIENCE", "STACK", "SECURITY", "PERFORMANCE");
            assertThat(finding.get("title").asText()).isNotBlank();
        }
        assertThat(REALTIME.restoreBodies).isEmpty();
    }

    @Test
    void anEmptyCanvasGetsNoRemarks() throws Exception {
        Team team = newTeam();
        REALTIME.snapshot = "{\"schemaVersion\":1,\"nodes\":[],\"edges\":[]}";

        JsonNode body = JSON.readTree(ai(team.owner(), team.canvas(), "audit", null).getContentAsString());

        assertThat(body.get("findings").size()).isZero();
    }

    // ------------------------------------------------------------------ Qui peut quoi, et la panne du temps réel

    @Test
    void aReaderMayAuditButNeitherSketchNorComplete() throws Exception {
        Team team = newTeam();
        MockHttpSession reader = newMember(team, "READ");

        assertThat(ai(reader, team.canvas(), "audit", null).getStatus()).isEqualTo(200);
        assertThat(ai(reader, team.canvas(), "sketch", "{\"brief\":\"x\"}").getStatus()).isEqualTo(403);
        assertThat(ai(reader, team.canvas(), "complete", "{}").getStatus()).isEqualTo(403);
        assertThat(count("select count(*) from audit_log where action = 'ai.sketch' and target = ?", "canvas:" + team.canvas())).isZero();
    }

    @Test
    void whenTheRealtimeServerFailsTheCallsThatNeedTheCanvasFailAndTheOthersDoNot() throws Exception {
        Team team = newTeam();
        REALTIME.snapshotStatus = 500;

        assertThat(ai(team.owner(), team.canvas(), "complete", "{}").getStatus()).isEqualTo(502);
        assertThat(ai(team.owner(), team.canvas(), "audit", null).getStatus()).isEqualTo(502);
        assertThat(ai(team.owner(), team.canvas(), "sketch", "{\"brief\":\"x\"}").getStatus()).as("l'esquisse ne lit pas le canvas").isEqualTo(200);
        assertThat(count("select count(*) from audit_log where action in ('ai.complete', 'ai.audit') and target = ?", "canvas:" + team.canvas()))
                .as("un appel qui n'a pas eu lieu n'est pas journalisé").isZero();
    }

    // ------------------------------------------------------------------ Outils

    private MockHttpServletResponse ai(MockHttpSession session, String canvas, String route, String body) throws Exception {
        MockHttpServletRequestBuilder request = post("/api/canvases/" + canvas + "/ai/" + route).session(session);
        if (body != null) {
            request = request.contentType("application/json").content(body);
        }
        return mockMvc.perform(request).andReturn().getResponse();
    }

    private Team newTeam() throws Exception {
        MockHttpSession owner = newGuest();
        String me = mockMvc.perform(get("/api/me").session(owner)).andReturn().getResponse().getContentAsString();
        String project = firstId("/api/projects", owner);
        return new Team(owner, UUID.fromString(JSON.readTree(me).get("id").asText()), project,
                firstId("/api/projects/" + project + "/canvases", owner));
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

    private int count(String sql, Object... params) {
        var statement = jdbc.sql(sql);
        for (Object param : params) {
            statement = statement.param(param);
        }
        return statement.query(Integer.class).single();
    }
}
