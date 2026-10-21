package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

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

import tools.jackson.databind.JsonNode;

/**
 * Plafonds de la génération avec des valeurs basses (2 générations par canvas, 5 000 octets de projet) : un projet
 * trop gros est marqué échoué avec la raison, le dépassement du nombre de générations est un 409 « Limite
 * atteinte » sans trace, supprimer libère une place, et des demandes simultanées ne dépassent jamais le plafond.
 */
@TestPropertySource(properties = {
        "lonkoo.limits.generations-per-canvas=2",
        "lonkoo.limits.generated-max-bytes=5000" })
class GenerationLimitsIntegrationTest extends AbstractPostgresIntegrationTest {

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

    @BeforeEach
    void resetRealtime() throws IOException {
        REALTIME.reset(new String(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8));
    }

    private MockHttpSession newGuest() throws Exception {
        return (MockHttpSession) mockMvc.perform(post("/api/auth/guest")).andReturn().getRequest().getSession(false);
    }

    private String canvasOf(MockHttpSession session) throws Exception {
        String project = JSON.readTree(mockMvc.perform(get("/api/projects").session(session)).andReturn().getResponse().getContentAsString())
                .get(0).get("id").asText();
        return JSON.readTree(mockMvc.perform(get("/api/projects/" + project + "/canvases").session(session)).andReturn().getResponse()
                .getContentAsString()).get(0).get("id").asText();
    }

    private MockHttpServletResponse generate(MockHttpSession session, String canvas) throws Exception {
        return mockMvc.perform(post("/api/canvases/" + canvas + "/generate").session(session)).andReturn().getResponse();
    }

    private JsonNode awaitEnd(MockHttpSession session, String id) throws Exception {
        for (int i = 0; i < 200; i++) {
            JsonNode state = JSON.readTree(mockMvc.perform(get("/api/generations/" + id).session(session)).andReturn().getResponse()
                    .getContentAsString());
            if (!state.get("status").asText().equals("PENDING") && !state.get("status").asText().equals("RUNNING")) {
                return state;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("La génération ne se termine pas");
    }

    private int stored(String canvas) {
        return jdbc.sql("select count(*) from generations where canvas_id = ?").param(UUID.fromString(canvas)).query(Integer.class).single();
    }

    @Test
    void aProjectBiggerThanTheLimitIsFailedWithTheReason() throws Exception {
        MockHttpSession guest = newGuest();
        String canvas = canvasOf(guest);

        MockHttpServletResponse response = generate(guest, canvas);
        assertThat(response.getStatus()).isEqualTo(202);
        JsonNode state = awaitEnd(guest, JSON.readTree(response.getContentAsString()).get("generationId").asText());

        assertThat(state.get("status").asText()).isEqualTo("FAILED");
        assertThat(state.get("error").asText()).contains("octets").contains("5000");
        assertThat(state.get("files").isNull()).isTrue();
        assertThat(call(get("/api/generations/" + state.get("id").asText() + "/download").session(guest)).getStatus()).isEqualTo(404);
    }

    @Test
    void theThirdGenerationOfACanvasIsRefusedAndDeletingFreesASlot() throws Exception {
        MockHttpSession guest = newGuest();
        String canvas = canvasOf(guest);
        String first = null;
        for (int i = 1; i <= 2; i++) {
            MockHttpServletResponse response = generate(guest, canvas);
            assertThat(response.getStatus()).as("génération n°%d", i).isEqualTo(202);
            String id = JSON.readTree(response.getContentAsString()).get("generationId").asText();
            awaitEnd(guest, id);
            first = first == null ? id : first;
        }

        MockHttpServletResponse refused = generate(guest, canvas);
        assertThat(refused.getStatus()).isEqualTo(409);
        assertThat(JSON.readTree(refused.getContentAsString()).get("detail").asText()).contains("Limite atteinte");
        assertThat(stored(canvas)).isEqualTo(2);

        assertThat(call(delete("/api/generations/" + first).session(guest)).getStatus()).isEqualTo(204);
        assertThat(generate(guest, canvas).getStatus()).isEqualTo(202);
    }

    @Test
    void theLimitIsPerCanvas() throws Exception {
        MockHttpSession first = newGuest();
        MockHttpSession second = newGuest();
        String firstCanvas = canvasOf(first);
        String secondCanvas = canvasOf(second);
        for (int i = 0; i < 2; i++) {
            awaitEnd(first, JSON.readTree(generate(first, firstCanvas).getContentAsString()).get("generationId").asText());
        }

        assertThat(generate(first, firstCanvas).getStatus()).isEqualTo(409);
        assertThat(generate(second, secondCanvas).getStatus()).isEqualTo(202);
    }

    @Test
    void simultaneousRequestsNeverExceedTheLimit() throws Exception {
        MockHttpSession guest = newGuest();
        String canvas = canvasOf(guest);
        int threads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> results = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            Callable<Integer> task = () -> {
                start.await();
                return generate(guest, canvas).getStatus();
            };
            results.add(pool.submit(task));
        }
        start.countDown();
        int accepted = 0;
        for (Future<Integer> result : results) {
            int status = result.get(60, TimeUnit.SECONDS);
            assertThat(status).as("seuls 202 et 409 sont possibles").isIn(202, 409);
            if (status == 202) {
                accepted++;
            }
        }
        pool.shutdown();

        assertThat(accepted).isBetween(1, 2);
        assertThat(stored(canvas)).isEqualTo(accepted);
    }

    private MockHttpServletResponse call(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request).andReturn().getResponse();
    }
}
