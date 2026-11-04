package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

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

import com.lonkoo.backend.generation.GenerationService;

import tools.jackson.databind.JsonNode;

/**
 * API de génération de projets (lot R8) : lancement asynchrone, état, fichiers, archive, accès, reprise après un
 * redémarrage. L'envoi sur GitHub et le déploiement ont leurs propres tests.
 */
class GenerationApiIntegrationTest extends AbstractPostgresIntegrationTest {

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
    private GenerationService generationService;

    private String seed;

    @BeforeEach
    void resetRealtime() throws IOException {
        seed = new String(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        REALTIME.reset(seed);
    }

    private record Setup(MockHttpSession owner, String project, String canvas) {
    }

    private Setup newSetup() throws Exception {
        MockHttpSession owner = newGuest();
        String project = JSON.readTree(call(get("/api/projects").session(owner)).getContentAsString()).get(0).get("id").asText();
        String canvas = JSON.readTree(call(get("/api/projects/" + project + "/canvases").session(owner)).getContentAsString()).get(0).get("id").asText();
        return new Setup(owner, project, canvas);
    }

    private MockHttpSession newGuest() throws Exception {
        var result = mockMvc.perform(post("/api/auth/guest")).andReturn();
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    private MockHttpServletResponse call(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request).andReturn().getResponse();
    }

    private UUID userId(MockHttpSession session) throws Exception {
        return UUID.fromString(JSON.readTree(call(get("/api/me").session(session)).getContentAsString()).get("id").asText());
    }

    private MockHttpSession memberWithRole(Setup setup, String role) throws Exception {
        MockHttpSession member = newGuest();
        jdbc.sql("insert into project_members (project_id, user_id, role) values (?, ?, ?)")
                .param(UUID.fromString(setup.project())).param(userId(member)).param(role).update();
        return member;
    }

    private String generate(MockHttpSession session, String canvas, String body) throws Exception {
        var request = post("/api/canvases/" + canvas + "/generate").session(session);
        if (body != null) {
            request = request.contentType("application/json").content(body);
        }
        MockHttpServletResponse response = call(request);
        assertThat(response.getStatus()).as(response.getContentAsString()).isEqualTo(202);
        return JSON.readTree(response.getContentAsString()).get("generationId").asText();
    }

    /** Attend la fin du travail asynchrone (au plus 20 s) et rend l'état de la génération. */
    private JsonNode await(MockHttpSession session, String generation) throws Exception {
        for (int i = 0; i < 200; i++) {
            JsonNode state = JSON.readTree(call(get("/api/generations/" + generation).session(session)).getContentAsString());
            String status = state.get("status").asText();
            if (status.equals("DONE") || status.equals("FAILED")) {
                return state;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("La génération ne se termine pas");
    }

    // ------------------------------------------------------------------ Lancement et état

    @Test
    void generatingTheCurrentCanvasAnswers202ThenReportsTheFinishedProject() throws Exception {
        Setup setup = newSetup();

        MockHttpServletResponse response = call(post("/api/canvases/" + setup.canvas() + "/generate").session(setup.owner()));
        assertThat(response.getStatus()).isEqualTo(202);
        String id = JSON.readTree(response.getContentAsString()).get("generationId").asText();

        JsonNode state = await(setup.owner(), id);
        assertThat(state.get("status").asText()).as(state.toString()).isEqualTo("DONE");
        assertThat(state.get("target").asText()).isEqualTo("spring-boot");
        assertThat(state.get("slug").asText()).isNotEmpty();
        assertThat(state.get("fileCount").asInt()).isBetween(25, 60);
        assertThat(state.get("totalBytes").asLong()).isGreaterThan(5_000);
        assertThat(state.get("error").isNull()).isTrue();
        assertThat(state.get("versionId").isNull()).isTrue();
        assertThat(state.get("push").get("status").isNull()).isTrue();
        List<String> paths = new ArrayList<>();
        state.get("files").forEach(file -> paths.add(file.get("path").asText()));
        assertThat(paths).contains("README.md", "openapi.yaml", "docker-compose.yml", ".github/workflows/deploy-systalink.yml")
                .anyMatch(p -> p.endsWith("/domain/Produit.java"));
        assertThat(count("select count(*) from audit_log where action = 'generation.created' and target = ?", "canvas:" + setup.canvas())).isEqualTo(1);
    }

    @Test
    void aNamedVersionIsGeneratedFromItsFrozenSnapshotEvenWithoutTheRealtimeServer() throws Exception {
        Setup setup = newSetup();
        String version = JSON.readTree(call(post("/api/canvases/" + setup.canvas() + "/versions").session(setup.owner())
                .contentType("application/json").content("{\"name\":\"v1\"}")).getContentAsString()).get("id").asText();
        REALTIME.snapshotStatus = 503;

        String id = generate(setup.owner(), setup.canvas(), "{\"versionId\":\"" + version + "\",\"projectName\":\"Ma boutique\"}");
        JsonNode state = await(setup.owner(), id);

        assertThat(state.get("status").asText()).isEqualTo("DONE");
        assertThat(state.get("versionId").asText()).isEqualTo(version);
        assertThat(state.get("projectName").asText()).isEqualTo("Ma boutique");
        assertThat(state.get("slug").asText()).isEqualTo("ma-boutique");
        REALTIME.snapshotStatus = 200;
    }

    @Test
    void theRealtimeServerBeingDownIsABadGatewayWhenTheCurrentStateIsNeeded() throws Exception {
        Setup setup = newSetup();
        REALTIME.snapshotStatus = 503;

        MockHttpServletResponse response = call(post("/api/canvases/" + setup.canvas() + "/generate").session(setup.owner()));

        assertThat(response.getStatus()).isEqualTo(502);
        assertThat(count("select count(*) from generations where canvas_id = ?", UUID.fromString(setup.canvas()))).isZero();
        REALTIME.snapshotStatus = 200;
    }

    @Test
    void anInvalidCanvasIsRefusedWith422AndNothingIsStored() throws Exception {
        Setup setup = newSetup();
        REALTIME.reset("{\"schemaVersion\":1,\"nodes\":[{\"id\":\"n1\",\"type\":\"service\",\"position\":{\"x\":0,\"y\":0},\"data\":{\"name\":\"class\"}}],\"edges\":[]}");

        MockHttpServletResponse response = call(post("/api/canvases/" + setup.canvas() + "/generate").session(setup.owner()));

        assertThat(response.getStatus()).isEqualTo(422);
        assertThat(response.getContentAsString()).contains("réservé");
        assertThat(count("select count(*) from generations where canvas_id = ?", UUID.fromString(setup.canvas()))).isZero();
    }

    @Test
    void theBodyIsValidated() throws Exception {
        Setup setup = newSetup();

        assertThat(call(post("/api/canvases/" + setup.canvas() + "/generate").session(setup.owner()).contentType("application/json")
                .content("{\"target\":\"cobol\"}")).getStatus()).isEqualTo(400);
        assertThat(call(post("/api/canvases/" + setup.canvas() + "/generate").session(setup.owner()).contentType("application/json")
                .content("{\"projectName\":\"" + "x".repeat(81) + "\"}")).getStatus()).isEqualTo(400);
        assertThat(call(post("/api/canvases/" + setup.canvas() + "/generate").session(setup.owner()).contentType("application/json")
                .content("{\"versionId\":\"pas-un-uuid\"}")).getStatus()).isEqualTo(400);
    }

    @Test
    void aVersionOfAnotherCanvasIsNotFound() throws Exception {
        Setup first = newSetup();
        Setup second = newSetup();
        String foreign = JSON.readTree(call(post("/api/canvases/" + second.canvas() + "/versions").session(second.owner())
                .contentType("application/json").content("{\"name\":\"v1\"}")).getContentAsString()).get("id").asText();

        MockHttpServletResponse response = call(post("/api/canvases/" + first.canvas() + "/generate").session(first.owner())
                .contentType("application/json").content("{\"versionId\":\"" + foreign + "\"}"));

        assertThat(response.getStatus()).isEqualTo(404);
    }

    @Test
    void aSecondGenerationWhileOneIsRunningIsRefused() throws Exception {
        Setup setup = newSetup();
        jdbc.sql("insert into generations (canvas_id, target, status, project_name, snapshot) values (?, 'spring-boot', 'RUNNING', 'x', '{}'::jsonb)")
                .param(UUID.fromString(setup.canvas())).update();

        MockHttpServletResponse response = call(post("/api/canvases/" + setup.canvas() + "/generate").session(setup.owner()));

        assertThat(response.getStatus()).isEqualTo(409);
        assertThat(JSON.readTree(response.getContentAsString()).get("title").asText()).isEqualTo("Conflit");
    }

    // ------------------------------------------------------------------ Fichiers et archive

    @Test
    void filesAreReadableAndTheArchiveIsComplete() throws Exception {
        Setup setup = newSetup();
        String id = generate(setup.owner(), setup.canvas(), null);
        JsonNode state = await(setup.owner(), id);

        MockHttpServletResponse readme = call(get("/api/generations/" + id + "/files").param("path", "README.md").session(setup.owner()));
        assertThat(readme.getStatus()).isEqualTo(200);
        assertThat(readme.getContentType()).startsWith("text/plain");
        assertThat(readme.getContentAsString(StandardCharsets.UTF_8)).startsWith("# ").contains("docker compose up --build");
        assertThat(call(get("/api/generations/" + id + "/files").param("path", "../../etc/passwd").session(setup.owner())).getStatus()).isEqualTo(404);
        assertThat(call(get("/api/generations/" + id + "/files").param("path", "inconnu.txt").session(setup.owner())).getStatus()).isEqualTo(404);

        MockHttpServletResponse zip = call(get("/api/generations/" + id + "/download").session(setup.owner()));
        assertThat(zip.getStatus()).isEqualTo(200);
        assertThat(zip.getContentType()).isEqualTo("application/zip");
        assertThat(zip.getHeader("Content-Disposition")).contains("attachment").contains(state.get("slug").asText() + ".zip");
        List<String> entries = new ArrayList<>();
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip.getContentAsByteArray()))) {
            for (ZipEntry entry = in.getNextEntry(); entry != null; entry = in.getNextEntry()) {
                entries.add(entry.getName());
            }
        }
        assertThat(entries).hasSize(state.get("fileCount").asInt())
                .allMatch(name -> name.startsWith(state.get("slug").asText() + "/") && !name.contains(".."))
                .contains(state.get("slug").asText() + "/README.md");
        assertThat(call(get("/api/generations/" + id + "/download").session(setup.owner())).getContentAsByteArray())
                .as("la même archive à chaque téléchargement").isEqualTo(zip.getContentAsByteArray());
    }

