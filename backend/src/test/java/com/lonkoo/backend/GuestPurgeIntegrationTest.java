package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

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

import com.lonkoo.backend.github.GithubAccountService;
import com.lonkoo.backend.model.GithubUser;
import com.lonkoo.backend.support.GuestCleanupTask;

import tools.jackson.databind.JsonNode;

/**
 * Purge quotidienne des invités expirés : un projet qu'un invité avait partagé ne disparaît pas avec lui, il passe
 * à un autre membre (compte GitHub d'abord, puis rôle le plus élevé, puis le plus ancien). Sans autre membre qui
 * reste, il est supprimé avec l'invité comme avant. Rattachement d'un invité à un compte GitHub : ses demandes de
 * génération et de déploiement suivent le compte.
 */
class GuestPurgeIntegrationTest extends AbstractPostgresIntegrationTest {

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
    private GuestCleanupTask cleanup;

    @Autowired
    private GithubAccountService accounts;

    @BeforeEach
    void resetRealtime() throws IOException {
        REALTIME.reset(new String(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8));
    }

    // ------------------------------------------------------------------ Outils

    private record Guest(MockHttpSession session, UUID id, UUID projectId, UUID canvasId) {
    }

    private MockHttpServletResponse call(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request).andReturn().getResponse();
    }

    /** Un invité avec son projet d'accueil. */
    private Guest newGuest() throws Exception {
        MockHttpSession session = (MockHttpSession) mockMvc.perform(post("/api/auth/guest")).andReturn().getRequest().getSession(false);
        UUID id = UUID.fromString(JSON.readTree(call(get("/api/me").session(session)).getContentAsString()).get("id").asText());
        UUID project = UUID.fromString(JSON.readTree(call(get("/api/projects").session(session)).getContentAsString()).get(0).get("id").asText());
        UUID canvas = UUID.fromString(JSON.readTree(call(get("/api/projects/" + project + "/canvases").session(session)).getContentAsString())
                .get(0).get("id").asText());
        return new Guest(session, id, project, canvas);
    }

    /** Un autre invité, déjà membre d'un projet donné avec le rôle donné. */
    private Guest guestMemberOf(Guest owner, String role, String createdAt) throws Exception {
        Guest member = newGuest();
        jdbc.sql("insert into project_members (project_id, user_id, role, created_at) values (?, ?, ?, ?::timestamptz)")
                .param(owner.projectId()).param(member.id()).param(role).param(createdAt).update();
        return member;
    }

    private UUID githubMemberOf(Guest owner, String role) {
        UUID id = jdbc.sql("insert into users (github_id, login, display_name, is_guest) values (?, ?, 'Compte', false) returning id")
                .param(ThreadLocalRandom.current().nextLong(1_000_000L, Long.MAX_VALUE / 4))
                .param("compte-" + UUID.randomUUID().toString().substring(0, 8))
                .query(UUID.class).single();
        jdbc.sql("insert into project_members (project_id, user_id, role) values (?, ?, ?)")
                .param(owner.projectId()).param(id).param(role).update();
        return id;
    }

    private void expire(UUID userId) {
        jdbc.sql("update users set expires_at = now() - interval '1 hour' where id = ?").param(userId).update();
    }

    private Optional<UUID> ownerOf(UUID projectId) {
        return jdbc.sql("select owner_id from projects where id = ?").param(projectId).query(UUID.class).optional();
    }

    private String roleOf(UUID projectId, UUID userId) {
        return jdbc.sql("select role from project_members where project_id = ? and user_id = ?")
                .param(projectId).param(userId).query(String.class).optional().orElse(null);
    }

    private int count(String sql, Object... params) {
        var statement = jdbc.sql(sql);
        for (Object param : params) {
            statement = statement.param(param);
        }
        return statement.query(Integer.class).single();
    }

    // ------------------------------------------------------------------ Transmission du projet

    @Test
    void aSharedProjectPassesToTheGithubAccountWhenItsGuestOwnerExpires() throws Exception {
        Guest owner = newGuest();
        Guest liveGuest = guestMemberOf(owner, "MAINTAINER", "2026-01-01T00:00:00Z");
        UUID github = githubMemberOf(owner, "READ");
        expire(owner.id());

        cleanup.purgeExpired();

        assertThat(ownerOf(owner.projectId())).as("le projet existe encore").contains(github);
        assertThat(roleOf(owner.projectId(), github)).isEqualTo("OWNER");
        assertThat(roleOf(owner.projectId(), liveGuest.id())).as("les autres gardent leur rôle").isEqualTo("MAINTAINER");
        assertThat(count("select count(*) from users where id = ?", owner.id())).isZero();
        assertThat(count("select count(*) from canvases where id = ?", owner.canvasId())).as("le canvas suit").isEqualTo(1);
        assertThat(count("select count(*) from project_members where project_id = ? and role = 'OWNER'", owner.projectId()))
                .as("un seul propriétaire").isEqualTo(1);
        var audit = jdbc.sql("select actor_id is null as system, detail->>'newOwner' as heir, detail->>'reason' as reason "
                + "from audit_log where action = 'project.ownership_transferred' and target = ?")
                .param("project:" + owner.projectId()).query().singleRow();
        assertThat(audit).containsEntry("system", true).containsEntry("heir", github.toString()).containsEntry("reason", "guest_expired");
    }

    @Test
    void withoutADurableAccountTheHighestRoleInheritsAndTheOldestBreaksATie() throws Exception {
        Guest owner = newGuest();
        Guest writer = guestMemberOf(owner, "WRITE", "2026-01-01T00:00:00Z");
        Guest youngMaintainer = guestMemberOf(owner, "MAINTAINER", "2026-03-01T00:00:00Z");
        Guest oldMaintainer = guestMemberOf(owner, "MAINTAINER", "2026-02-01T00:00:00Z");
        expire(owner.id());

        cleanup.purgeExpired();

        assertThat(ownerOf(owner.projectId())).contains(oldMaintainer.id());
        assertThat(roleOf(owner.projectId(), oldMaintainer.id())).isEqualTo("OWNER");
        assertThat(roleOf(owner.projectId(), youngMaintainer.id())).isEqualTo("MAINTAINER");
        assertThat(roleOf(owner.projectId(), writer.id())).isEqualTo("WRITE");
    }

    @Test
    void aGithubAccountInheritsEvenWithALowerRoleThanALiveGuest() throws Exception {
        // Le projet doit survivre au-delà de la journée suivante : un compte durable passe avant un invité.
        Guest owner = newGuest();
        guestMemberOf(owner, "MAINTAINER", "2026-01-01T00:00:00Z");
        UUID github = githubMemberOf(owner, "TRIAGE");
        expire(owner.id());

        cleanup.purgeExpired();

        assertThat(ownerOf(owner.projectId())).contains(github);
    }

    @Test
    void aProjectWhoseOtherMembersExpireTooIsDeletedAsBefore() throws Exception {
        Guest owner = newGuest();
        Guest otherExpiring = guestMemberOf(owner, "WRITE", "2026-01-01T00:00:00Z");
        expire(owner.id());
        expire(otherExpiring.id());

        cleanup.purgeExpired();

        assertThat(ownerOf(owner.projectId())).isEmpty();
        assertThat(count("select count(*) from canvases where project_id = ?", owner.projectId())).isZero();
        assertThat(count("select count(*) from audit_log where action = 'project.ownership_transferred' and target = ?",
                "project:" + owner.projectId())).isZero();
    }

    @Test
    void aProjectWithNoOtherMemberIsDeleted() throws Exception {
        Guest owner = newGuest();
        expire(owner.id());

        cleanup.purgeExpired();

        assertThat(ownerOf(owner.projectId())).isEmpty();
    }

    @Test
    void anExpiredGuestMemberJustLeavesTheProjectOfALiveOwner() throws Exception {
        Guest owner = newGuest();
        Guest member = guestMemberOf(owner, "WRITE", "2026-01-01T00:00:00Z");
        expire(member.id());

        cleanup.purgeExpired();

        assertThat(ownerOf(owner.projectId())).contains(owner.id());
        assertThat(roleOf(owner.projectId(), owner.id())).isEqualTo("OWNER");
        assertThat(roleOf(owner.projectId(), member.id())).isNull();
        assertThat(count("select count(*) from audit_log where action = 'project.ownership_transferred' and target = ?",
                "project:" + owner.projectId())).isZero();
    }

    @Test
    void eachProjectGoesToItsOwnHeirAndOthersAreUntouched() throws Exception {
        Guest first = newGuest();
        Guest second = newGuest();
        Guest untouched = newGuest();
        UUID firstHeir = githubMemberOf(first, "WRITE");
        UUID secondHeir = githubMemberOf(second, "READ");
        expire(first.id());
        expire(second.id());

        cleanup.purgeExpired();

        assertThat(ownerOf(first.projectId())).contains(firstHeir);
        assertThat(ownerOf(second.projectId())).contains(secondHeir);
        assertThat(ownerOf(untouched.projectId())).contains(untouched.id());
    }

    @Test
    void theHeirCanThenManageTheProjectThroughTheApi() throws Exception {
        Guest owner = newGuest();
        String token = JSON.readTree(call(post("/api/canvases/" + owner.canvasId() + "/share-links").session(owner.session())
                .contentType("application/json").content("{\"role\":\"READ\"}")).getContentAsString()).get("url").asText();
        token = token.substring(token.lastIndexOf('/') + 1);
        MockHttpSession colleague = (MockHttpSession) mockMvc.perform(post("/api/auth/guest")).andReturn().getRequest().getSession(false);
        UUID colleagueId = UUID.fromString(JSON.readTree(call(get("/api/me").session(colleague)).getContentAsString()).get("id").asText());
        assertThat(call(post("/api/join/" + token).session(colleague)).getStatus()).isEqualTo(200);
        assertThat(JSON.readTree(call(get("/api/projects/" + owner.projectId()).session(colleague)).getContentAsString()).get("ownerId").asText())
                .isEqualTo(owner.id().toString());
        expire(owner.id());

        cleanup.purgeExpired();

        JsonNode project = JSON.readTree(call(get("/api/projects/" + owner.projectId()).session(colleague)).getContentAsString());
        assertThat(project.get("ownerId").asText()).isEqualTo(colleagueId.toString());
        assertThat(call(post("/api/canvases/" + owner.canvasId() + "/share-links").session(colleague)
                .contentType("application/json").content("{\"role\":\"READ\"}")).getStatus()).as("il peut partager").isEqualTo(201);
        assertThat(call(get("/api/projects/" + owner.projectId()).session(owner.session())).getStatus())
                .as("l'ancien propriétaire (sa ligne est supprimée) n'a plus aucun accès").isEqualTo(404);
        assertThat(call(delete("/api/projects/" + owner.projectId()).session(colleague)).getStatus()).as("il peut supprimer").isEqualTo(204);
    }

    // ------------------------------------------------------------------ Rattachement d'un invité

    @Test
    void whenAGuestSignsInItsGenerationsAndDeploymentsFollowTheAccount() throws Exception {
        Guest guest = newGuest();
        UUID generation = jdbc.sql("insert into generations (canvas_id, requested_by, target, status, project_name, snapshot) "
                + "values (?, ?, 'spring-boot', 'FAILED', 'x', '{}'::jsonb) returning id")
                .param(guest.canvasId()).param(guest.id()).query(UUID.class).single();
        UUID deployment = jdbc.sql("insert into deployments (generation_id, requested_by, method, status) "
                + "values (?, ?, 'MANUAL', 'MANUAL') returning id")
                .param(generation).param(guest.id()).query(UUID.class).single();

        var user = accounts.signIn(new GithubUser(ThreadLocalRandom.current().nextLong(1_000_000L, Long.MAX_VALUE / 4), "rattache", "Rattaché", null),
                Optional.of(guest.id()));

        assertThat(count("select count(*) from users where id = ?", guest.id())).isZero();
        assertThat(jdbc.sql("select requested_by from generations where id = ?").param(generation).query(UUID.class).single()).isEqualTo(user.id());
        assertThat(jdbc.sql("select requested_by from deployments where id = ?").param(deployment).query(UUID.class).single()).isEqualTo(user.id());
    }
}
