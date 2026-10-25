package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.lonkoo.backend.model.Role;

/**
 * Contrôle d'accès de chaque route de l'API publique : sans session (401), sans être membre du projet
 * (404, jamais 403 : l'existence ne se révèle pas), puis avec chacun des cinq rôles (le rôle minimal
 * passe, un rôle plus faible reçoit 403). Liens de partage : durée, expiration, jonction répétée ou
 * simultanée, jamais de rétrogradation.
 */
class AccessMatrixIntegrationTest extends AbstractPostgresIntegrationTest {

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

    /** Une route de l'API, son rôle minimal sur le projet et le statut de réussite. */
    private record Route(String name, HttpMethod method, String path, String body, Role minimum, int success) {
    }

    private static final List<Route> ROUTES = List.of(
            new Route("lire un projet", HttpMethod.GET, "/api/projects/{project}", null, Role.READ, 200),
            new Route("modifier un projet", HttpMethod.PATCH, "/api/projects/{project}", "{\"description\":\"maj\"}", Role.MAINTAINER, 200),
            new Route("changer la visibilité", HttpMethod.PATCH, "/api/projects/{project}", "{\"visibility\":\"public\"}", Role.OWNER, 200),
            new Route("supprimer un projet", HttpMethod.DELETE, "/api/projects/{project}", null, Role.OWNER, 204),
            new Route("lister les membres", HttpMethod.GET, "/api/projects/{project}/members", null, Role.READ, 200),
            new Route("retirer un membre", HttpMethod.DELETE, "/api/projects/{project}/members/{victim}", null, Role.MAINTAINER, 204),
            new Route("lister les canvas", HttpMethod.GET, "/api/projects/{project}/canvases", null, Role.READ, 200),
            new Route("créer un canvas", HttpMethod.POST, "/api/projects/{project}/canvases", "{\"name\":\"Autre\"}", Role.WRITE, 201),
            new Route("lire un canvas", HttpMethod.GET, "/api/canvases/{canvas}", null, Role.READ, 200),
            new Route("ticket temps réel", HttpMethod.POST, "/api/canvases/{canvas}/realtime-ticket", null, Role.READ, 200),
            new Route("créer un lien de partage", HttpMethod.POST, "/api/canvases/{canvas}/share-links", "{\"role\":\"READ\"}", Role.MAINTAINER, 201),
            new Route("lister les liens de partage", HttpMethod.GET, "/api/canvases/{canvas}/share-links", null, Role.MAINTAINER, 200),
            new Route("révoquer un lien de partage", HttpMethod.DELETE, "/api/canvases/{canvas}/share-links/{link}", null, Role.MAINTAINER, 204),
            new Route("lister les versions", HttpMethod.GET, "/api/canvases/{canvas}/versions", null, Role.READ, 200),
            new Route("enregistrer une version", HttpMethod.POST, "/api/canvases/{canvas}/versions", "{\"name\":\"v2\"}", Role.WRITE, 201),
            new Route("lire une version", HttpMethod.GET, "/api/canvases/{canvas}/versions/{version}", null, Role.READ, 200),
            new Route("restaurer une version", HttpMethod.POST, "/api/canvases/{canvas}/versions/{version}/restore", null, Role.WRITE, 204),
            new Route("instantané courant", HttpMethod.GET, "/api/canvases/{canvas}/snapshot", null, Role.READ, 200),
            // Sans fournisseur d'IA branché, tout appelant autorisé reçoit 501 : le contrôle d'accès passe avant.
            new Route("esquisse IA", HttpMethod.POST, "/api/canvases/{canvas}/ai/sketch", "{\"brief\":\"Une boutique en ligne\"}", Role.WRITE, 501),
            new Route("complétion IA", HttpMethod.POST, "/api/canvases/{canvas}/ai/complete", "{}", Role.WRITE, 501),
            new Route("audit IA", HttpMethod.POST, "/api/canvases/{canvas}/ai/audit", null, Role.READ, 501));

