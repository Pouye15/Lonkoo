package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
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
import org.springframework.transaction.support.TransactionTemplate;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.support.UsageLimits;
import com.lonkoo.backend.web.LimitExceededException;

import tools.jackson.databind.JsonNode;

/**
 * Plafonds d'usage avec des valeurs basses (3 projets par invité, 5 par compte, 3 canvas, 3 versions,
 * 3 liens actifs, instantané de 8 000 octets) : le dépassement donne un 409 « Limite atteinte », ne
 * laisse aucune trace, ne révèle rien à ceux qui n'ont pas accès, et tient sous des demandes simultanées.
 */
@TestPropertySource(properties = {
        "lonkoo.limits.guest-projects=3",
        "lonkoo.limits.account-projects=5",
        "lonkoo.limits.canvases-per-project=3",
        "lonkoo.limits.versions-per-canvas=3",
        "lonkoo.limits.share-links-per-canvas=3",
        "lonkoo.limits.snapshot-max-bytes=8000" })
class UsageLimitsIntegrationTest extends AbstractPostgresIntegrationTest {

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
    private UsageLimits usageLimits;

    @Autowired
    private TransactionTemplate transactions;

    private String seed;

    @BeforeEach
    void resetRealtime() throws IOException {
        seed = new String(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        REALTIME.reset(seed);
    }

    // ------------------------------------------------------------------ Projets

    @Test
    void aGuestCannotCreateMoreProjectsThanTheGuestCap() throws Exception {
        MockHttpSession guest = newGuest();   // l'invité arrive avec un projet : il en reste deux

        assertThat(createProject(guest)).isEqualTo(201);
        assertThat(createProject(guest)).isEqualTo(201);
        MockHttpServletResponse refused = send("/api/projects", guest, "{\"name\":\"trop\"}");

        assertLimitReached(refused, "3 projets", "GitHub");
        assertThat(ownedProjects(userId(guest))).isEqualTo(3);
    }

    @Test
    void anAccountHasAHigherCapThanAGuest() throws Exception {
        MockHttpSession guest = newGuest();
        UUID id = userId(guest);
        insertProjects(id, 3);   // 4 projets en tout
        CurrentUser asGuest = user(id, true);
        CurrentUser asAccount = user(id, false);

        assertThat(room(asGuest)).as("un invité est déjà au-delà de son plafond").isInstanceOf(LimitExceededException.class)
                .hasMessageContaining("3 projets");
        assertThat(room(asAccount)).as("un compte GitHub a encore de la place").isNull();

        insertProjects(id, 1);   // 5 projets
        assertThat(room(asAccount)).isInstanceOf(LimitExceededException.class).hasMessageContaining("5 projets");
    }

    @Test
    void projectsOfOthersDoNotCountTowardsTheCap() throws Exception {
        MockHttpSession host = newGuest();
        MockHttpSession guest = newGuest();
        UUID guestId = userId(guest);
        for (int i = 0; i < 5; i++) {
            UUID project = insertProjects(userId(host), 1).get(0);
            jdbc.sql("insert into project_members (project_id, user_id, role) values (?, ?, 'READ')").param(project).param(guestId).update();
        }

        assertThat(createProject(guest)).as("invité à 1 projet à lui, 5 projets d'autres").isEqualTo(201);
    }

    @Test
    void simultaneousProjectCreationsStayUnderTheCap() throws Exception {
        MockHttpSession guest = newGuest();

        List<Integer> statuses = race(10, () -> createProject(guest));

        assertThat(statuses).containsOnly(201, 409);
        assertThat(statuses.stream().filter(s -> s == 201)).hasSize(2);
        assertThat(ownedProjects(userId(guest))).isEqualTo(3);
    }

    // ------------------------------------------------------------------ Canvas

    @Test
    void canvasesPerProjectAreCappedAndOtherProjectsAreUnaffected() throws Exception {
        MockHttpSession owner = newGuest();
        String project = firstProject(owner);
        String other = createProjectId(owner);

        assertThat(createCanvas(owner, project)).isEqualTo(201);
        assertThat(createCanvas(owner, project)).isEqualTo(201);
        assertLimitReached(send("/api/projects/" + project + "/canvases", owner, "{\"name\":\"trop\"}"), "3 canvas");

        assertThat(count("select count(*) from canvases where project_id = ?", UUID.fromString(project))).isEqualTo(3);
        assertThat(createCanvas(owner, other)).as("un autre projet a sa propre place").isEqualTo(201);
    }

    @Test
    void theLimitNeverShowsToSomeoneWithoutAccessOrWithoutTheRole() throws Exception {
        MockHttpSession owner = newGuest();
        String project = firstProject(owner);
        createCanvas(owner, project);
        createCanvas(owner, project);   // projet plein
        MockHttpSession reader = newGuest();
        jdbc.sql("insert into project_members (project_id, user_id, role) values (?, ?, 'READ')")
                .param(UUID.fromString(project)).param(userId(reader)).update();

        assertThat(send("/api/projects/" + project + "/canvases", reader, "{\"name\":\"x\"}").getStatus()).as("lecteur").isEqualTo(403);
        assertThat(send("/api/projects/" + project + "/canvases", newGuest(), "{\"name\":\"x\"}").getStatus()).as("étranger").isEqualTo(404);
    }

    @Test
    void simultaneousCanvasCreationsStayUnderTheCap() throws Exception {
        MockHttpSession owner = newGuest();
        String project = firstProject(owner);

        List<Integer> statuses = race(10, () -> createCanvas(owner, project));

        assertThat(statuses).containsOnly(201, 409);
        assertThat(statuses.stream().filter(s -> s == 201)).hasSize(2);
        assertThat(count("select count(*) from canvases where project_id = ?", UUID.fromString(project))).isEqualTo(3);
    }

    // ------------------------------------------------------------------ Versions

    @Test
    void versionsPerCanvasAreCapped() throws Exception {
        MockHttpSession owner = newGuest();
        String canvas = firstCanvas(owner);
        String other = createCanvasId(owner);

        for (int i = 1; i <= 3; i++) {
            assertThat(createVersion(owner, canvas, "v" + i)).isEqualTo(201);
        }
        assertLimitReached(send("/api/canvases/" + canvas + "/versions", owner, "{\"name\":\"v4\"}"), "3 versions");

        assertThat(count("select count(*) from canvas_versions where canvas_id = ?", UUID.fromString(canvas))).isEqualTo(3);
        JsonNode listed = JSON.readTree(fetch(owner, "/api/canvases/" + canvas + "/versions").getContentAsString());
        assertThat(listed).hasSize(3);
        assertThat(createVersion(owner, other, "v1")).as("un autre canvas a sa propre place").isEqualTo(201);
    }

    @Test
    void restoringAVersionIsNotLimitedByTheCap() throws Exception {
        MockHttpSession owner = newGuest();
        String canvas = firstCanvas(owner);
        String version = null;
        for (int i = 1; i <= 3; i++) {
            version = versionId(owner, canvas, "v" + i);
        }

        assertThat(send("/api/canvases/" + canvas + "/versions/" + version + "/restore", owner, null).getStatus()).isEqualTo(204);
    }

    @Test
    void simultaneousVersionsStayUnderTheCap() throws Exception {
        MockHttpSession owner = newGuest();
        String canvas = firstCanvas(owner);

        List<Integer> statuses = race(10, () -> createVersion(owner, canvas, "v"));

        assertThat(statuses).containsOnly(201, 409);
        assertThat(statuses.stream().filter(s -> s == 201)).hasSize(3);
        assertThat(count("select count(*) from canvas_versions where canvas_id = ?", UUID.fromString(canvas))).isEqualTo(3);
    }

    @Test
    void anOversizedSnapshotIsRefusedAndNothingIsStored() throws Exception {
        MockHttpSession owner = newGuest();
        String canvas = firstCanvas(owner);
        REALTIME.reset(snapshotWithServices(200));

        MockHttpServletResponse refused = send("/api/canvases/" + canvas + "/versions", owner, "{\"name\":\"gros\"}");

        assertLimitReached(refused, "octets");
        assertThat(count("select count(*) from canvas_versions where canvas_id = ?", UUID.fromString(canvas))).isZero();

        REALTIME.reset(seed);
        assertThat(createVersion(owner, canvas, "normal")).as("la taille de l'exemple passe").isEqualTo(201);
    }

    // ------------------------------------------------------------------ Liens de partage

    @Test
    void activeShareLinksAreCappedAndAnExpiredLinkFreesASlot() throws Exception {
        MockHttpSession owner = newGuest();
        String canvas = firstCanvas(owner);

        for (int i = 0; i < 3; i++) {
            assertThat(createLink(owner, canvas)).isEqualTo(201);
        }
        assertLimitReached(send("/api/canvases/" + canvas + "/share-links", owner, "{\"role\":\"READ\"}"), "3 liens");
        assertThat(count("select count(*) from share_links where canvas_id = ?", UUID.fromString(canvas))).isEqualTo(3);

        jdbc.sql("update share_links set expires_at = now() - interval '1 minute' where token_hash = (select token_hash from share_links where canvas_id = ? limit 1)")
                .param(UUID.fromString(canvas)).update();

        assertThat(createLink(owner, canvas)).as("un lien expiré ne compte plus").isEqualTo(201);
    }

    // ------------------------------------------------------------------ Outils

    private static void assertLimitReached(MockHttpServletResponse response, String... fragments) throws Exception {
        assertThat(response.getStatus()).isEqualTo(409);
        assertThat(response.getContentType()).startsWith("application/problem+json");
        JsonNode problem = JSON.readTree(response.getContentAsString());
        assertThat(problem.get("title").asText()).isEqualTo("Limite atteinte");
        assertThat(problem.get("status").asInt()).isEqualTo(409);
        for (String fragment : fragments) {
            assertThat(problem.get("detail").asText()).contains(fragment);
        }
    }

    private static String snapshotWithServices(int count) {
        List<String> nodes = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            nodes.add("{\"id\":\"n" + i + "\",\"type\":\"service\",\"position\":{\"x\":0,\"y\":0},\"data\":{\"name\":\"service_" + i + "\"}}");
        }
        return "{\"schemaVersion\":1,\"nodes\":[" + String.join(",", nodes) + "],\"edges\":[]}";
    }

