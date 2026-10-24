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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.lonkoo.backend.generation.StaleJobReaper;

import tools.jackson.databind.JsonNode;

/**
 * Un travail dont le fil d'exécution s'est perdu sans écrire son résultat restait « en cours » pour toujours et
 * bloquait toute nouvelle demande sur le canvas (409 « déjà en cours »). Le nettoyage périodique le marque échoué après
 * 30 minutes, sans toucher ce qui est récent, ce qui est terminé, ni une exécution GitHub déjà connue.
 */
class StaleJobReaperIntegrationTest extends AbstractPostgresIntegrationTest {

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

    @Autowired
    private StaleJobReaper reaper;

    @BeforeEach
    void resetRealtime() throws IOException {
        REALTIME.reset(new String(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8));
    }

    private record Setup(MockHttpSession owner, UUID canvas) {
    }

    private MockHttpServletResponse call(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request).andReturn().getResponse();
    }

    private Setup newSetup() throws Exception {
        MockHttpSession owner = (MockHttpSession) mockMvc.perform(post("/api/auth/guest")).andReturn().getRequest().getSession(false);
        String project = JSON.readTree(call(get("/api/projects").session(owner)).getContentAsString()).get(0).get("id").asText();
        UUID canvas = UUID.fromString(JSON.readTree(call(get("/api/projects/" + project + "/canvases").session(owner)).getContentAsString())
                .get(0).get("id").asText());
        return new Setup(owner, canvas);
    }

    private UUID generation(Setup setup, String status, String pushStatus, String createdAgo, String pushStartedAgo) {
        return jdbc.sql("insert into generations (canvas_id, target, status, project_name, snapshot, push_status, created_at, push_started_at) "
                + "values (?, 'spring-boot', ?, 'x', '{}'::jsonb, ?, now() - ?::interval, "
                + (pushStartedAgo == null ? "null" : "now() - ?::interval") + ") returning id")
                .params(pushStartedAgo == null
                        ? new Object[] { setup.canvas(), status, pushStatus, createdAgo }
                        : new Object[] { setup.canvas(), status, pushStatus, createdAgo, pushStartedAgo })
                .query(UUID.class).single();
    }

    private UUID deployment(UUID generation, String status, Long runId, String updatedAgo) {
        return jdbc.sql("insert into deployments (generation_id, method, status, run_id, updated_at) "
                + "values (?, 'WORKFLOW', ?, ?, now() - ?::interval) returning id")
                .param(generation).param(status).param(runId).param(updatedAgo).query(UUID.class).single();
    }

    private String generationStatus(UUID id) {
        return jdbc.sql("select status from generations where id = ?").param(id).query(String.class).single();
    }

    private String pushStatus(UUID id) {
        return jdbc.sql("select push_status from generations where id = ?").param(id).query(String.class).single();
    }

    private String deploymentStatus(UUID id) {
        return jdbc.sql("select status from deployments where id = ?").param(id).query(String.class).single();
    }

    @Test
    void aGenerationLostForOverHalfAnHourIsMarkedFailedButARecentOrFinishedOneIsNot() throws Exception {
        Setup setup = newSetup();
        UUID lostRunning = generation(setup, "RUNNING", null, "2 hours", null);
        UUID lostPending = generation(setup, "PENDING", null, "45 minutes", null);
        UUID recent = generation(setup, "RUNNING", null, "2 minutes", null);
        UUID finished = generation(setup, "DONE", null, "5 hours", null);

        reaper.reap();

        assertThat(generationStatus(lostRunning)).isEqualTo("FAILED");
        assertThat(generationStatus(lostPending)).isEqualTo("FAILED");
        assertThat(generationStatus(recent)).isEqualTo("RUNNING");
        assertThat(generationStatus(finished)).isEqualTo("DONE");
        var row = jdbc.sql("select error, finished_at is not null as ended from generations where id = ?").param(lostRunning).query().singleRow();
        assertThat(row.get("error").toString()).contains("relancez");
        assertThat(row).containsEntry("ended", true);
    }

    @Test
    void aPushLostForOverHalfAnHourIsMarkedFailedUsingItsStartTime() throws Exception {
        Setup setup = newSetup();
        UUID lost = generation(setup, "DONE", "RUNNING", "3 hours", "2 hours");
        UUID recentPushOnOldGeneration = generation(setup, "DONE", "RUNNING", "3 hours", "1 minute");
        UUID oldRowWithoutStartTime = generation(setup, "DONE", "RUNNING", "3 hours", null);
        UUID done = generation(setup, "DONE", "DONE", "3 hours", "2 hours");

        reaper.reap();

        assertThat(pushStatus(lost)).isEqualTo("FAILED");
        assertThat(pushStatus(recentPushOnOldGeneration)).as("la date de la génération n'entre pas en compte").isEqualTo("RUNNING");
        assertThat(pushStatus(oldRowWithoutStartTime)).as("sans heure de début, la création sert de repère").isEqualTo("FAILED");
        assertThat(pushStatus(done)).isEqualTo("DONE");
        assertThat(jdbc.sql("select push_error from generations where id = ?").param(lost).query(String.class).single()).contains("réessayez");
        assertThat(generationStatus(lost)).as("la génération elle-même reste réussie").isEqualTo("DONE");
    }

    @Test
    void onlyDeploymentsThatCannotResolveByThemselvesAreMarkedFailed() throws Exception {
        Setup setup = newSetup();
        UUID generation = generation(setup, "DONE", "DONE", "1 hour", null);
        UUID lostLaunch = deployment(generation, "PENDING", null, "1 hour");
        UUID neverAppeared = deployment(generation, "RUNNING", null, "1 hour");
        UUID knownRunStillFollowed = deployment(generation, "RUNNING", 42L, "10 hours");
        UUID recent = deployment(generation, "PENDING", null, "1 minute");
        UUID manual = deployment(generation, "MANUAL", null, "10 hours");

        reaper.reap();

        assertThat(deploymentStatus(lostLaunch)).isEqualTo("FAILED");
        assertThat(deploymentStatus(neverAppeared)).isEqualTo("FAILED");
        assertThat(deploymentStatus(knownRunStillFollowed)).as("sa lecture le ramène à l'état réel").isEqualTo("RUNNING");
        assertThat(deploymentStatus(recent)).isEqualTo("PENDING");
        assertThat(deploymentStatus(manual)).isEqualTo("MANUAL");
        assertThat(jdbc.sql("select detail from deployments where id = ?").param(lostLaunch).query(String.class).single()).contains("relancez");
        assertThat(jdbc.sql("select detail from deployments where id = ?").param(neverAppeared).query(String.class).single()).contains("jamais apparue");
    }

    @Test
    void aCanvasBlockedByALostGenerationAcceptsANewOneAfterTheCleanup() throws Exception {
        Setup setup = newSetup();
        generation(setup, "RUNNING", null, "2 hours", null);

        MockHttpServletResponse blocked = call(post("/api/canvases/" + setup.canvas() + "/generate").session(setup.owner()));
        assertThat(blocked.getStatus()).as("avant : bloqué par un travail perdu").isEqualTo(409);

        reaper.reap();

        MockHttpServletResponse accepted = call(post("/api/canvases/" + setup.canvas() + "/generate").session(setup.owner()));
        assertThat(accepted.getStatus()).as(accepted.getContentAsString()).isEqualTo(202);
        JsonNode state = null;
        for (int i = 0; i < 200; i++) {
            state = JSON.readTree(call(get("/api/generations/" + JSON.readTree(accepted.getContentAsString()).get("generationId").asText())
                    .session(setup.owner())).getContentAsString());
            if (state.get("status").asText().equals("DONE")) {
                break;
            }
            Thread.sleep(100);
        }
        assertThat(state.get("status").asText()).isEqualTo("DONE");
    }
}