    /**
     * Un projet, son canvas, une version, un lien de partage, un lecteur à retirer (« victim »), et trois sessions :
     * propriétaire, membre au rôle voulu, étranger.
     */
    private record World(MockHttpSession owner, MockHttpSession member, MockHttpSession stranger,
            String project, String canvas, String version, String victim, String link) {

        String resolve(String path) {
            return path.replace("{project}", project).replace("{canvas}", canvas).replace("{version}", version)
                    .replace("{victim}", victim).replace("{link}", link);
        }
    }

    // ------------------------------------------------------------------ Sans session

    @Test
    void everyProtectedRouteRefusesAnonymousCallers() throws Exception {
        World world = newWorld(Role.READ);
        List<String> failures = new ArrayList<>();
        for (Route route : ROUTES) {
            MockHttpServletResponse response = perform(route, world, null).getResponse();
            if (response.getStatus() != 401) {
                failures.add(route.name() + " : " + response.getStatus());
            }
        }
        for (String path : List.of("/api/me", "/api/projects")) {
            int status = mockMvc.perform(get(path)).andReturn().getResponse().getStatus();
            if (status != 401) {
                failures.add(path + " : " + status);
            }
        }
        int created = mockMvc.perform(post("/api/projects").contentType("application/json").content("{\"name\":\"x\"}"))
                .andReturn().getResponse().getStatus();
        if (created != 401) {
            failures.add("créer un projet : " + created);
        }
        assertThat(failures).isEmpty();
    }

    // ------------------------------------------------------------------ Sans être membre

    @Test
    void everyRouteHidesTheProjectFromSomeoneWhoIsNotAMember() throws Exception {
        List<String> failures = new ArrayList<>();
        for (Route route : ROUTES) {
            World world = newWorld(Role.READ);
            MockHttpServletResponse response = perform(route, world, world.stranger()).getResponse();
            if (response.getStatus() != 404) {
                failures.add(route.name() + " : " + response.getStatus());
            }
        }
        assertThat(failures).as("404 attendu (jamais 403) pour un étranger").isEmpty();
    }

    // ------------------------------------------------------------------ Un rôle après l'autre

    @ParameterizedTest
    @EnumSource(Role.class)
    void everyRouteAppliesTheMinimumRole(Role role) throws Exception {
        List<String> failures = new ArrayList<>();
        for (Route route : ROUTES) {
            World world = newWorld(role);
            MockHttpServletResponse response = perform(route, world, world.member()).getResponse();
            int expected = role.atLeast(route.minimum()) ? route.success() : 403;
            if (response.getStatus() != expected) {
                failures.add("%s avec %s : %d au lieu de %d".formatted(route.name(), role, response.getStatus(), expected));
            } else if (expected == 403) {
                String type = String.valueOf(response.getContentType());
                if (!type.startsWith("application/problem+json")) {
                    failures.add("%s avec %s : refus sans problem+json (%s)".formatted(route.name(), role, type));
                }
            }
        }
        assertThat(failures).isEmpty();
    }

    @Test
    void aRefusedWriteLeavesNoTrace() throws Exception {
        World world = newWorld(Role.READ);
        for (Route route : ROUTES.stream().filter(r -> r.minimum() != Role.READ).toList()) {
            assertThat(perform(route, world, world.member()).getResponse().getStatus()).as(route.name()).isEqualTo(403);
        }

        assertThat(count("select count(*) from projects where id = ?", UUID.fromString(world.project()))).as("projet gardé").isEqualTo(1);
        assertThat(count("select count(*) from projects where id = ? and visibility = 'private'", UUID.fromString(world.project())))
                .as("projet resté privé").isEqualTo(1);
        assertThat(count("select count(*) from projects where id = ? and description = 'maj'", UUID.fromString(world.project())))
                .as("projet non modifié").isZero();
        assertThat(count("select count(*) from canvases where project_id = ?", UUID.fromString(world.project()))).as("aucun canvas ajouté").isEqualTo(1);
        assertThat(count("select count(*) from canvas_versions where canvas_id = ?", UUID.fromString(world.canvas())))
                .as("aucune version ajoutée").isEqualTo(1);
        assertThat(count("select count(*) from share_links where canvas_id = ?", UUID.fromString(world.canvas())))
                .as("aucun lien créé ni révoqué : seul celui du départ").isEqualTo(1);
        assertThat(count("select count(*) from project_members where project_id = ?", UUID.fromString(world.project())))
                .as("aucun membre retiré : propriétaire, membre et lecteur du départ").isEqualTo(3);
        assertThat(REALTIME.restoreBodies).as("rien envoyé au document partagé").isEmpty();
    }

