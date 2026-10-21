package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.function.IntSupplier;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Les plafonds par défaut (sans réglage) : ceux que documentent {@code .env.example} et
 * {@code docs/openapi.yaml}, au cran près, sans gêner un usage normal en dessous.
 */
class UsageLimitsDefaultsIntegrationTest extends AbstractPostgresIntegrationTest {

    private static final FakeRealtimeServer REALTIME = FakeRealtimeServer.start();

    @DynamicPropertySource
    static void realtimeProperties(DynamicPropertyRegistry registry) {
        registry.add("realtime.internal-url", () -> "http://127.0.0.1:" + REALTIME.port());
    }

    @AfterAll
    static void stopRealtime() {
        REALTIME.server.stop(0);
    }

    @Value("${lonkoo.limits.guest-projects}")
    private int guestProjects;
    @Value("${lonkoo.limits.account-projects}")
    private int accountProjects;
    @Value("${lonkoo.limits.canvases-per-project}")
    private int canvasesPerProject;
    @Value("${lonkoo.limits.versions-per-canvas}")
    private int versionsPerCanvas;
    @Value("${lonkoo.limits.share-links-per-canvas}")
    private int shareLinksPerCanvas;
    @Value("${lonkoo.limits.snapshot-max-bytes}")
    private int snapshotMaxBytes;

    @BeforeEach
    void resetRealtime() throws IOException {
        REALTIME.reset(new String(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8));
    }

    @Test
    void theDefaultsAreTheDocumentedOnes() {
        assertThat(guestProjects).isEqualTo(20);
        assertThat(accountProjects).isEqualTo(100);
        assertThat(canvasesPerProject).isEqualTo(10);
        assertThat(versionsPerCanvas).isEqualTo(50);
        assertThat(shareLinksPerCanvas).isEqualTo(20);
        assertThat(snapshotMaxBytes).isEqualTo(1024 * 1024);
    }

    @Test
    void aGuestGetsExactlyTwentyProjectsTenCanvasesFiftyVersionsAndTwentyLinks() throws Exception {
        MockHttpSession guest = newGuest();   // arrive avec un projet et son premier canvas
        String project = idAt("/api/projects", guest);
        String canvas = idAt("/api/projects/" + project + "/canvases", guest);

        // Un usage normal passe largement.
        assertThat(status(post("/api/projects/" + project + "/canvases"), guest, "{\"name\":\"api\"}")).isEqualTo(201);
        assertThat(status(post("/api/canvases/" + canvas + "/versions"), guest, "{\"name\":\"v1\"}")).isEqualTo(201);
        assertThat(status(post("/api/canvases/" + canvas + "/share-links"), guest, "{\"role\":\"READ\"}")).isEqualTo(201);

        fillUntilRefused(canvasesPerProject - 2, () -> status(post("/api/projects/" + project + "/canvases"), guest, "{\"name\":\"c\"}"), "canvas");
        fillUntilRefused(versionsPerCanvas - 1, () -> status(post("/api/canvases/" + canvas + "/versions"), guest, "{\"name\":\"v\"}"), "versions");
        fillUntilRefused(shareLinksPerCanvas - 1, () -> status(post("/api/canvases/" + canvas + "/share-links"), guest, "{\"role\":\"READ\"}"), "liens");
        fillUntilRefused(guestProjects - 1, () -> status(post("/api/projects"), guest, "{\"name\":\"p\"}"), "projets");
    }

    /** {@code accepted} créations de plus passent (201) ; la suivante est refusée en 409. */
    private static void fillUntilRefused(int accepted, IntSupplier create, String what) {
        for (int i = 1; i <= accepted; i++) {
            assertThat(create.getAsInt()).as("%s n°%d", what, i).isEqualTo(201);
        }
        assertThat(create.getAsInt()).as("%s : un de trop", what).isEqualTo(409);
    }

    private MockHttpSession newGuest() throws Exception {
        var result = mockMvc.perform(post("/api/auth/guest")).andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    private int status(MockHttpServletRequestBuilder request, MockHttpSession session, String body) {
        try {
            return mockMvc.perform(request.session(session).contentType("application/json").content(body)).andReturn().getResponse().getStatus();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private String idAt(String path, MockHttpSession session) throws Exception {
        String json = mockMvc.perform(get(path).session(session)).andReturn().getResponse().getContentAsString();
        return JSON.readTree(json).get(0).get("id").asText();
    }
}
