package com.lonkoo.backend;

import com.lonkoo.backend.security.GithubTokenStore;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
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

import tools.jackson.databind.JsonNode;

/**
 * Envoi d'un projet généré sur GitHub (lot R8) contre un faux GitHub qui garde un vrai état : ce qui est poussé se
 * relit, les pannes (jeton, nom pris, débit, branche tardive, workflow refusé) se règlent. Le jeton ne doit
 * apparaître nulle part hors de la session et des appels vers GitHub.
 */
class GithubPushIntegrationTest extends AbstractPostgresIntegrationTest {

    /** Le jeton GitHub n'est pas un attribut de session : il vit dans le magasin en mémoire du serveur. */
    @Autowired
    private GithubTokenStore tokens;
    private static final FakeRealtimeServer REALTIME = FakeRealtimeServer.start();
    private static final FakeGithubApiServer GITHUB = FakeGithubApiServer.start();

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("realtime.internal-url", () -> "http://127.0.0.1:" + REALTIME.port());
        registry.add("github.api.base-url", GITHUB::url);
        registry.add("github.api.retry-delay-millis", () -> "5");
    }

    @AfterAll
    static void stopServers() {
        REALTIME.server.stop(0);
        GITHUB.server.stop(0);
    }

    @Autowired
    private JdbcClient jdbc;

    @BeforeEach
    void reset() throws IOException {
        REALTIME.reset(new String(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8));
        GITHUB.reset();
    }

    private record Setup(MockHttpSession owner, String project, String canvas, String generation, JsonNode state) {
    }

    /** Un invité, son canvas, une génération terminée, et un jeton GitHub dans sa session. */
    private Setup generated() throws Exception {
        MockHttpSession owner = newGuest();
        String project = JSON.readTree(call(get("/api/projects").session(owner)).getContentAsString()).get(0).get("id").asText();
        String canvas = JSON.readTree(call(get("/api/projects/" + project + "/canvases").session(owner)).getContentAsString())
                .get(0).get("id").asText();
        String id = JSON.readTree(call(post("/api/canvases/" + canvas + "/generate").session(owner)).getContentAsString())
                .get("generationId").asText();
        JsonNode state = await(owner, id, false);
        assertThat(state.get("status").asText()).as(state.toString()).isEqualTo("DONE");
        tokens.put(owner.getId(), GITHUB.token);
        return new Setup(owner, project, canvas, id, state);
    }

    private MockHttpSession newGuest() throws Exception {
        return (MockHttpSession) mockMvc.perform(post("/api/auth/guest")).andReturn().getRequest().getSession(false);
    }

    private MockHttpServletResponse call(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request).andReturn().getResponse();
    }

    private MockHttpServletResponse push(Setup setup, String body) throws Exception {
        var request = post("/api/generations/" + setup.generation() + "/push-github").session(setup.owner());
        if (body != null) {
            request = request.contentType("application/json").content(body);
        }
        return call(request);
    }

    /** Attend la fin de la génération ({@code push == false}) ou de l'envoi ({@code push == true}). */
    private JsonNode await(MockHttpSession session, String generation, boolean push) throws Exception {
        for (int i = 0; i < 300; i++) {
            JsonNode state = JSON.readTree(call(get("/api/generations/" + generation).session(session)).getContentAsString());
            String status = push ? state.get("push").get("status").asText("") : state.get("status").asText();
            if (!status.equals("PENDING") && !status.equals("RUNNING") && !status.isEmpty() && !status.equals("null")) {
                return state;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Le travail ne se termine pas");
    }

    private JsonNode pushed(Setup setup, String body) throws Exception {
        MockHttpServletResponse response = push(setup, body);
        assertThat(response.getStatus()).as(response.getContentAsString()).isEqualTo(202);
        return await(setup.owner(), setup.generation(), true).get("push");
    }

    private UUID userId(MockHttpSession session) throws Exception {
        return UUID.fromString(JSON.readTree(call(get("/api/me").session(session)).getContentAsString()).get("id").asText());
    }

    private int count(String sql, Object param) {
        return jdbc.sql(sql).param(param).query(Integer.class).single();
    }

    // ------------------------------------------------------------------ Succès

    @Test
    void theProjectIsPushedAsOneCommitWithEveryGeneratedFile() throws Exception {
        Setup setup = generated();

        MockHttpServletResponse response = push(setup, "{\"repoName\":\"ma-boutique\"}");
        assertThat(response.getStatus()).isEqualTo(202);
        assertThat(JSON.readTree(response.getContentAsString()).get("push").get("status").asText()).isIn("RUNNING", "DONE");
        JsonNode push = await(setup.owner(), setup.generation(), true).get("push");

        assertThat(push.get("status").asText()).as(push.toString()).isEqualTo("DONE");
        assertThat(push.get("repoFullName").asText()).isEqualTo("octocat/ma-boutique");
        assertThat(push.get("repoUrl").asText()).isEqualTo("https://github.com/octocat/ma-boutique");
        assertThat(push.get("commitSha").asText()).matches("[0-9a-f]{40}");
        assertThat(push.get("workflowSent").asBoolean()).isTrue();
        assertThat(push.get("warnings")).isEmpty();
        assertThat(push.get("error").isNull()).isTrue();
        assertThat(push.get("pushedAt").isNull()).isFalse();

        FakeGithubApiServer.Repo repo = GITHUB.repos.get("octocat/ma-boutique");
        assertThat(repo.isPrivate).isFalse();
        assertThat(repo.head).isEqualTo(push.get("commitSha").asText());
        List<String> paths = new ArrayList<>();
        setup.state().get("files").forEach(file -> paths.add(file.get("path").asText()));
        assertThat(repo.files().keySet()).containsExactlyInAnyOrderElementsOf(paths);
        assertThat(repo.files()).containsKey(".github/workflows/deploy-systalink.yml");
        for (String path : List.of("README.md", "openapi.yaml", "docker-compose.yml")) {
            String served = call(get("/api/generations/" + setup.generation() + "/files").param("path", path).session(setup.owner()))
                    .getContentAsString(StandardCharsets.UTF_8);
            assertThat(repo.files().get(path)).as(path).isEqualTo(served);
        }

        JsonNode create = GITHUB.callsTo("POST", "/user/repos").get(0).body();
        assertThat(create.get("name").asText()).isEqualTo("ma-boutique");
        assertThat(create.get("private").asBoolean()).isFalse();
        assertThat(create.get("auto_init").asBoolean()).isTrue();
        assertThat(create.get("description").asText()).startsWith("Projet généré par LONKOO");
        assertThat(GITHUB.calls).allMatch(c -> ("Bearer " + GITHUB.token).equals(c.authorization()));
        assertThat(count("select count(*) from audit_log where action = 'push.github' and target = ?", "generation:" + setup.generation()))
                .isEqualTo(1);
        assertThat(count("select count(*) from generations where id = ? and push_started_at is not null", UUID.fromString(setup.generation())))
                .as("l'heure de début de l'envoi est retenue (nettoyage des envois perdus)").isEqualTo(1);
    }

    @Test
    void theTokenIsNeverStoredOrReturned() throws Exception {
        Setup setup = generated();
        pushed(setup, null);

        assertThat(call(get("/api/generations/" + setup.generation()).session(setup.owner())).getContentAsString())
                .doesNotContain(GITHUB.token);
        assertThat(jdbc.sql("select count(*) from generations g where g::text like ?").param("%" + GITHUB.token + "%")
                .query(Integer.class).single()).isZero();
        assertThat(jdbc.sql("select count(*) from audit_log a where a::text like ?").param("%" + GITHUB.token + "%")
                .query(Integer.class).single()).isZero();
    }

    @Test
    void withoutAnyNameTheRepositoryTakesTheNameOfTheProjectFolder() throws Exception {
        Setup setup = generated();
        JsonNode push = pushed(setup, null);

        assertThat(push.get("status").asText()).isEqualTo("DONE");
        assertThat(push.get("repoFullName").asText()).isEqualTo("octocat/" + setup.state().get("slug").asText());
    }

    @Test
    void aPrivateRepositoryNeedsTheRepoScope() throws Exception {
        Setup setup = generated();

        JsonNode refused = pushed(setup, "{\"repoName\":\"prive\",\"visibility\":\"private\"}");
        assertThat(refused.get("status").asText()).isEqualTo("FAILED");
        assertThat(refused.get("error").asText()).contains("« repo »");
        assertThat(GITHUB.callsTo("POST", "/user/repos")).isEmpty();

        GITHUB.scopes = "repo, read:user, workflow";
        JsonNode accepted = pushed(setup, "{\"repoName\":\"prive\",\"visibility\":\"private\"}");
        assertThat(accepted.get("status").asText()).as(accepted.toString()).isEqualTo("DONE");
        assertThat(GITHUB.repos.get("octocat/prive").isPrivate).isTrue();
    }

    // ------------------------------------------------------------------ Fichier de workflow

    @Test
    void withoutTheWorkflowScopeTheWorkflowFileIsLeftOutWithAWarning() throws Exception {
        Setup setup = generated();
        GITHUB.scopes = "public_repo, read:user";

        JsonNode push = pushed(setup, "{\"repoName\":\"sans-workflow\"}");

        assertThat(push.get("status").asText()).as(push.toString()).isEqualTo("DONE");
        assertThat(push.get("workflowSent").asBoolean()).isFalse();
        assertThat(push.get("warnings")).hasSize(1);
        assertThat(push.get("warnings").get(0).asText()).contains("workflow").contains("archive");
        assertThat(GITHUB.repos.get("octocat/sans-workflow").files().keySet()).noneMatch(p -> p.startsWith(".github/workflows/"));
        assertThat(GITHUB.callsTo("POST", "/git/trees")).hasSize(1);
    }

    @Test
    void whenGithubDoesNotAnnounceScopesARefusedWorkflowIsRetriedWithoutIt() throws Exception {
        Setup setup = generated();
        GITHUB.scopes = null;

        JsonNode push = pushed(setup, "{\"repoName\":\"inconnu\"}");

        assertThat(push.get("status").asText()).as(push.toString()).isEqualTo("DONE");
        assertThat(push.get("workflowSent").asBoolean()).isFalse();
        assertThat(push.get("warnings").get(0).asText()).contains("workflow");
        assertThat(GITHUB.callsTo("POST", "/git/trees")).as("un essai refusé, un essai accepté").hasSize(2);
        assertThat(GITHUB.repos.get("octocat/inconnu").files().keySet()).noneMatch(p -> p.startsWith(".github/workflows/"));
    }

    // ------------------------------------------------------------------ Pannes de GitHub

    @Test
    void aRepositoryNameAlreadyTakenFailsClearlyAndAnotherNameWorks() throws Exception {
        Setup setup = generated();
        GITHUB.existingNames.add("deja-pris");

        JsonNode failed = pushed(setup, "{\"repoName\":\"deja-pris\"}");
        assertThat(failed.get("status").asText()).isEqualTo("FAILED");
        assertThat(failed.get("error").asText()).contains("deja-pris").contains("existe déjà");
        assertThat(failed.get("repoFullName").isNull()).isTrue();

        JsonNode retried = pushed(setup, "{\"repoName\":\"libre\"}");
        assertThat(retried.get("status").asText()).isEqualTo("DONE");
        assertThat(retried.get("error").isNull()).as("l'erreur précédente est effacée").isTrue();
    }

    @Test
    void aRevokedTokenIsReportedAndTheProjectStaysPushable() throws Exception {
        Setup setup = generated();
        tokens.put(setup.owner().getId(), "gho_revoque");

        JsonNode failed = pushed(setup, null);
        assertThat(failed.get("status").asText()).isEqualTo("FAILED");
        assertThat(failed.get("error").asText()).contains("reconnectez-vous");
        assertThat(GITHUB.callsTo("POST", "/user/repos")).isEmpty();

        tokens.put(setup.owner().getId(), GITHUB.token);
        assertThat(pushed(setup, null).get("status").asText()).isEqualTo("DONE");
    }

    @Test
    void theRateLimitOfGithubIsReported() throws Exception {
        Setup setup = generated();
        GITHUB.failAlways.put("/user/repos", 403);
        GITHUB.failBodies.put("/user/repos", "{\"message\":\"API rate limit exceeded for user ID 1.\"}");

        JsonNode failed = pushed(setup, null);

        assertThat(failed.get("status").asText()).isEqualTo("FAILED");
        assertThat(failed.get("error").asText()).contains("limite le nombre de requêtes");
    }

    @Test
    void aBranchThatAppearsLateAfterTheCreationIsWaitedFor() throws Exception {
        Setup setup = generated();
        GITHUB.refMissesAfterCreate = 3;

        JsonNode push = pushed(setup, null);

        assertThat(push.get("status").asText()).as(push.toString()).isEqualTo("DONE");
        assertThat(GITHUB.callsTo("GET", "/git/ref/heads/main")).hasSize(4);
    }

    @Test
    void aFailureAfterTheCreationLetsTheNextAttemptReuseTheRepository() throws Exception {
        Setup setup = generated();
        GITHUB.failOnce.put("/git/trees", 502);

        JsonNode failed = pushed(setup, "{\"repoName\":\"reprise\"}");
        assertThat(failed.get("status").asText()).isEqualTo("FAILED");
        assertThat(failed.get("error").asText()).contains("incident");
        assertThat(failed.get("repoFullName").asText()).as("le dépôt créé est retenu").isEqualTo("octocat/reprise");

        JsonNode retried = pushed(setup, "{\"repoName\":\"reprise\"}");
        assertThat(retried.get("status").asText()).as(retried.toString()).isEqualTo("DONE");
        assertThat(GITHUB.repos).hasSize(1);
        assertThat(GITHUB.repos.get("octocat/reprise").files()).containsKey("README.md").containsKey("openapi.yaml");
    }

    @Test
    void aRepositoryCreatedBySomeoneElseWithTheSameNameIsNotReused() throws Exception {
        Setup setup = generated();
        GITHUB.existingNames.add("pas-le-notre");
        // Même après un échec précédent d'un autre dépôt, seul le dépôt que NOUS avons créé est repris.
        jdbc.sql("update generations set repo_full_name = 'octocat/autre' where id = ?").param(UUID.fromString(setup.generation())).update();

        JsonNode failed = pushed(setup, "{\"repoName\":\"pas-le-notre\"}");

        assertThat(failed.get("status").asText()).isEqualTo("FAILED");
        assertThat(failed.get("error").asText()).contains("existe déjà");
        assertThat(GITHUB.callsTo("POST", "/git/trees")).isEmpty();
    }

    @Test
    void githubBeingDownIsReported() throws Exception {
        Setup setup = generated();
        GITHUB.dropConnections = true;

        JsonNode failed = pushed(setup, null);

        assertThat(failed.get("status").asText()).isEqualTo("FAILED");
        assertThat(failed.get("error").asText()).contains("injoignable");
    }

    // ------------------------------------------------------------------ Accès et états

    @Test
    void aGuestWithoutGithubIsToldToSignIn() throws Exception {
        Setup setup = generated();
        tokens.remove(setup.owner().getId());

        MockHttpServletResponse response = push(setup, null);

        assertThat(response.getStatus()).isEqualTo(403);
        JsonNode problem = JSON.readTree(response.getContentAsString());
        assertThat(problem.get("title").asText()).isEqualTo("Connexion GitHub requise");
        assertThat(GITHUB.calls).isEmpty();
        assertThat(count("select count(*) from generations where push_status is not null and id = ?", UUID.fromString(setup.generation())))
                .isZero();
    }

    @Test
    void accessIsCheckedBeforeAnythingAboutGithub() throws Exception {
        Setup setup = generated();
        MockHttpSession stranger = newGuest();
        tokens.put(stranger.getId(), GITHUB.token);
        MockHttpSession reader = newGuest();
        tokens.put(reader.getId(), GITHUB.token);
        jdbc.sql("insert into project_members (project_id, user_id, role) values (?, ?, 'READ')")
                .param(UUID.fromString(setup.project())).param(userId(reader)).update();
        String url = "/api/generations/" + setup.generation() + "/push-github";

        assertThat(call(post(url).session(stranger)).getStatus()).isEqualTo(404);
        assertThat(call(post(url).session(reader)).getStatus()).isEqualTo(403);
        assertThat(call(post(url)).getStatus()).isEqualTo(401);
        assertThat(GITHUB.calls).isEmpty();
    }

    @Test
    void anInvalidRepositoryNameIsRefusedBeforeAnyCall() throws Exception {
        Setup setup = generated();

        for (String name : List.of("a/b", "..", ".", "x.git", "X.GIT", "avec espace", "é", "-".repeat(101), "a;b")) {
            MockHttpServletResponse response = push(setup, "{\"repoName\":\"" + name + "\"}");
            assertThat(response.getStatus()).as(name).isEqualTo(400);
        }
        assertThat(push(setup, "{\"visibility\":\"secret\"}").getStatus()).isEqualTo(400);
        assertThat(GITHUB.calls).isEmpty();
        assertThat(count("select count(*) from generations where push_status is not null and id = ?", UUID.fromString(setup.generation())))
                .isZero();
    }

    @Test
    void aProjectAlreadyPushedOrBeingPushedCannotBePushedAgain() throws Exception {
        Setup setup = generated();
        assertThat(pushed(setup, "{\"repoName\":\"une-fois\"}").get("status").asText()).isEqualTo("DONE");

        MockHttpServletResponse again = push(setup, "{\"repoName\":\"deux-fois\"}");
        assertThat(again.getStatus()).isEqualTo(409);
        assertThat(JSON.readTree(again.getContentAsString()).get("detail").asText()).contains("octocat/une-fois");

        Setup running = generated();
        jdbc.sql("update generations set push_status = 'RUNNING' where id = ?").param(UUID.fromString(running.generation())).update();
        MockHttpServletResponse busy = push(running, null);
        assertThat(busy.getStatus()).isEqualTo(409);
        assertThat(JSON.readTree(busy.getContentAsString()).get("detail").asText()).contains("en cours");
    }

    @Test
    void aProjectNotYetGeneratedCannotBePushed() throws Exception {
        Setup setup = generated();
        UUID pending = jdbc.sql("insert into generations (canvas_id, target, status, project_name, snapshot) values (?, 'spring-boot', 'RUNNING', 'x', '{}'::jsonb) returning id")
                .param(UUID.fromString(setup.canvas())).query(UUID.class).single();

        MockHttpServletResponse response = call(post("/api/generations/" + pending + "/push-github").session(setup.owner()));

        assertThat(response.getStatus()).isEqualTo(409);
        assertThat(GITHUB.calls).isEmpty();
    }

    @Test
    void aRunningPushBlocksDeletion() throws Exception {
        Setup setup = generated();
        jdbc.sql("update generations set push_status = 'RUNNING' where id = ?").param(UUID.fromString(setup.generation())).update();

        assertThat(call(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .delete("/api/generations/" + setup.generation()).session(setup.owner())).getStatus()).isEqualTo(409);
    }
}