    @Test
    void theOwnerOfTheProjectCanDoEverything() throws Exception {
        for (Route route : ROUTES) {
            World world = newWorld(Role.READ);
            int status = perform(route, world, world.owner()).getResponse().getStatus();
            assertThat(status).as(route.name()).isEqualTo(route.success());
        }
    }

    // ------------------------------------------------------------------ Liens de partage

    @Test
    void anExpiredShareLinkIsNotFoundAndCreatesNoGuest() throws Exception {
        World world = newWorld(Role.READ);
        String token = createLink(world.owner(), world.canvas(), "READ", 1);
        jdbc.sql("update share_links set expires_at = now() - interval '1 minute' where canvas_id = ?")
                .param(UUID.fromString(world.canvas())).update();
        int usersBefore = count("select count(*) from users");

        assertThat(mockMvc.perform(post("/api/join/" + token)).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(count("select count(*) from users")).as("aucun invité créé").isEqualTo(usersBefore);
    }

    @Test
    void shareLinkDurationsStayBetweenOneAndSeventyTwoHours() throws Exception {
        World world = newWorld(Role.READ);
        for (int hours : new int[] { 0, -1, 73, 1000 }) {
            assertThat(linkStatus(world, "{\"role\":\"READ\",\"ttlHours\":" + hours + "}")).as("%d h", hours).isEqualTo(400);
        }
        for (int hours : new int[] { 1, 72 }) {
            assertThat(linkStatus(world, "{\"role\":\"READ\",\"ttlHours\":" + hours + "}")).as("%d h", hours).isEqualTo(201);
        }
        assertThat(linkStatus(world, "{\"role\":\"READ\"}")).as("durée par défaut").isEqualTo(201);
        long hours = jdbc.sql("select max(extract(epoch from (expires_at - now())) / 3600) from share_links where canvas_id = ?")
                .param(UUID.fromString(world.canvas())).query(Long.class).single();
        assertThat(hours).as("au plus 72 h").isLessThanOrEqualTo(72);
    }

    @Test
    void joiningTwiceChangesNothingAndALinkNeverDowngradesAMember() throws Exception {
        World world = newWorld(Role.READ);
        String read = createLink(world.owner(), world.canvas(), "READ", 24);
        String write = createLink(world.owner(), world.canvas(), "WRITE", 24);
        MockHttpSession visitor = newGuest();

        assertThat(join(read, visitor)).isEqualTo(200);
        assertThat(roleOf(world.project(), visitor)).isEqualTo("READ");
        assertThat(join(read, visitor)).as("deuxième jonction identique").isEqualTo(200);
        assertThat(roleOf(world.project(), visitor)).isEqualTo("READ");

        assertThat(join(write, visitor)).isEqualTo(200);
        assertThat(roleOf(world.project(), visitor)).as("promu par le lien en écriture").isEqualTo("WRITE");
        assertThat(join(read, visitor)).isEqualTo(200);
        assertThat(roleOf(world.project(), visitor)).as("jamais rétrogradé par un lien en lecture").isEqualTo("WRITE");

        // Le propriétaire qui ouvre un lien de son propre projet reste propriétaire.
        assertThat(join(read, world.owner())).isEqualTo(200);
        assertThat(roleOf(world.project(), world.owner())).isEqualTo("OWNER");
    }

    @Test
    void simultaneousJoinsByTheSameUserAllSucceedWithASingleMembership() throws Exception {
        World world = newWorld(Role.READ);
        String token = createLink(world.owner(), world.canvas(), "WRITE", 24);
        MockHttpSession visitor = newGuest();
        int threads = 12;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    return join(token, visitor);
                }));
            }
            start.countDown();
            for (Future<Integer> result : results) {
                assertThat(result.get(30, TimeUnit.SECONDS)).isEqualTo(200);
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(count("select count(*) from project_members where project_id = ? and user_id = ?",
                UUID.fromString(world.project()), userId(visitor))).isEqualTo(1);
        assertThat(roleOf(world.project(), visitor)).isEqualTo("WRITE");
    }

    // ------------------------------------------------------------------ Outils

    private World newWorld(Role memberRole) throws Exception {
        MockHttpSession owner = newGuest();
        String project = firstId(get("/api/projects").session(owner));
        String canvas = firstId(get("/api/projects/" + project + "/canvases").session(owner));
        String versionJson = mockMvc.perform(post("/api/canvases/" + canvas + "/versions").session(owner)
                .contentType("application/json").content("{\"name\":\"v1\"}")).andReturn().getResponse().getContentAsString();
        String version = JSON.readTree(versionJson).get("id").asText();

        MockHttpSession member = newGuest();
        jdbc.sql("insert into project_members (project_id, user_id, role) values (?, ?, ?)")
                .param(UUID.fromString(project)).param(userId(member)).param(memberRole.name()).update();
        MockHttpSession victim = newGuest();
        jdbc.sql("insert into project_members (project_id, user_id, role) values (?, ?, 'READ')")
                .param(UUID.fromString(project)).param(userId(victim)).update();
        createLink(owner, canvas, "READ", 24);
        String link = jdbc.sql("select id from share_links where canvas_id = ?")
                .param(UUID.fromString(canvas)).query(String.class).single();
        return new World(owner, member, newGuest(), project, canvas, version, userId(victim).toString(), link);
    }

    private MvcResult perform(Route route, World world, MockHttpSession session) throws Exception {
        MockHttpServletRequestBuilder builder = request(route.method(), world.resolve(route.path()));
        if (session != null) {
            builder = builder.session(session);
        }
        if (route.body() != null) {
            builder = builder.contentType("application/json").content(route.body());
        }
        return mockMvc.perform(builder).andReturn();
    }

    private MockHttpSession newGuest() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")).andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    private String firstId(MockHttpServletRequestBuilder request) throws Exception {
        return JSON.readTree(mockMvc.perform(request).andReturn().getResponse().getContentAsString()).get(0).get("id").asText();
    }

    private UUID userId(MockHttpSession session) throws Exception {
        String json = mockMvc.perform(get("/api/me").session(session)).andReturn().getResponse().getContentAsString();
        return UUID.fromString(JSON.readTree(json).get("id").asText());
    }

    private String createLink(MockHttpSession owner, String canvas, String role, int hours) throws Exception {
        MockHttpServletResponse response = mockMvc.perform(post("/api/canvases/" + canvas + "/share-links").session(owner)
                .contentType("application/json").content("{\"role\":\"" + role + "\",\"ttlHours\":" + hours + "}"))
                .andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(201);
        String url = JSON.readTree(response.getContentAsString()).get("url").asText();
        return url.substring(url.lastIndexOf('/') + 1);
    }

    private int linkStatus(World world, String body) throws Exception {
        return mockMvc.perform(post("/api/canvases/" + world.canvas() + "/share-links").session(world.owner())
                .contentType("application/json").content(body)).andReturn().getResponse().getStatus();
    }

    private int join(String token, MockHttpSession session) throws Exception {
        return mockMvc.perform(post("/api/join/" + token).session(session)).andReturn().getResponse().getStatus();
    }

    private String roleOf(String project, MockHttpSession session) throws Exception {
        return jdbc.sql("select role from project_members where project_id = ? and user_id = ?")
                .param(UUID.fromString(project)).param(userId(session)).query(String.class).single();
    }

    private int count(String sql, Object... params) {
        var statement = jdbc.sql(sql);
        for (Object param : params) {
            statement = statement.param(param);
        }
        return statement.query(Integer.class).single();
    }
}
