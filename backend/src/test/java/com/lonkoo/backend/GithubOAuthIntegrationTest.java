package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ThreadLocalRandom;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import tools.jackson.databind.JsonNode;

/**
 * Connexion GitHub (lot R4) contre un faux GitHub local : redirection, succès, compte existant,
 * rattachement d'un invité, refus, états invalides, pannes de GitHub, et absence du jeton hors
 * de la session.
 */
class GithubOAuthIntegrationTest extends AbstractPostgresIntegrationTest {

    private static final String CLIENT_ID = "id-application-de-test";
    private static final String CLIENT_SECRET = "mot-de-passe-application-test";
    private static final String TOKEN_ATTRIBUTE = "lonkoo.githubToken";
    private static final FakeGithub GITHUB = FakeGithub.start();

    @DynamicPropertySource
    static void githubProperties(DynamicPropertyRegistry registry) {
        registry.add("github.oauth.client-id", () -> CLIENT_ID);
        registry.add("github.oauth.client-secret", () -> CLIENT_SECRET);
        registry.add("github.oauth.authorize-url", () -> GITHUB.url("/login/oauth/authorize"));
        registry.add("github.oauth.token-url", () -> GITHUB.url("/login/oauth/access_token"));
        registry.add("github.oauth.user-url", () -> GITHUB.url("/user"));
    }

    @AfterAll
    static void stopGithub() {
        GITHUB.server.stop(0);
    }

    @Autowired
    private JdbcClient jdbc;

    @BeforeEach
    void resetGithub() {
        GITHUB.reset();
    }

    // ------------------------------------------------------------------ Redirection vers GitHub

    @Test
    void loginRedirectsToGithubWithStateScopesAndFixedRedirectUri() throws Exception {
        MvcResult login = mockMvc.perform(get("/api/auth/github/login"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", startsWith(GITHUB.url("/login/oauth/authorize") + "?")))
                .andReturn();

        Map<String, String> query = queryOf(login);
        assertThat(query.get("client_id")).isEqualTo(CLIENT_ID);
        assertThat(query.get("redirect_uri")).isEqualTo("http://localhost:3000/api/auth/github/callback");
        assertThat(query.get("scope")).isEqualTo("read:user public_repo");
        assertThat(query.get("state")).hasSize(43);
        assertThat(query).doesNotContainKey("client_secret");

        // Chaque demande a son propre état.
        assertThat(queryOf(mockMvc.perform(get("/api/auth/github/login")).andReturn()).get("state"))
                .isNotEqualTo(query.get("state"));
    }

    // ------------------------------------------------------------------ Succès

    @Test
    void aNewUserSignsInWithANewSessionAndTheTokenStaysInTheSession() throws Exception {
        long githubId = newGithubId();
        String code = GITHUB.register(githubId, "octocat", "Octo Cat", "https://avatars.example/octocat.png");
        MvcResult login = startLogin(null);
        MockHttpSession loginSession = sessionOf(login);

        MvcResult callback = mockMvc.perform(callback(code, stateOf(login), loginSession))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "http://localhost:3000/dashboard"))
                .andReturn();
        MockHttpSession session = sessionOf(callback);

        assertThat(session.getId()).as("session neuve (fixation)").isNotEqualTo(loginSession.getId());
        assertThat(loginSession.isInvalid()).isTrue();
        assertThat(session.getAttribute(TOKEN_ATTRIBUTE)).isEqualTo(GITHUB.tokenFor(code));
        mockMvc.perform(get("/api/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.login").value("octocat"))
                .andExpect(jsonPath("$.displayName").value("Octo Cat"))
                .andExpect(jsonPath("$.avatarUrl").value("https://avatars.example/octocat.png"))
                .andExpect(jsonPath("$.isGuest").value(false));

        // La ligne locale est celle d'un compte GitHub durable.
        var row = jdbc.sql("select login, is_guest, expires_at is null as durable from users where github_id = ?")
                .param(githubId).query().singleRow();
        assertThat(row).containsEntry("login", "octocat").containsEntry("is_guest", false).containsEntry("durable", true);
        assertThat(count("select count(*) from audit_log where action = 'login.github' and actor_id = "
                + "(select id from users where github_id = ?)", githubId)).isEqualTo(1);

        // Le faux GitHub a reçu l'échange attendu, puis le profil demandé avec le jeton obtenu.
        JsonNode exchange = GITHUB.tokenRequests.get(0);
        assertThat(exchange.get("client_id").asText()).isEqualTo(CLIENT_ID);
        assertThat(exchange.get("client_secret").asText()).isEqualTo(CLIENT_SECRET);
        assertThat(exchange.get("code").asText()).isEqualTo(code);
        assertThat(exchange.get("redirect_uri").asText()).isEqualTo("http://localhost:3000/api/auth/github/callback");
        assertThat(GITHUB.userAuthorizations).containsExactly("Bearer " + GITHUB.tokenFor(code));
    }

