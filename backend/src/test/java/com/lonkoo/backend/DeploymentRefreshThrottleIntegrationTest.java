package com.lonkoo.backend;

import org.springframework.beans.factory.annotation.Autowired;
import com.lonkoo.backend.security.GithubTokenStore;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import tools.jackson.databind.JsonNode;

/**
 * Le suivi d'un déploiement est limité (une lecture de GitHub par intervalle), mais un suivi plus fréquent que cet
 * intervalle ne doit jamais l'empêcher de se rafraîchir : l'interface interroge toutes les 1,5 s pour un intervalle
 * de 3 s. (Régression trouvée dans le navigateur : l'horodatage était repoussé à chaque lecture refusée.)
 */
class DeploymentRefreshThrottleIntegrationTest extends AbstractPostgresIntegrationTest {

    /** Le jeton GitHub n'est pas un attribut de session : il vit dans le magasin en mémoire du serveur. */
    @Autowired
    private GithubTokenStore tokens;
    private static final long INTERVAL_MILLIS = 400;
    private static final FakeRealtimeServer REALTIME = FakeRealtimeServer.start();
    private static final FakeGithubApiServer GITHUB = FakeGithubApiServer.start();

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("realtime.internal-url", () -> "http://127.0.0.1:" + REALTIME.port());
        registry.add("github.api.base-url", GITHUB::url);
        registry.add("github.api.retry-delay-millis", () -> "5");
        registry.add("lonkoo.deployments.refresh-millis", () -> String.valueOf(INTERVAL_MILLIS));
    }

    @AfterAll
    static void stopServers() {
        REALTIME.server.stop(0);
        GITHUB.server.stop(0);
    }

    @BeforeEach
    void reset() throws IOException {
        REALTIME.reset(new String(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8));
        GITHUB.reset();
        GITHUB.scopes = "repo, read:user, workflow";
    }

    private MockHttpServletResponse call(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request).andReturn().getResponse();
    }

    private JsonNode read(MockHttpSession session, String id) throws Exception {
        return JSON.readTree(call(get("/api/deployments/" + id).session(session)).getContentAsString());
    }

    @Test
    void pollingMoreOftenThanTheIntervalStillRefreshesAndDoesNotFloodGithub() throws Exception {
        MockHttpSession owner = (MockHttpSession) mockMvc.perform(post("/api/auth/guest")).andReturn().getRequest().getSession(false);
        String project = JSON.readTree(call(get("/api/projects").session(owner)).getContentAsString()).get(0).get("id").asText();
        String canvas = JSON.readTree(call(get("/api/projects/" + project + "/canvases").session(owner)).getContentAsString())
                .get(0).get("id").asText();
        String generation = JSON.readTree(call(post("/api/canvases/" + canvas + "/generate").session(owner)).getContentAsString())
                .get("generationId").asText();
        tokens.put(owner.getId(), GITHUB.token);
        awaitDone(owner, generation, false);
        call(post("/api/generations/" + generation + "/push-github").session(owner));
        assertThat(awaitDone(owner, generation, true).get("push").get("status").asText()).isEqualTo("DONE");
        String id = JSON.readTree(call(post("/api/generations/" + generation + "/deploy").session(owner)).getContentAsString())
                .get("id").asText();
        for (int i = 0; i < 100 && JSON.readTree(call(get("/api/generations/" + generation + "/deployments").session(owner))
                .getContentAsString()).get(0).get("runUrl").isNull(); i++) {
            Thread.sleep(50);
        }
        GITHUB.calls.clear();

        // 24 lectures en 1,2 s, soit toutes les 50 ms : bien plus vite que l'intervalle de 400 ms.
        long end = System.currentTimeMillis() + 1200;
        int reads = 0;
        while (System.currentTimeMillis() < end) {
            read(owner, id);
            reads++;
            Thread.sleep(50);
        }
        int githubReads = GITHUB.callsTo("GET", "/actions/runs/").size();
        assertThat(reads).isGreaterThan(15);
        assertThat(githubReads).as("limité : environ une lecture par intervalle").isBetween(2, 5);

        // Et un changement chez GitHub finit par être vu malgré ce suivi serré.
        GITHUB.lastRun().status = "completed";
        GITHUB.lastRun().conclusion = "success";
        String status = "";
        long deadline = System.currentTimeMillis() + 3000;
        while (System.currentTimeMillis() < deadline && !status.equals("DEPLOYED")) {
            status = read(owner, id).get("status").asText();
            Thread.sleep(50);
        }
        assertThat(status).isEqualTo("DEPLOYED");
    }

    private JsonNode awaitDone(MockHttpSession session, String generation, boolean push) throws Exception {
        for (int i = 0; i < 300; i++) {
            JsonNode state = JSON.readTree(call(get("/api/generations/" + generation).session(session)).getContentAsString());
            String status = push ? state.get("push").get("status").asText("") : state.get("status").asText();
            if (status.equals("DONE") || status.equals("FAILED")) {
                return state;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Le travail ne se termine pas");
    }
}
