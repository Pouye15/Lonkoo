package com.lonkoo.backend;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Preuve WP5 : un invité crée un projet, le liste, crée un lien de partage,
 * puis un second invité rejoint via le lien et voit le canvas.
 */
class ProjectFlowIntegrationTest extends AbstractPostgresIntegrationTest {

    @Test
    void guestCreatesProjectAndSharesCanvasWithSecondGuest() throws Exception {
        // Premier invité (propriétaire).
        MvcResult ownerResult = mockMvc.perform(post("/api/auth/guest"))
                .andExpect(status().isCreated())
                .andReturn();
        MockHttpSession ownerSession = sessionOf(ownerResult);

        // Crée un projet.
        MvcResult createResult = mockMvc.perform(post("/api/projects").session(ownerSession)
                .contentType("application/json")
                .content("{\"name\":\"Projet Test\",\"description\":\"Description\",\"visibility\":\"private\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Projet Test"))
                .andReturn();
        String projectId = JSON.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        // Le projet apparaît dans la liste (les invités ont aussi leur projet « Démo », créé avant).
        mockMvc.perform(get("/api/projects").session(ownerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '" + projectId + "')]").isNotEmpty());

        // Le projet a un canvas « Architecture » créé automatiquement.
        MvcResult canvasResult = mockMvc.perform(get("/api/projects/" + projectId + "/canvases").session(ownerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Architecture"))
                .andReturn();
        String canvasId = JSON.readTree(canvasResult.getResponse().getContentAsString()).get(0).get("id").asText();

        // Crée un lien de partage en écriture.
        MvcResult shareResult = mockMvc.perform(post("/api/canvases/" + canvasId + "/share-links").session(ownerSession)
                .contentType("application/json")
                .content("{\"role\":\"WRITE\",\"ttlHours\":72}"))
                .andExpect(status().isCreated())
                .andReturn();
        String shareUrl = JSON.readTree(shareResult.getResponse().getContentAsString()).get("url").asText();
        String token = shareUrl.substring(shareUrl.lastIndexOf('/') + 1);

        // Second invité : rejoint via le lien (sans session préalable).
        MvcResult joinResult = mockMvc.perform(post("/api/join/" + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canvasId").value(canvasId))
                .andExpect(jsonPath("$.role").value("WRITE"))
                .andReturn();
        MockHttpSession joinedSession = sessionOf(joinResult);

        // Le second invité voit désormais le canvas.
        mockMvc.perform(get("/api/canvases/" + canvasId).session(joinedSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("WRITE"));
    }

    @Test
    void patchProjectByGuestOwnerWorks() throws Exception {
        MvcResult ownerResult = mockMvc.perform(post("/api/auth/guest"))
                .andExpect(status().isCreated())
                .andReturn();
        MockHttpSession ownerSession = sessionOf(ownerResult);

        MvcResult createResult = mockMvc.perform(post("/api/projects").session(ownerSession)
                .contentType("application/json")
                .content("{\"name\":\"Avant\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        String projectId = JSON.readTree(createResult.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(patch("/api/projects/" + projectId).session(ownerSession)
                .contentType("application/json")
                .content("{\"name\":\"Après\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Après"));
    }

    private MockHttpSession sessionOf(MvcResult result) {
        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        org.assertj.core.api.Assertions.assertThat(session).isNotNull();
        return session;
    }
}