    @Test
    void neitherTheTokenNorTheAppSecretIsStoredOrReturned() throws Exception {
        String code = GITHUB.register(newGithubId(), "discret", "Discret", null);
        MvcResult login = startLogin(null);
        MvcResult callback = mockMvc.perform(callback(code, stateOf(login), sessionOf(login))).andReturn();
        MockHttpSession session = sessionOf(callback);
        String me = mockMvc.perform(get("/api/me").session(session)).andReturn().getResponse().getContentAsString();

        String token = GITHUB.tokenFor(code);
        assertThat(callback.getResponse().getContentAsString()).doesNotContain(token, CLIENT_SECRET);
        assertThat(callback.getResponse().getHeaderNames().stream()
                .map(name -> callback.getResponse().getHeaders(name).toString()).toList())
                .noneMatch(value -> value.contains(token) || value.contains(CLIENT_SECRET));
        assertThat(me).doesNotContain(token, CLIENT_SECRET);
        for (String table : List.of("users", "projects", "project_members", "canvases", "canvas_versions", "share_links", "audit_log")) {
            for (String rowJson : jdbc.sql("select row_to_json(t)::text from " + table + " t").query(String.class).list()) {
                assertThat(rowJson).as("table %s", table).doesNotContain(token, CLIENT_SECRET);
            }
        }
    }

    @Test
    void aReturningUserKeepsTheSameAccountWhoseProfileIsRefreshed() throws Exception {
        long githubId = newGithubId();
        String first = GITHUB.register(githubId, "ancien_login", "Ancien Nom", "https://a/1.png");
        UUID id = signIn(null, first).userId;

        String second = GITHUB.register(githubId, "nouveau_login", "Nouveau Nom", "https://a/2.png");
        SignedIn again = signIn(null, second);

        assertThat(again.userId).isEqualTo(id);
        assertThat(count("select count(*) from users where github_id = ?", githubId)).isEqualTo(1);
        mockMvc.perform(get("/api/me").session(again.session))
                .andExpect(jsonPath("$.login").value("nouveau_login"))
                .andExpect(jsonPath("$.displayName").value("Nouveau Nom"))
                .andExpect(jsonPath("$.avatarUrl").value("https://a/2.png"));
    }

    @Test
    void logoutEndsTheSessionAndTheTokenWithIt() throws Exception {
        SignedIn user = signIn(null, GITHUB.register(newGithubId(), "partant", "Partant", null));

        mockMvc.perform(post("/api/auth/logout").session(user.session)).andExpect(status().isNoContent());

        assertThat(user.session.isInvalid()).isTrue();
        mockMvc.perform(get("/api/me").session(user.session)).andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------------ Rattachement d'un invité

    @Test
    void aGuestWhoSignsInBringsItsWorkToANewGithubAccount() throws Exception {
        MockHttpSession guestSession = newGuest();
        UUID guestId = userIdOf(guestSession);
        String projectId = firstProjectId(guestSession);
        String canvasId = firstCanvasId(guestSession, projectId);
        mockMvc.perform(post("/api/canvases/" + canvasId + "/share-links").session(guestSession)
                .contentType("application/json").content("{\"role\":\"READ\"}")).andExpect(status().isCreated());
        jdbc.sql("insert into canvas_versions (canvas_id, name, snapshot, author_id) values (?, 'v1', '{}'::jsonb, ?)")
                .param(UUID.fromString(canvasId)).param(guestId).update();

        SignedIn user = signIn(guestSession, GITHUB.register(newGithubId(), "ex_invite", "Ex Invité", null));

        mockMvc.perform(get("/api/projects").session(user.session))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(projectId))
                .andExpect(jsonPath("$[0].ownerId").value(user.userId.toString()));
        assertThat(count("select count(*) from users where id = ?", guestId)).as("l'invité a disparu").isZero();
        assertThat(count("select count(*) from project_members where project_id = ? and user_id = ? and role = 'OWNER'",
                UUID.fromString(projectId), user.userId)).isEqualTo(1);
        assertThat(count("select count(*) from canvas_versions where canvas_id = ? and author_id = ?",
                UUID.fromString(canvasId), user.userId)).as("l'auteur des versions suit").isEqualTo(1);
        assertThat(count("select count(*) from share_links where canvas_id = ? and created_by = ?",
                UUID.fromString(canvasId), user.userId)).isEqualTo(1);
        assertThat(count("select count(*) from audit_log where action = 'guest.merged' and actor_id = ?", user.userId)).isEqualTo(1);

        // L'ancienne session d'invité ne donne plus rien.
        mockMvc.perform(get("/api/projects").session(guestSession)).andExpect(status().isUnauthorized());
    }

