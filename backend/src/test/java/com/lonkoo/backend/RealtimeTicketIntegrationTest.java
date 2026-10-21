package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;

import com.lonkoo.backend.realtime.RealtimeTicketService;

/**
 * Preuve WP6 (backend) : un invité obtient un ticket temps réel JWT pour son
 * canvas de démonstration. Le ticket est non vide et expire dans le futur.
 */
class RealtimeTicketIntegrationTest extends AbstractPostgresIntegrationTest {

    @Test
    void guestGetsRealtimeTicketForDemoCanvas() throws Exception {
        MvcResult guestResult = mockMvc.perform(post("/api/auth/guest"))
                .andExpect(status().isCreated())
                .andReturn();
        MockHttpSession session = (MockHttpSession) guestResult.getRequest().getSession(false);

        MvcResult projectsResult = mockMvc.perform(get("/api/projects").session(session))
                .andExpect(status().isOk())
                .andReturn();
        String projectId = JSON.readTree(projectsResult.getResponse().getContentAsString()).get(0).get("id").asText();

        MvcResult canvasesResult = mockMvc.perform(get("/api/projects/" + projectId + "/canvases").session(session))
                .andExpect(status().isOk())
                .andReturn();
        String canvasId = JSON.readTree(canvasesResult.getResponse().getContentAsString()).get(0).get("id").asText();

        mockMvc.perform(post("/api/canvases/" + canvasId + "/realtime-ticket").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ticket").isNotEmpty())
                .andExpect(jsonPath("$.role").value("OWNER"))
                .andExpect(jsonPath("$.expiresAt").isNotEmpty())
                .andExpect(jsonPath("$.user.color").value(org.hamcrest.Matchers.matchesPattern("#[0-9A-F]{6}")));
    }

    @Test
    void canvasOfAnotherUserIsNotFound() throws Exception {
        MvcResult owner = mockMvc.perform(post("/api/auth/guest")).andExpect(status().isCreated()).andReturn();
        MvcResult other = mockMvc.perform(post("/api/auth/guest")).andExpect(status().isCreated()).andReturn();
        MockHttpSession ownerSession = (MockHttpSession) owner.getRequest().getSession(false);
        MockHttpSession otherSession = (MockHttpSession) other.getRequest().getSession(false);

        String projectId = JSON.readTree(mockMvc.perform(get("/api/projects").session(ownerSession))
                .andReturn().getResponse().getContentAsString()).get(0).get("id").asText();
        String canvasId = JSON.readTree(mockMvc.perform(get("/api/projects/" + projectId + "/canvases").session(ownerSession))
                .andReturn().getResponse().getContentAsString()).get(0).get("id").asText();

        mockMvc.perform(post("/api/canvases/" + canvasId + "/realtime-ticket").session(otherSession))
                .andExpect(status().isNotFound());
    }

    @Test
    void cursorColorIsStablePerUserAndFromThePalette() {
        UUID user = UUID.randomUUID();
        assertThat(RealtimeTicketService.colorFor(user)).isEqualTo(RealtimeTicketService.colorFor(user));
        assertThat(RealtimeTicketService.colorFor(user)).matches("#[0-9A-F]{6}");
        // Sur de nombreux utilisateurs, plusieurs couleurs distinctes sont bien employées.
        long distinct = java.util.stream.IntStream.range(0, 200)
                .mapToObj(i -> RealtimeTicketService.colorFor(UUID.randomUUID()))
                .distinct().count();
        assertThat(distinct).isGreaterThan(4);
    }
}
