package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import tools.jackson.databind.JsonNode;

/**
 * Sans fournisseur d'IA branché (le réglage par défaut), les trois routes de l'agent répondent 501 {@code AI_NOT_IMPLEMENTED}
 * à qui y a droit, et rien d'autre : les droits sur le canvas passent avant, et un visiteur d'un projet public n'y a pas
 * accès. Les droits route par route sont aussi dans {@code AccessMatrixIntegrationTest}.
 */
class AiNotConfiguredIntegrationTest extends AbstractPostgresIntegrationTest {

    @Autowired
    private JdbcClient jdbc;

    @Test
    void anAuthorizedCallerGetsAClear501WithAStableCode() throws Exception {
        Team team = newTeam();

        for (String route : new String[] { "sketch", "complete", "audit" }) {
            MockHttpServletResponse response = mockMvc.perform(post("/api/canvases/" + team.canvas() + "/ai/" + route)
                    .session(team.owner()).contentType("application/json").content(bodyOf(route))).andReturn().getResponse();

            assertThat(response.getStatus()).as(route).isEqualTo(501);
            assertThat(response.getContentType()).startsWith("application/problem+json");
            JsonNode problem = JSON.readTree(response.getContentAsString());
            assertThat(problem.get("code").asText()).as(route).isEqualTo("AI_NOT_IMPLEMENTED");
            assertThat(problem.get("detail").asText()).isNotBlank();
        }
        assertThat(count("select count(*) from audit_log where action like 'ai.%' and target = ?", "canvas:" + team.canvas()))
                .as("rien n'a eu lieu, rien n'est journalisé").isZero();
    }

    @Test
    void aStrangerStillGets404NotAHintThatAiExists() throws Exception {
        Team team = newTeam();
        MockHttpSession stranger = newGuest();

        for (String route : new String[] { "sketch", "complete", "audit" }) {
            assertThat(status(post("/api/canvases/" + team.canvas() + "/ai/" + route).session(stranger)
                    .contentType("application/json").content(bodyOf(route)))).as(route).isEqualTo(404);
        }
    }

    @Test
    void aVisitorOfAPublicProjectCannotTriggerPaidCalls() throws Exception {
        Team team = newTeam();
        assertThat(status(patch("/api/projects/" + team.project()).session(team.owner())
                .contentType("application/json").content("{\"visibility\":\"public\"}"))).isEqualTo(200);
        MockHttpSession visitor = newGuest();

        assertThat(status(post("/api/canvases/" + team.canvas() + "/ai/sketch").session(visitor)
                .contentType("application/json").content(bodyOf("sketch")))).as("lecture seule : pas d'esquisse").isEqualTo(403);
        assertThat(status(post("/api/canvases/" + team.canvas() + "/ai/complete").session(visitor)
                .contentType("application/json").content("{}"))).isEqualTo(403);
        assertThat(status(post("/api/canvases/" + team.canvas() + "/ai/audit").session(visitor)))
                .as("l'audit est réservé aux membres : un visiteur ne déclenche pas d'appel payant").isEqualTo(404);
    }

    @Test
    void anInvalidBodyIsRefusedBeforeAnythingElse() throws Exception {
        Team team = newTeam();

        assertThat(status(post("/api/canvases/" + team.canvas() + "/ai/sketch").session(team.owner())
                .contentType("application/json").content("{\"brief\":\"   \"}"))).isEqualTo(400);
        assertThat(status(post("/api/canvases/" + team.canvas() + "/ai/sketch").session(team.owner())
                .contentType("application/json").content("{}"))).isEqualTo(400);
    }

    // ------------------------------------------------------------------ Outils

    private record Team(MockHttpSession owner, String project, String canvas) {
    }

    private static String bodyOf(String route) {
        return "sketch".equals(route) ? "{\"brief\":\"Une boutique en ligne\"}" : "{}";
    }

    private Team newTeam() throws Exception {
        MockHttpSession owner = newGuest();
        String project = firstId("/api/projects", owner);
        String canvas = firstId("/api/projects/" + project + "/canvases", owner);
        return new Team(owner, project, canvas);
    }

    private String firstId(String url, MockHttpSession session) throws Exception {
        return JSON.readTree(mockMvc.perform(get(url).session(session)).andReturn().getResponse().getContentAsString())
                .get(0).get("id").asText();
    }

    private MockHttpSession newGuest() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")).andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    private int status(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request).andReturn().getResponse().getStatus();
    }

    private int count(String sql, Object... params) {
        var statement = jdbc.sql(sql);
        for (Object param : params) {
            statement = statement.param(param);
        }
        return statement.query(Integer.class).single();
    }
}
