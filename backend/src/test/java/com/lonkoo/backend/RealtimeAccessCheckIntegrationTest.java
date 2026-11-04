package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;

import tools.jackson.databind.JsonNode;

/**
 * {@code POST /internal/canvases/{id}/access} : le rôle que des personnes ont maintenant sur un canvas, relu par le
 * serveur temps réel pour couper les connexions de qui a perdu l'accès (même règle que pour délivrer un ticket).
 */
class RealtimeAccessCheckIntegrationTest extends AbstractPostgresIntegrationTest {

    private static final String SERVICE_TOKEN = "Bearer test-service-token";

    @Autowired
    private JdbcClient jdbc;

    private record Person(MockHttpSession session, UUID id) {
    }

    @Test
    void saysWhoStillHasAccessAndWithWhichRole() throws Exception {
        Person owner = newGuest();
        Person member = newGuest();
        Person outsider = newGuest();
        String project = createProject(owner.session());
        String canvas = firstCanvasId(owner.session(), project);
        jdbc.sql("insert into project_members (project_id, user_id, role) values (?, ?, 'WRITE')")
                .param(UUID.fromString(project)).param(member.id()).update();

        JsonNode roles = roles(canvas, owner.id(), member.id(), outsider.id(), UUID.randomUUID());
        assertThat(roles.get(owner.id().toString()).asText()).isEqualTo("OWNER");
        assertThat(roles.get(member.id().toString()).asText()).isEqualTo("WRITE");
        assertThat(roles.size()).as("l'étranger et l'inconnu n'ont rien").isEqualTo(2);

        // Retiré du projet : plus de rôle.
        jdbc.sql("delete from project_members where project_id = ? and user_id = ?")
                .param(UUID.fromString(project)).param(member.id()).update();
        assertThat(roles(canvas, owner.id(), member.id()).has(member.id().toString())).isFalse();

        // Projet public : tout le monde lit, en READ ; un membre garde son rôle.
        jdbc.sql("update projects set visibility = 'public' where id = ?").param(UUID.fromString(project)).update();
        roles = roles(canvas, owner.id(), outsider.id());
        assertThat(roles.get(outsider.id().toString()).asText()).isEqualTo("READ");
        assertThat(roles.get(owner.id().toString()).asText()).isEqualTo("OWNER");

        // Repassé en privé : l'étranger perd l'accès.
        jdbc.sql("update projects set visibility = 'private' where id = ?").param(UUID.fromString(project)).update();
        assertThat(roles(canvas, owner.id(), outsider.id()).has(outsider.id().toString())).isFalse();
    }

    @Test
    void anExpiredGuestHasNoAccessEvenBeforeTheScheduledPurge() throws Exception {
        Person owner = newGuest();
        String canvas = firstCanvasId(owner.session(), createProject(owner.session()));
        assertThat(roles(canvas, owner.id()).has(owner.id().toString())).isTrue();

        jdbc.sql("update users set expires_at = now() - interval '1 minute' where id = ?").param(owner.id()).update();
        assertThat(roles(canvas, owner.id()).size()).isZero();
    }

    @Test
    void rejectsWhatIsNotAProperRequest() throws Exception {
        Person owner = newGuest();
        String canvas = firstCanvasId(owner.session(), createProject(owner.session()));
        String url = "/internal/canvases/" + canvas + "/access";

        mockMvc.perform(post(url).contentType("application/json").content("{\"userIds\":[]}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post(url).header("Authorization", "Bearer faux").contentType("application/json").content("{\"userIds\":[]}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post(url).header("Authorization", SERVICE_TOKEN).contentType("application/json").content("{\"userIds\":[\"pas-un-uuid\"]}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post(url).header("Authorization", SERVICE_TOKEN).contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest());

        StringBuilder many = new StringBuilder("{\"userIds\":[");
        for (int i = 0; i < 1001; i++) {
            many.append(i == 0 ? "" : ",").append('"').append(UUID.randomUUID()).append('"');
        }
        mockMvc.perform(post(url).header("Authorization", SERVICE_TOKEN).contentType("application/json").content(many + "]}"))
                .andExpect(status().isBadRequest());

        assertThat(roles(canvas).size()).as("liste vide : rien à dire").isZero();
        assertThat(roles(UUID.randomUUID().toString(), owner.id()).size()).as("canvas inconnu : personne n'a accès").isZero();
    }

    private JsonNode roles(String canvas, UUID... users) throws Exception {
        StringBuilder body = new StringBuilder("{\"userIds\":[");
        for (int i = 0; i < users.length; i++) {
            body.append(i == 0 ? "" : ",").append('"').append(users[i]).append('"');
        }
        body.append("]}");
        String json = mockMvc.perform(post("/internal/canvases/" + canvas + "/access")
                .header("Authorization", SERVICE_TOKEN).contentType("application/json").content(body.toString()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JSON.readTree(json).get("roles");
    }

    private Person newGuest() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")).andExpect(status().isCreated()).andReturn();
        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        String me = mockMvc.perform(get("/api/me").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return new Person(session, UUID.fromString(JSON.readTree(me).get("id").asText()));
    }

    private String createProject(MockHttpSession session) throws Exception {
        String json = mockMvc.perform(post("/api/projects").session(session)
                .contentType("application/json").content("{\"name\":\"Acces\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JSON.readTree(json).get("id").asText();
    }

    private String firstCanvasId(MockHttpSession session, String projectId) throws Exception {
        String json = mockMvc.perform(get("/api/projects/" + projectId + "/canvases").session(session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JSON.readTree(json).get(0).get("id").asText();
    }
}