    @Test
    void aGuestWhoSignsInToAnExistingAccountMergesBothSetsOfProjectsKeepingTheHighestRole() throws Exception {
        long githubId = newGithubId();
        SignedIn existing = signIn(null, GITHUB.register(githubId, "habitue", "Habitué", null));
        String ownProject = createProject(existing.session, "Mon projet");

        MockHttpSession guestSession = newGuest();
        UUID guestId = userIdOf(guestSession);
        String guestProject = firstProjectId(guestSession);
        // Le compte GitHub était déjà membre en lecture du projet de l'invité.
        jdbc.sql("insert into project_members (project_id, user_id, role) values (?, ?, 'READ')")
                .param(UUID.fromString(guestProject)).param(existing.userId).update();

        SignedIn merged = signIn(guestSession, GITHUB.register(githubId, "habitue", "Habitué", null));

        assertThat(merged.userId).isEqualTo(existing.userId);
        String projects = mockMvc.perform(get("/api/projects").session(merged.session)).andReturn().getResponse().getContentAsString();
        assertThat(projects).contains(ownProject).contains(guestProject);
        assertThat(jdbc.sql("select role from project_members where project_id = ? and user_id = ?")
                .param(UUID.fromString(guestProject)).param(existing.userId).query(String.class).list())
                .as("une seule appartenance, au rôle le plus élevé").containsExactly("OWNER");
        assertThat(count("select count(*) from users where id = ?", guestId)).isZero();
        assertThat(count("select count(*) from projects where owner_id = ?", existing.userId)).isEqualTo(2);
    }

    @Test
    void aSessionOfAnotherGithubAccountIsNotMerged() throws Exception {
        SignedIn first = signIn(null, GITHUB.register(newGithubId(), "premier", "Premier", null));
        String project = createProject(first.session, "Projet du premier");

        SignedIn second = signIn(first.session, GITHUB.register(newGithubId(), "second", "Second", null));

        assertThat(second.userId).isNotEqualTo(first.userId);
        assertThat(count("select count(*) from users where id = ?", first.userId)).as("le premier compte existe encore").isEqualTo(1);
        assertThat(mockMvc.perform(get("/api/projects").session(second.session)).andReturn().getResponse().getContentAsString())
                .doesNotContain(project);
        assertThat(count("select count(*) from projects where owner_id = ?", first.userId)).isEqualTo(1);
    }

    // ------------------------------------------------------------------ Refus et états invalides

