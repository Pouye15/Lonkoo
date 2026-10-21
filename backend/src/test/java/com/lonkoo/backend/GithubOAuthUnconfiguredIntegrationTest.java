package com.lonkoo.backend;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;

/**
 * Sans application OAuth configurée (identifiants absents ou d'exemple, cas du profil de test et d'un
 * poste neuf), l'application démarre et les routes GitHub répondent 503 au lieu d'envoyer
 * l'utilisateur chez GitHub avec un identifiant bidon.
 */
class GithubOAuthUnconfiguredIntegrationTest extends AbstractPostgresIntegrationTest {

    @Test
    void loginIsUnavailableUntilTheGithubApplicationIsConfigured() throws Exception {
        mockMvc.perform(get("/api/auth/github/login"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.detail").value(containsString("n'est pas configurée")));
    }

    @Test
    void theCallbackIsUnavailableToo() throws Exception {
        mockMvc.perform(get("/api/auth/github/callback").param("code", "c").param("state", "s"))
                .andExpect(status().isServiceUnavailable());
        mockMvc.perform(get("/api/auth/github/callback").param("error", "access_denied"))
                .andExpect(status().isServiceUnavailable());
    }
}