    /** Lance {@code threads} appels en même temps et rend leurs statuts. */
    private static List<Integer> race(int threads, Callable<Integer> call) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    return call.call();
                }));
            }
            start.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> result : results) {
                statuses.add(result.get(60, TimeUnit.SECONDS));
            }
            return statuses;
        } finally {
            pool.shutdownNow();
        }
    }

    private MockHttpSession newGuest() throws Exception {
        var result = mockMvc.perform(post("/api/auth/guest")).andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    private MockHttpServletResponse send(String path, MockHttpSession session, String body) throws Exception {
        var request = post(path).session(session);
        if (body != null) {
            request = request.contentType("application/json").content(body);
        }
        return mockMvc.perform(request).andReturn().getResponse();
    }

    private MockHttpServletResponse fetch(MockHttpSession session, String path) throws Exception {
        return mockMvc.perform(get(path).session(session)).andReturn().getResponse();
    }

    private int createProject(MockHttpSession session) throws Exception {
        return send("/api/projects", session, "{\"name\":\"p\"}").getStatus();
    }

    private String createProjectId(MockHttpSession session) throws Exception {
        MockHttpServletResponse response = send("/api/projects", session, "{\"name\":\"autre\"}");
        assertThat(response.getStatus()).isEqualTo(201);
        return JSON.readTree(response.getContentAsString()).get("id").asText();
    }

    private int createCanvas(MockHttpSession session, String project) throws Exception {
        return send("/api/projects/" + project + "/canvases", session, "{\"name\":\"c\"}").getStatus();
    }

    private String createCanvasId(MockHttpSession session) throws Exception {
        String project = createProjectId(session);
        return JSON.readTree(fetch(session, "/api/projects/" + project + "/canvases").getContentAsString()).get(0).get("id").asText();
    }

    private int createVersion(MockHttpSession session, String canvas, String name) throws Exception {
        return send("/api/canvases/" + canvas + "/versions", session, "{\"name\":\"" + name + "\"}").getStatus();
    }

    private String versionId(MockHttpSession session, String canvas, String name) throws Exception {
        MockHttpServletResponse response = send("/api/canvases/" + canvas + "/versions", session, "{\"name\":\"" + name + "\"}");
        assertThat(response.getStatus()).isEqualTo(201);
        return JSON.readTree(response.getContentAsString()).get("id").asText();
    }

    private int createLink(MockHttpSession session, String canvas) throws Exception {
        return send("/api/canvases/" + canvas + "/share-links", session, "{\"role\":\"READ\"}").getStatus();
    }

    private String firstProject(MockHttpSession session) throws Exception {
        return JSON.readTree(fetch(session, "/api/projects").getContentAsString()).get(0).get("id").asText();
    }

    private String firstCanvas(MockHttpSession session) throws Exception {
        return JSON.readTree(fetch(session, "/api/projects/" + firstProject(session) + "/canvases").getContentAsString()).get(0).get("id").asText();
    }

    private UUID userId(MockHttpSession session) throws Exception {
        return UUID.fromString(JSON.readTree(fetch(session, "/api/me").getContentAsString()).get("id").asText());
    }

    private List<UUID> insertProjects(UUID owner, int count) {
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            UUID id = UUID.randomUUID();
            jdbc.sql("insert into projects (id, name, description, visibility, owner_id) values (?, 'direct', null, 'private', ?)")
                    .param(id).param(owner).update();
            jdbc.sql("insert into project_members (project_id, user_id, role) values (?, ?, 'OWNER')").param(id).param(owner).update();
            ids.add(id);
        }
        return ids;
    }

    private int ownedProjects(UUID owner) {
        return count("select count(*) from projects where owner_id = ?", owner);
    }

    private int count(String sql, UUID id) {
        return jdbc.sql(sql).param(id).query(Integer.class).single();
    }

    private static CurrentUser user(UUID id, boolean guest) {
        return new CurrentUser(id, "login", "Nom", null, guest, null);
    }

    /** Résultat du contrôle de place pour un projet : l'exception levée, ou {@code null} s'il reste de la place. */
    private RuntimeException room(CurrentUser user) {
        try {
            transactions.executeWithoutResult(status -> usageLimits.requireRoomForProject(user));
            return null;
        } catch (RuntimeException e) {
            return e;
        }
    }
}