    @Test
    void anAuthorizationRefusalGoesBackToTheLoginPageWithoutASession() throws Exception {
        MvcResult login = startLogin(null);
        MockHttpSession session = sessionOf(login);

        mockMvc.perform(get("/api/auth/github/callback").param("error", "access_denied").param("state", stateOf(login)).session(session))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "http://localhost:3000/login?error=github"));

        mockMvc.perform(get("/api/me").session(session)).andExpect(status().isUnauthorized());
        // L'état du flux abandonné ne reste pas valable.
        mockMvc.perform(callback(GITHUB.register(newGithubId(), "tardif", "Tardif", null), stateOf(login), session))
                .andExpect(status().isBadRequest());
    }

    @Test
    void aMissingWrongOrReplayedStateIsRejected() throws Exception {
        String code = GITHUB.register(newGithubId(), "rejoue", "Rejoué", null);

        // Pas de session du tout.
        mockMvc.perform(get("/api/auth/github/callback").param("code", code).param("state", "inventé"))
                .andExpect(status().isBadRequest());

        MvcResult login = startLogin(null);
        MockHttpSession session = sessionOf(login);
        mockMvc.perform(get("/api/auth/github/callback").param("code", code).session(session)).andExpect(status().isBadRequest());
        mockMvc.perform(callback(code, "mauvais-etat", session)).andExpect(status().isBadRequest());
        assertThat(GITHUB.tokenRequests).as("aucun échange tant que l'état n'est pas valide").isEmpty();

        // Un état valable sert une seule fois : la session d'origine est fermée par la connexion.
        mockMvc.perform(callback(code, stateOf(login), session)).andExpect(status().isFound());
        mockMvc.perform(callback(code, stateOf(login), session)).andExpect(status().isBadRequest());
    }

    @Test
    void aMissingCodeIsRejected() throws Exception {
        MvcResult login = startLogin(null);
        mockMvc.perform(get("/api/auth/github/callback").param("state", stateOf(login)).session(sessionOf(login)))
                .andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------------------ Pannes de GitHub

    @Test
    void anInvalidOrExpiredCodeIsABadRequest() throws Exception {
        GITHUB.tokenResponses.put("code-perime", new FakeResponse(200,
                "{\"error\":\"bad_verification_code\",\"error_description\":\"The code passed is incorrect or expired.\"}"));

        assertFailure("code-perime", 400);
    }

    @Test
    void aRefusedApplicationIsABadGatewayNotAUserError() throws Exception {
        GITHUB.tokenResponses.put("code-config", new FakeResponse(200, "{\"error\":\"incorrect_client_credentials\"}"));
        GITHUB.tokenResponses.put("code-sans-jeton", new FakeResponse(200, "{\"token_type\":\"bearer\"}"));
        GITHUB.tokenResponses.put("code-illisible", new FakeResponse(200, "pas du json"));
        GITHUB.tokenResponses.put("code-500", new FakeResponse(500, "{}"));

        assertFailure("code-config", 502);
        assertFailure("code-sans-jeton", 502);
        assertFailure("code-illisible", 502);
        assertFailure("code-500", 502);
    }

    @Test
    void aProfileThatCannotBeReadIsABadGateway() throws Exception {
        // Aucun profil enregistré pour ce code : le faux GitHub répond 401 à la lecture du profil.
        assertFailure("code-sans-profil", 502);
    }

    private void assertFailure(String code, int expectedStatus) throws Exception {
        int usersBefore = count("select count(*) from users");
        MvcResult login = startLogin(null);
        MockHttpSession session = sessionOf(login);

        MvcResult result = mockMvc.perform(callback(code, stateOf(login), session)).andReturn();

        assertThat(result.getResponse().getStatus()).as("statut pour %s", code).isEqualTo(expectedStatus);
        assertThat(result.getResponse().getContentType()).startsWith("application/problem+json");
        assertThat(result.getResponse().getContentAsString()).doesNotContain(CLIENT_SECRET, GITHUB.tokenFor(code), code);
        mockMvc.perform(get("/api/me").session(session)).andExpect(status().isUnauthorized());
        assertThat(count("select count(*) from users")).as("aucun compte créé").isEqualTo(usersBefore);
    }

    // ------------------------------------------------------------------ Outils

    private record SignedIn(MockHttpSession session, UUID userId) {
    }

    private SignedIn signIn(MockHttpSession existing, String code) throws Exception {
        MvcResult login = startLogin(existing);
        MvcResult callback = mockMvc.perform(callback(code, stateOf(login), sessionOf(login)))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "http://localhost:3000/dashboard"))
                .andReturn();
        MockHttpSession session = sessionOf(callback);
        return new SignedIn(session, userIdOf(session));
    }

    private MvcResult startLogin(MockHttpSession session) throws Exception {
        MockHttpServletRequestBuilder request = get("/api/auth/github/login");
        if (session != null) {
            request = request.session(session);
        }
        return mockMvc.perform(request).andExpect(status().isFound()).andReturn();
    }

    private static MockHttpServletRequestBuilder callback(String code, String state, MockHttpSession session) {
        return get("/api/auth/github/callback").param("code", code).param("state", state).session(session);
    }

    private static Map<String, String> queryOf(MvcResult login) {
        String location = login.getResponse().getHeader("Location");
        Map<String, String> query = new HashMap<>();
        for (String pair : location.substring(location.indexOf('?') + 1).split("&")) {
            String[] parts = pair.split("=", 2);
            query.put(parts[0], URLDecoder.decode(parts[1], StandardCharsets.UTF_8));
        }
        return query;
    }

    private static String stateOf(MvcResult login) {
        return queryOf(login).get("state");
    }

    private static MockHttpSession sessionOf(MvcResult result) {
        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        assertThat(session).isNotNull();
        return session;
    }

    private static long newGithubId() {
        return ThreadLocalRandom.current().nextLong(1_000_000L, Long.MAX_VALUE / 4);
    }

    private MockHttpSession newGuest() throws Exception {
        return sessionOf(mockMvc.perform(post("/api/auth/guest")).andExpect(status().isCreated()).andReturn());
    }

    private UUID userIdOf(MockHttpSession session) throws Exception {
        String json = mockMvc.perform(get("/api/me").session(session)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(JSON.readTree(json).get("id").asText());
    }

    private String firstProjectId(MockHttpSession session) throws Exception {
        String json = mockMvc.perform(get("/api/projects").session(session)).andReturn().getResponse().getContentAsString();
        return JSON.readTree(json).get(0).get("id").asText();
    }

    private String firstCanvasId(MockHttpSession session, String projectId) throws Exception {
        String json = mockMvc.perform(get("/api/projects/" + projectId + "/canvases").session(session)).andReturn().getResponse().getContentAsString();
        return JSON.readTree(json).get(0).get("id").asText();
    }

    private String createProject(MockHttpSession session, String name) throws Exception {
        String json = mockMvc.perform(post("/api/projects").session(session)
                .contentType("application/json").content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JSON.readTree(json).get("id").asText();
    }

    private int count(String sql, Object... params) {
        var statement = jdbc.sql(sql);
        for (Object param : params) {
            statement = statement.param(param);
        }
        return statement.query(Integer.class).single();
    }

    // ------------------------------------------------------------------ Faux GitHub

    private record FakeResponse(int status, String body) {
    }

    /** Faux GitHub : échange de code (jeton « jeton-pour-<code> ») et profil retrouvé par le jeton. */
    private static final class FakeGithub {
        final HttpServer server;
        final Map<String, String> profiles = new ConcurrentHashMap<>();
        final Map<String, FakeResponse> tokenResponses = new ConcurrentHashMap<>();
        final List<JsonNode> tokenRequests = new CopyOnWriteArrayList<>();
        final List<String> userAuthorizations = new CopyOnWriteArrayList<>();

        private FakeGithub(HttpServer server) {
            this.server = server;
        }

        static FakeGithub start() {
            try {
                HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
                FakeGithub github = new FakeGithub(server);
                server.createContext("/login/oauth/access_token", github::token);
                server.createContext("/user", github::user);
                server.start();
                return github;
            } catch (IOException e) {
                throw new IllegalStateException("Impossible de démarrer le faux GitHub", e);
            }
        }

        String url(String path) {
            return "http://127.0.0.1:" + server.getAddress().getPort() + path;
        }

        String tokenFor(String code) {
            return "jeton-pour-" + code;
        }

        void reset() {
            tokenResponses.clear();
            tokenRequests.clear();
            userAuthorizations.clear();
        }

        /** Enregistre le profil renvoyé pour un nouveau code ; retourne ce code. */
        String register(long id, String login, String name, String avatar) {
            String code = "code-" + UUID.randomUUID();
            profiles.put(tokenFor(code), "{\"id\":" + id + ",\"login\":\"" + login + "\""
                    + (name == null ? "" : ",\"name\":\"" + name + "\"")
                    + (avatar == null ? "" : ",\"avatar_url\":\"" + avatar + "\"") + "}");
            return code;
        }

        private void token(HttpExchange exchange) throws IOException {
            JsonNode request = JSON.readTree(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            tokenRequests.add(request);
            String code = request.path("code").asText();
            FakeResponse response = tokenResponses.get(code);
            if (response == null) {
                response = new FakeResponse(200, "{\"access_token\":\"" + tokenFor(code) + "\",\"token_type\":\"bearer\"}");
            }
            respond(exchange, response.status(), response.body());
        }

        private void user(HttpExchange exchange) throws IOException {
            String authorization = exchange.getRequestHeaders().getFirst("Authorization");
            userAuthorizations.add(String.valueOf(authorization));
            String profile = authorization == null ? null : profiles.get(authorization.replace("Bearer ", ""));
            if (profile == null) {
                respond(exchange, 401, "{\"message\":\"Bad credentials\"}");
            } else {
                respond(exchange, 200, profile);
            }
        }

        private static void respond(HttpExchange exchange, int status, String body) throws IOException {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        }
    }
}