    // ------------------------------------------------------------------ Accès

    @Test
    void accessFollowsTheRolesOfTheCanvas() throws Exception {
        Setup setup = newSetup();
        String id = generate(setup.owner(), setup.canvas(), null);
        await(setup.owner(), id);
        MockHttpSession reader = memberWithRole(setup, "READ");
        MockHttpSession triage = memberWithRole(setup, "TRIAGE");
        MockHttpSession writer = memberWithRole(setup, "WRITE");
        MockHttpSession stranger = newGuest();

        // Lire : tout membre. Étranger : 404, jamais 403.
        for (MockHttpSession member : List.of(reader, triage, writer, setup.owner())) {
            assertThat(call(get("/api/generations/" + id).session(member)).getStatus()).isEqualTo(200);
            assertThat(call(get("/api/canvases/" + setup.canvas() + "/generations").session(member)).getStatus()).isEqualTo(200);
            assertThat(call(get("/api/generations/" + id + "/download").session(member)).getStatus()).isEqualTo(200);
        }
        assertThat(call(get("/api/generations/" + id).session(stranger)).getStatus()).isEqualTo(404);
        assertThat(call(get("/api/generations/" + id + "/files").param("path", "README.md").session(stranger)).getStatus()).isEqualTo(404);
        assertThat(call(get("/api/generations/" + id + "/download").session(stranger)).getStatus()).isEqualTo(404);
        assertThat(call(get("/api/canvases/" + setup.canvas() + "/generations").session(stranger)).getStatus()).isEqualTo(404);
        assertThat(call(post("/api/canvases/" + setup.canvas() + "/generate").session(stranger)).getStatus()).isEqualTo(404);
        assertThat(call(delete("/api/generations/" + id).session(stranger)).getStatus()).isEqualTo(404);

        // Écrire (générer, supprimer) : WRITE et plus.
        for (MockHttpSession weak : List.of(reader, triage)) {
            assertThat(call(post("/api/canvases/" + setup.canvas() + "/generate").session(weak)).getStatus()).isEqualTo(403);
            assertThat(call(delete("/api/generations/" + id).session(weak)).getStatus()).isEqualTo(403);
        }
        assertThat(call(get("/api/generations/" + id)).getStatus()).isEqualTo(401);
        assertThat(call(post("/api/canvases/" + setup.canvas() + "/generate")).getStatus()).isEqualTo(401);

        String byWriter = generate(writer, setup.canvas(), null);
        await(writer, byWriter);
        assertThat(call(delete("/api/generations/" + byWriter).session(writer)).getStatus()).isEqualTo(204);
        assertThat(call(get("/api/generations/" + byWriter).session(writer)).getStatus()).isEqualTo(404);
    }

