package com.lonkoo.backend;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;

/**
 * Preuve WP4a : un invité est créé, ouvre une session serveur, lit son profil,
 * puis se déconnecte. Sans session : 401. Avec une mauvaise Origin : 403.
 */
class AuthFlowIntegrationTest extends AbstractPostgresIntegrationTest {

    @Test
    void guestCreatesSessionReadsProfileAndLogsOut() throws Exception {
        var result = mockMvc.perform(post("/api/auth/guest"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.isGuest").value(true))
                .andExpect(jsonPath("$.login").isNotEmpty())
                .andReturn();

        // MockMvc ne pose pas automatiquement le cookie JSESSIONID : on récupère
        // la session créée par le contrôleur et on la rejoue sur les appels suivants.
        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        org.assertj.core.api.Assertions.assertThat(session).isNotNull();

        mockMvc.perform(get("/api/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isGuest").value(true));

        mockMvc.perform(post("/api/auth/logout").session(session))
                .andExpect(status().isNoContent());
    }

    @Test
    void meWithoutSessionReturnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void guestWithUnknownOriginIsRejected() throws Exception {
        mockMvc.perform(post("/api/auth/guest").header("Origin", "https://evil.example.com"))
                .andExpect(status().isForbidden());
    }
}
