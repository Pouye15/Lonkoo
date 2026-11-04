package com.lonkoo.backend;

import com.lonkoo.backend.security.GithubTokenStore;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
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

import com.lonkoo.backend.generation.DeploymentService;

import tools.jackson.databind.JsonNode;

/**
 * Déploiement d'un projet généré (lot R8) contre un faux GitHub : lancement du workflow, suivi de l'exécution,
 * repli sur des étapes manuelles quand LONKOO ne peut pas lancer le workflow, accès, plafonds, état de la connexion
 * GitHub. Le serveur n'appelle jamais l'adresse publique donnée par l'utilisateur.
 */
class DeploymentIntegrationTest extends AbstractPostgresIntegrationTest {

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
        registry.add("lonkoo.deployments.refresh-millis", () -> "0");
    }

    @AfterAll
    static void stopServers() {
        REALTIME.server.stop(0);
        GITHUB.server.stop(0);
    }

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private DeploymentService deploymentService;

    @BeforeEach
    void reset() throws IOException {
        REALTIME.reset(new String(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8));
        GITHUB.reset();
        GITHUB.scopes = "repo, read:user, workflow";
    }

    private record Project(MockHttpSession owner, String projectId, String generation, String repo) {
    }

    private MockHttpSession newGuest() throws Exception {
        return (MockHttpSession) mockMvc.perform(post("/api/auth/guest")).andReturn().getRequest().getSession(false);
    }

    private MockHttpServletResponse call(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request).andReturn().getResponse();
    }

    /** Un invité avec un jeton GitHub, un projet généré, et (si demandé) déjà envoyé sur GitHub. */
    private Project generated(boolean pushed) throws Exception {
        MockHttpSession owner = newGuest();
        String projectId = JSON.readTree(call(get("/api/projects").session(owner)).getContentAsString()).get(0).get("id").asText();
        String canvas = JSON.readTree(call(get("/api/projects/" + projectId + "/canvases").session(owner)).getContentAsString())
                .get(0).get("id").asText();
        String generation = JSON.readTree(call(post("/api/canvases/" + canvas + "/generate").session(owner)).getContentAsString())
                .get("generationId").asText();
        awaitGeneration(owner, generation, false);
        tokens.put(owner.getId(), GITHUB.token);
        String repo = null;
        if (pushed) {
            String name = "projet-" + UUID.randomUUID().toString().substring(0, 8);
            assertThat(call(post("/api/generations/" + generation + "/push-github").session(owner)
                    .contentType("application/json").content("{\"repoName\":\"" + name + "\"}")).getStatus()).isEqualTo(202);
            JsonNode push = awaitGeneration(owner, generation, true).get("push");
            assertThat(push.get("status").asText()).as(push.toString()).isEqualTo("DONE");
            repo = push.get("repoFullName").asText();
        }
        return new Project(owner, projectId, generation, repo);
    }

    private JsonNode awaitGeneration(MockHttpSession session, String generation, boolean push) throws Exception {
        for (int i = 0; i < 300; i++) {
            JsonNode state = JSON.readTree(call(get("/api/generations/" + generation).session(session)).getContentAsString());
            String status = push ? state.get("push").get("status").asText("") : state.get("status").asText();
            if (!status.isEmpty() && !status.equals("null") && !status.equals("PENDING") && !status.equals("RUNNING")) {
                return state;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Le travail ne se termine pas");
    }

    private JsonNode deploy(Project project, String body) throws Exception {
        var request = post("/api/generations/" + project.generation() + "/deploy").session(project.owner());
        if (body != null) {
            request = request.contentType("application/json").content(body);
        }
        MockHttpServletResponse response = call(request);
        assertThat(response.getStatus()).as(response.getContentAsString()).isEqualTo(202);
        return JSON.readTree(response.getContentAsString());
    }

    private JsonNode deployment(MockHttpSession session, String id) throws Exception {
        MockHttpServletResponse response = call(get("/api/deployments/" + id).session(session));
        assertThat(response.getStatus()).as(response.getContentAsString()).isEqualTo(200);
        return JSON.readTree(response.getContentAsString());
    }

    /** Relit l'état jusqu'à ce qu'il quitte {@code PENDING} (le lancement est asynchrone). */
    private JsonNode launched(Project project, String id) throws Exception {
        for (int i = 0; i < 300; i++) {
            JsonNode state = deployment(project.owner(), id);
            if (!state.get("status").asText().equals("PENDING")) {
                return state;
            }
            Thread.sleep(50);
        }
        throw new AssertionError("Le lancement ne se termine pas");
    }

    private int count(String sql, Object param) {
        return jdbc.sql(sql).param(param).query(Integer.class).single();
    }

    // ------------------------------------------------------------------ Lancement et suivi

    @Test
    void theWorkflowIsLaunchedFollowedAndEndsDeployed() throws Exception {
        Project project = generated(true);

        JsonNode created = deploy(project, "{\"publicUrl\":\"https://demo.example.com\"}");
        assertThat(created.get("method").asText()).isEqualTo("WORKFLOW");
        assertThat(created.get("status").asText()).isIn("PENDING", "RUNNING");
        assertThat(created.get("manual").isNull()).isTrue();
        String id = created.get("id").asText();

        JsonNode running = launched(project, id);
        assertThat(running.get("status").asText()).as(running.toString()).isEqualTo("RUNNING");
        assertThat(running.get("runUrl").asText()).startsWith("https://github.com/" + project.repo() + "/actions/runs/");
        assertThat(running.get("publicUrl").asText()).isEqualTo("https://demo.example.com");
        var dispatch = GITHUB.callsTo("POST", "/dispatches").get(0);
        assertThat(dispatch.path()).isEqualTo("/repos/" + project.repo() + "/actions/workflows/deploy-systalink.yml/dispatches");
        assertThat(dispatch.body().get("ref").asText()).isEqualTo("main");
        assertThat(dispatch.authorization()).isEqualTo("Bearer " + GITHUB.token);

        GITHUB.lastRun().status = "in_progress";
        assertThat(deployment(project.owner(), id).get("detail").asText()).contains("s'exécute");

        GITHUB.lastRun().status = "completed";
        GITHUB.lastRun().conclusion = "success";
        JsonNode done = deployment(project.owner(), id);
        assertThat(done.get("status").asText()).isEqualTo("DEPLOYED");
        assertThat(done.get("detail").asText()).contains("succès");

        // Un état final ne bouge plus, même si GitHub dit autre chose ensuite.
        GITHUB.lastRun().conclusion = "failure";
        assertThat(deployment(project.owner(), id).get("status").asText()).isEqualTo("DEPLOYED");
        assertThat(count("select count(*) from audit_log where action = 'deployment.requested' and target = ?", "generation:" + project.generation()))
                .isEqualTo(1);
    }

    @Test
    void whenGithubGivesTheRunIdItIsUsedDirectly() throws Exception {
        Project project = generated(true);
        GITHUB.dispatchReturnsRun = true;

        JsonNode running = launched(project, deploy(project, null).get("id").asText());

        assertThat(running.get("status").asText()).isEqualTo("RUNNING");
        assertThat(running.get("runUrl").asText()).endsWith("/actions/runs/" + GITHUB.lastRun().id);
        assertThat(GITHUB.callsTo("GET", "/runs?")).as("pas de recherche d'exécution").isEmpty();
    }

    @Test
    void aRunThatAppearsLateIsWaitedForThenFoundOnTheNextRead() throws Exception {
        Project project = generated(true);
        GITHUB.runsHiddenPolls = 3;

        JsonNode running = launched(project, deploy(project, null).get("id").asText());
        assertThat(running.get("runUrl").asText()).as("trouvée après quelques essais").contains("/actions/runs/");

        // Si elle n'apparaît pas pendant le lancement, la lecture suivante la retrouve.
        Project other = generated(true);
        GITHUB.runsHiddenPolls = 100;
        JsonNode waiting = launched(other, deploy(other, null).get("id").asText());
        assertThat(waiting.get("status").asText()).isEqualTo("RUNNING");
        assertThat(waiting.get("runUrl").isNull()).isTrue();
        assertThat(waiting.get("detail").asText()).contains("pas encore visible");
        GITHUB.runsHiddenPolls = 0;
        JsonNode found = deployment(other.owner(), waiting.get("id").asText());
        assertThat(found.get("runUrl").asText()).contains("/actions/runs/");
    }

    @Test
    void aFailedRunEndsFailedWithAHintAndNoRawGithubText() throws Exception {
        Project project = generated(true);
        String id = deploy(project, null).get("id").asText();
        launched(project, id);
        GITHUB.lastRun().status = "completed";
        GITHUB.lastRun().conclusion = "failure";

        JsonNode failed = deployment(project.owner(), id);

        assertThat(failed.get("status").asText()).isEqualTo("FAILED");
        assertThat(failed.get("detail").asText()).contains("(failure)").contains("SYSTALINK");
    }

    @Test
    void aCancelledRunIsAFailureToo() throws Exception {
        Project project = generated(true);
        String id = deploy(project, null).get("id").asText();
        launched(project, id);
        GITHUB.lastRun().status = "completed";
        GITHUB.lastRun().conclusion = "cancelled";

        assertThat(deployment(project.owner(), id).get("status").asText()).isEqualTo("FAILED");
    }

    // ------------------------------------------------------------------ Repli sur les étapes manuelles

    @Test
    void withoutTheRepoScopeTheDeploymentFallsBackToManualSteps() throws Exception {
        Project project = generated(true);
        GITHUB.scopes = "public_repo, read:user, workflow";

        JsonNode manual = launched(project, deploy(project, null).get("id").asText());

        assertThat(manual.get("method").asText()).isEqualTo("MANUAL");
        assertThat(manual.get("status").asText()).isEqualTo("MANUAL");
        assertThat(manual.get("detail").asText()).contains("n'autorise pas").contains("« repo »");
        JsonNode steps = manual.get("manual");
        assertThat(steps.get("actionsUrl").asText()).isEqualTo("https://github.com/" + project.repo() + "/actions/workflows/deploy-systalink.yml");
        assertThat(steps.get("secretsUrl").asText()).isEqualTo("https://github.com/" + project.repo() + "/settings/secrets/actions");
        assertThat(steps.get("secrets")).extracting(JsonNode::asText).containsExactly("SYSTALINK_SSH_HOST", "SYSTALINK_SSH_USER",
                "SYSTALINK_SSH_PRIVATE_KEY", "SYSTALINK_SSH_KNOWN_HOSTS");
        String folder = project.repo().substring(project.repo().indexOf('/') + 1);
        assertThat(steps.get("commands")).extracting(JsonNode::asText).containsExactly(
                "git clone https://github.com/" + project.repo() + ".git", "cd " + folder, "cp .env.example .env", "docker compose up -d --build");
        assertThat(GITHUB.runs).isEmpty();
    }

    @Test
    void aProjectPushedWithoutItsWorkflowIsManualRightAway() throws Exception {
        GITHUB.scopes = "public_repo, read:user";   // pas d'autorisation « workflow » : le fichier n'est pas parti
        Project project = generated(true);
        assertThat(JSON.readTree(call(get("/api/generations/" + project.generation()).session(project.owner())).getContentAsString())
                .get("push").get("workflowSent").asBoolean()).isFalse();
        GITHUB.calls.clear();

        JsonNode created = deploy(project, null);

        assertThat(created.get("status").asText()).isEqualTo("MANUAL");
        assertThat(created.get("detail").asText()).contains("workflow").contains("pas dans le dépôt");
        assertThat(created.get("manual").isNull()).isFalse();
        assertThat(GITHUB.calls).as("aucun appel à GitHub").isEmpty();
    }

    @Test
    void theManualModeNeedsNoGithubConnectionAndNoCall() throws Exception {
        Project project = generated(true);
        tokens.remove(project.owner().getId());
        GITHUB.calls.clear();

        JsonNode created = deploy(project, "{\"mode\":\"manual\"}");

        assertThat(created.get("method").asText()).isEqualTo("MANUAL");
        assertThat(created.get("status").asText()).isEqualTo("MANUAL");
        assertThat(created.get("manual").get("commands")).hasSize(4);
        assertThat(GITHUB.calls).isEmpty();
    }

    // ------------------------------------------------------------------ Pannes de GitHub

    @Test
    void aRevokedTokenFailsTheLaunchClearly() throws Exception {
        Project project = generated(true);
        tokens.put(project.owner().getId(), "gho_revoque");

        JsonNode failed = launched(project, deploy(project, null).get("id").asText());

        assertThat(failed.get("status").asText()).isEqualTo("FAILED");
        assertThat(failed.get("detail").asText()).contains("reconnectez-vous");
    }

    @Test
    void githubBeingDownFailsTheLaunchAndLaterReadsStillAnswer() throws Exception {
        Project project = generated(true);
        GITHUB.dropConnections = true;

        JsonNode failed = launched(project, deploy(project, null).get("id").asText());

        assertThat(failed.get("status").asText()).isEqualTo("FAILED");
        assertThat(failed.get("detail").asText()).contains("injoignable");
    }

    @Test
    void aFailedFollowUpKeepsTheStoredStateInsteadOfFailingTheRead() throws Exception {
        Project project = generated(true);
        String id = deploy(project, null).get("id").asText();
        launched(project, id);
        GITHUB.dropConnections = true;

        JsonNode state = deployment(project.owner(), id);

        assertThat(state.get("status").asText()).isEqualTo("RUNNING");
    }

    // ------------------------------------------------------------------ Conditions et accès

    @Test
    void aProjectNotPushedCannotBeDeployed() throws Exception {
        Project project = generated(false);

        MockHttpServletResponse response = call(post("/api/generations/" + project.generation() + "/deploy").session(project.owner()));

        assertThat(response.getStatus()).isEqualTo(409);
        assertThat(JSON.readTree(response.getContentAsString()).get("detail").asText()).contains("Envoyez d'abord");
        assertThat(count("select count(*) from deployments where generation_id = ?", UUID.fromString(project.generation()))).isZero();
    }

    @Test
    void aGuestWithoutGithubIsToldToSignInUnlessHeDeploysHimself() throws Exception {
        Project project = generated(true);
        tokens.remove(project.owner().getId());

        MockHttpServletResponse response = call(post("/api/generations/" + project.generation() + "/deploy").session(project.owner()));

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(JSON.readTree(response.getContentAsString()).get("title").asText()).isEqualTo("Connexion GitHub requise");
    }

    @Test
    void accessFollowsTheRolesOfTheCanvas() throws Exception {
        Project project = generated(true);
        String id = deploy(project, "{\"mode\":\"manual\"}").get("id").asText();
        MockHttpSession stranger = newGuest();
        tokens.put(stranger.getId(), GITHUB.token);
        MockHttpSession reader = newGuest();
        tokens.put(reader.getId(), GITHUB.token);
        UUID readerId = UUID.fromString(JSON.readTree(call(get("/api/me").session(reader)).getContentAsString()).get("id").asText());
        jdbc.sql("insert into project_members (project_id, user_id, role) values (?, ?, 'READ')")
                .param(UUID.fromString(project.projectId())).param(readerId).update();
        String deployUrl = "/api/generations/" + project.generation() + "/deploy";
        String listUrl = "/api/generations/" + project.generation() + "/deployments";

        assertThat(call(post(deployUrl).session(stranger)).getStatus()).isEqualTo(404);
        assertThat(call(get(listUrl).session(stranger)).getStatus()).isEqualTo(404);
        assertThat(call(get("/api/deployments/" + id).session(stranger)).getStatus()).isEqualTo(404);
        assertThat(call(post(deployUrl).session(reader)).getStatus()).isEqualTo(403);
        assertThat(call(get(listUrl).session(reader)).getStatus()).isEqualTo(200);
        assertThat(call(get("/api/deployments/" + id).session(reader)).getStatus()).isEqualTo(200);
        assertThat(call(post(deployUrl)).getStatus()).isEqualTo(401);
        assertThat(call(get("/api/deployments/" + id)).getStatus()).isEqualTo(401);
        assertThat(call(get("/api/deployments/" + UUID.randomUUID()).session(project.owner())).getStatus()).isEqualTo(404);
    }

    @Test
    void aReaderPollingWithoutAnyGithubTokenGetsTheStoredStateAndCallsNothing() throws Exception {
        Project project = generated(true);
        String id = deploy(project, null).get("id").asText();
        launched(project, id);
        MockHttpSession reader = newGuest();
        UUID readerId = UUID.fromString(JSON.readTree(call(get("/api/me").session(reader)).getContentAsString()).get("id").asText());
        jdbc.sql("insert into project_members (project_id, user_id, role) values (?, ?, 'READ')")
                .param(UUID.fromString(project.projectId())).param(readerId).update();
        GITHUB.calls.clear();
        GITHUB.lastRun().status = "completed";
        GITHUB.lastRun().conclusion = "success";

        JsonNode state = deployment(reader, id);

        assertThat(state.get("status").asText()).as("seul quelqu'un qui a un jeton rafraîchit").isEqualTo("RUNNING");
        assertThat(GITHUB.calls).isEmpty();
    }

    @Test
    void aSecondDeploymentWhileOneRunsIsRefused() throws Exception {
        Project project = generated(true);
        deploy(project, null);

        MockHttpServletResponse response = call(post("/api/generations/" + project.generation() + "/deploy").session(project.owner()));

        assertThat(response.getStatus()).isEqualTo(409);
        assertThat(JSON.readTree(response.getContentAsString()).get("detail").asText()).contains("déjà en cours");
    }

    @Test
    void theNumberOfDeploymentsPerProjectIsLimited() throws Exception {
        Project project = generated(true);
        for (int i = 0; i < 20; i++) {
            jdbc.sql("insert into deployments (generation_id, method, status) values (?, 'MANUAL', 'MANUAL')")
                    .param(UUID.fromString(project.generation())).update();
        }

        MockHttpServletResponse response = call(post("/api/generations/" + project.generation() + "/deploy")
                .session(project.owner()).contentType("application/json").content("{\"mode\":\"manual\"}"));

        assertThat(response.getStatus()).isEqualTo(409);
        assertThat(JSON.readTree(response.getContentAsString()).get("title").asText()).isEqualTo("Limite atteinte");
    }

    @Test
    void thePublicAddressIsValidatedAndNeverCalled() throws Exception {
        Project project = generated(true);

        for (String bad : List.of("javascript:alert(1)", "ftp://exemple.com", "http://utilisateur:secret@exemple.com", "https://a b.com",
                "https://" + "a".repeat(200) + ".com", "exemple.com", "file:///etc/passwd")) {
            MockHttpServletResponse response = call(post("/api/generations/" + project.generation() + "/deploy").session(project.owner())
                    .contentType("application/json").content("{\"mode\":\"manual\",\"publicUrl\":\"" + bad + "\"}"));
            assertThat(response.getStatus()).as(bad).isEqualTo(400);
        }
        assertThat(call(post("/api/generations/" + project.generation() + "/deploy").session(project.owner())
                .contentType("application/json").content("{\"mode\":\"turbo\"}")).getStatus()).isEqualTo(400);
        assertThat(count("select count(*) from deployments where generation_id = ?", UUID.fromString(project.generation()))).isZero();

        JsonNode ok = deploy(project, "{\"mode\":\"manual\",\"publicUrl\":\"http://127.0.0.1:9/interne\"}");
        assertThat(ok.get("publicUrl").asText()).isEqualTo("http://127.0.0.1:9/interne");
    }

    @Test
    void listingShowsTheLatestFirst() throws Exception {
        Project project = generated(true);
        JsonNode first = deploy(project, "{\"mode\":\"manual\"}");
        JsonNode second = deploy(project, "{\"mode\":\"manual\"}");

        JsonNode list = JSON.readTree(call(get("/api/generations/" + project.generation() + "/deployments").session(project.owner()))
                .getContentAsString());

        assertThat(list).extracting(n -> n.get("id").asText()).containsExactly(second.get("id").asText(), first.get("id").asText());
    }

    @Test
    void aLaunchInterruptedByARestartIsMarkedFailed() throws Exception {
        Project project = generated(true);
        UUID pending = jdbc.sql("insert into deployments (generation_id, method, status) values (?, 'WORKFLOW', 'PENDING') returning id")
                .param(UUID.fromString(project.generation())).query(UUID.class).single();
        UUID running = jdbc.sql("insert into deployments (generation_id, method, status, run_id) values (?, 'WORKFLOW', 'RUNNING', 42) returning id")
                .param(UUID.fromString(project.generation())).query(UUID.class).single();

        deploymentService.recoverInterruptedJobs();

        assertThat(deployment(project.owner(), pending.toString()).get("status").asText()).isEqualTo("FAILED");
        assertThat(deployment(project.owner(), pending.toString()).get("detail").asText()).contains("redémarrage");
        assertThat(jdbc.sql("select status from deployments where id = ?").param(running).query(String.class).single())
                .as("une exécution déjà lancée se suit toujours").isEqualTo("RUNNING");
    }

    // ------------------------------------------------------------------ État de la connexion GitHub

    @Test
    void theGithubStatusTellsWhatTheConnectionAllows() throws Exception {
        MockHttpSession session = newGuest();

        JsonNode none = JSON.readTree(call(get("/api/github/status").session(session)).getContentAsString());
        assertThat(none.get("connected").asBoolean()).isFalse();
        assertThat(none.get("expired").asBoolean()).isFalse();

        tokens.put(session.getId(), GITHUB.token);
        GITHUB.scopes = "public_repo, read:user";
        JsonNode basic = JSON.readTree(call(get("/api/github/status").session(session)).getContentAsString());
        assertThat(basic.get("connected").asBoolean()).isTrue();
        assertThat(basic.get("login").asText()).isEqualTo("octocat");
        assertThat(basic.get("canPublish").asBoolean()).isTrue();
        assertThat(basic.get("canPrivate").asBoolean()).isFalse();
        assertThat(basic.get("canDeploy").asBoolean()).isFalse();
        assertThat(basic.toString()).doesNotContain(GITHUB.token);

        GITHUB.scopes = "repo, read:user, workflow";
        JsonNode full = JSON.readTree(call(get("/api/github/status").session(session)).getContentAsString());
        assertThat(full.get("canPrivate").asBoolean()).isTrue();
        assertThat(full.get("canDeploy").asBoolean()).isTrue();
        assertThat(Set.copyOf(full.get("scopes").valueStream().map(JsonNode::asText).toList())).containsExactlyInAnyOrder("repo", "read:user", "workflow");

        GITHUB.scopes = null;
        JsonNode unknown = JSON.readTree(call(get("/api/github/status").session(session)).getContentAsString());
        assertThat(unknown.get("connected").asBoolean()).isTrue();
        assertThat(unknown.get("canDeploy").isNull()).isTrue();

        tokens.put(session.getId(), "gho_revoque");
        JsonNode expired = JSON.readTree(call(get("/api/github/status").session(session)).getContentAsString());
        assertThat(expired.get("connected").asBoolean()).isFalse();
        assertThat(expired.get("expired").asBoolean()).isTrue();

        tokens.put(session.getId(), GITHUB.token);
        GITHUB.dropConnections = true;
        assertThat(call(get("/api/github/status").session(session)).getStatus()).isEqualTo(503);
        assertThat(call(get("/api/github/status")).getStatus()).isEqualTo(401);
    }
}