    @Test
    void deletingARunningGenerationIsRefused() throws Exception {
        Setup setup = newSetup();
        UUID id = jdbc.sql("insert into generations (canvas_id, target, status, project_name, snapshot) values (?, 'spring-boot', 'RUNNING', 'x', '{}'::jsonb) returning id")
                .param(UUID.fromString(setup.canvas())).query(UUID.class).single();

        assertThat(call(delete("/api/generations/" + id).session(setup.owner())).getStatus()).isEqualTo(409);
    }

    @Test
    void deletingTheProjectDeletesItsGenerations() throws Exception {
        Setup setup = newSetup();
        await(setup.owner(), generate(setup.owner(), setup.canvas(), null));

        assertThat(call(delete("/api/projects/" + setup.project()).session(setup.owner())).getStatus()).isEqualTo(204);

        assertThat(count("select count(*) from generations where canvas_id = ?", UUID.fromString(setup.canvas()))).isZero();
    }

    // ------------------------------------------------------------------ Redémarrage

    @Test
    void workInterruptedByARestartIsMarkedFailedAtStartup() throws Exception {
        Setup setup = newSetup();
        UUID running = jdbc.sql("insert into generations (canvas_id, target, status, project_name, snapshot) values (?, 'spring-boot', 'RUNNING', 'x', '{}'::jsonb) returning id")
                .param(UUID.fromString(setup.canvas())).query(UUID.class).single();
        UUID pushing = jdbc.sql("insert into generations (canvas_id, target, status, project_name, snapshot, push_status) values (?, 'spring-boot', 'DONE', 'x', '{}'::jsonb, 'RUNNING') returning id")
                .param(UUID.fromString(setup.canvas())).query(UUID.class).single();

        generationService.recoverInterruptedJobs();

        JsonNode state = JSON.readTree(call(get("/api/generations/" + running).session(setup.owner())).getContentAsString());
        assertThat(state.get("status").asText()).isEqualTo("FAILED");
        assertThat(state.get("error").asText()).contains("redémarrage");
        JsonNode push = JSON.readTree(call(get("/api/generations/" + pushing).session(setup.owner())).getContentAsString()).get("push");
        assertThat(push.get("status").asText()).isEqualTo("FAILED");
        assertThat(push.get("error").asText()).contains("redémarrage");
    }

    private int count(String sql, Object param) {
        return jdbc.sql(sql).param(param).query(Integer.class).single();
    }
}
