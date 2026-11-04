package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.lonkoo.backend.model.Role;

import tools.jackson.databind.JsonNode;

/**
 * Projets publics : toute personne connectée les consulte en lecture seule (jamais plus), seul le propriétaire
 * publie ou retire la publication, repasser en privé sort les visiteurs sans toucher aux membres, et la galerie
 * ne liste que les projets publics de comptes GitHub. Les droits route par route d'un projet privé sont dans
 * {@code AccessMatrixIntegrationTest}.
 */
class PublicProjectsIntegrationTest extends AbstractPostgresIntegrationTest {

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

    private record Person(MockHttpSession session, UUID id) {
    }

    private record Team(Person owner, String project, String canvas, String version) {
    }

    // ------------------------------------------------------------------ Lire un projet public

    @Test
    void aPublicProjectIsReadOnlyForAnySignedInPersonAndNothingElse() throws Exception {
        Team team = newTeam();
        Person visitor = newPerson();
        String project = "/api/projects/" + team.project();
        String canvas = "/api/canvases/" + team.canvas();

        assertThat(status(get(project).session(visitor.session()))).as("privé : invisible").isEqualTo(404);
        publish(team, "public");

        assertThat(status(get(project).session(visitor.session()))).isEqualTo(200);
        JsonNode canvases = JSON.readTree(body(get(project + "/canvases").session(visitor.session())));
        assertThat(canvases.get(0).get("role").asText()).as("rôle de lecture seule").isEqualTo("READ");
        assertThat(JSON.readTree(body(get(canvas).session(visitor.session()))).get("role").asText()).isEqualTo("READ");
        assertThat(status(get(canvas + "/versions").session(visitor.session()))).isEqualTo(200);
        assertThat(status(get(canvas + "/versions/" + team.version()).session(visitor.session()))).isEqualTo(200);
        assertThat(status(get(canvas + "/snapshot").session(visitor.session()))).isEqualTo(200);
        JsonNode ticket = JSON.readTree(body(post(canvas + "/realtime-ticket").session(visitor.session())));
        assertThat(ticket.get("role").asText()).as("le serveur temps réel le met en lecture seule").isEqualTo("READ");

        String json = "application/json";
        assertThat(status(patch(project).session(visitor.session()).contentType(json).content("{\"name\":\"x\"}"))).isEqualTo(403);
        assertThat(status(delete(project).session(visitor.session()))).isEqualTo(403);
        assertThat(status(post(project + "/canvases").session(visitor.session()).contentType(json).content("{\"name\":\"x\"}"))).isEqualTo(403);
        assertThat(status(post(canvas + "/versions").session(visitor.session()).contentType(json).content("{\"name\":\"x\"}"))).isEqualTo(403);
        assertThat(status(post(canvas + "/versions/" + team.version() + "/restore").session(visitor.session()))).isEqualTo(403);
        assertThat(status(post(canvas + "/share-links").session(visitor.session()).contentType(json).content("{\"role\":\"READ\"}"))).isEqualTo(403);
        assertThat(status(get(canvas + "/share-links").session(visitor.session()))).isEqualTo(403);
        assertThat(status(post(canvas + "/generate").session(visitor.session()).contentType(json).content("{}"))).isEqualTo(403);

        assertThat(status(get(project + "/members").session(visitor.session()))).as("l'équipe n'est pas publique").isEqualTo(404);
        assertThat(status(delete(project + "/members/" + team.owner().id()).session(visitor.session()))).isEqualTo(404);
        assertThat(status(get(canvas + "/generations").session(visitor.session())))
                .as("ni les générations, ni les dépôts GitHub : réservés aux membres").isEqualTo(404);

        assertThat(count("select count(*) from project_members where project_id = ?", UUID.fromString(team.project()))).as("le visiteur n'est pas devenu membre").isEqualTo(1);
        assertThat(body(get("/api/projects").session(visitor.session()))).as("pas dans ses propres projets").doesNotContain(team.project());
    }

    @Test
    void everyoneWhoSeesAProjectSeesWhoOwnsIt() throws Exception {
        Team team = newTeam();
        Person writer = addMember(team, Role.WRITE);
        Person visitor = newPerson();
        publish(team, "public");
        String ownerLogin = jdbc.sql("select login from users where id = ?").param(team.owner().id()).query(String.class).single();

        assertThat(JSON.readTree(body(get("/api/projects/" + team.project()).session(visitor.session()))).get("ownerLogin").asText())
                .as("le visiteur voit le propriétaire, pas son propre identifiant").isEqualTo(ownerLogin);
        JsonNode theirs = JSON.readTree(body(get("/api/projects").session(writer.session())));
        for (JsonNode project : theirs) {
            if (project.get("id").asText().equals(team.project())) {
                assertThat(project.get("ownerLogin").asText()).as("un membre aussi").isEqualTo(ownerLogin);
            }
        }
        assertThat(body(get("/api/projects").session(writer.session()))).contains(team.project());
    }

    @Test
    void publishingNeverDowngradesAMemberAndPrivateHidesItAgain() throws Exception {
        Team team = newTeam();
        Person writer = addMember(team, Role.WRITE);
        Person visitor = newPerson();
        publish(team, "public");

        assertThat(JSON.readTree(body(post("/api/canvases/" + team.canvas() + "/realtime-ticket").session(writer.session()))).get("role").asText())
                .isEqualTo("WRITE");
        assertThat(status(post("/api/canvases/" + team.canvas() + "/versions").session(writer.session())
                .contentType("application/json").content("{\"name\":\"v2\"}"))).isEqualTo(201);

        publish(team, "private");
        assertThat(status(get("/api/projects/" + team.project()).session(visitor.session()))).isEqualTo(404);
        assertThat(status(get("/api/canvases/" + team.canvas() + "/snapshot").session(visitor.session()))).isEqualTo(404);
        assertThat(status(get("/api/projects/" + team.project()).session(writer.session()))).as("les membres gardent leur accès").isEqualTo(200);
    }

    // ------------------------------------------------------------------ Qui publie

    @Test
    void onlyTheOwnerChangesTheVisibility() throws Exception {
        Team team = newTeam();
        Person maintainer = addMember(team, Role.MAINTAINER);
        String project = "/api/projects/" + team.project();
        String json = "application/json";

        assertThat(status(patch(project).session(maintainer.session()).contentType(json).content("{\"visibility\":\"public\"}"))).isEqualTo(403);
        assertThat(status(patch(project).session(maintainer.session()).contentType(json).content("{\"name\":\"renomme\",\"visibility\":\"public\"}")))
                .as("tout ou rien : le nom ne change pas non plus").isEqualTo(403);
        assertThat(jdbc.sql("select visibility || ':' || name from projects where id = ?").param(UUID.fromString(team.project())).query(String.class).single())
                .startsWith("private:").doesNotContain("renomme");
        assertThat(count("select count(*) from audit_log where action = 'project.visibility' and target = ?", "project:" + team.project())).isZero();

        assertThat(status(patch(project).session(maintainer.session()).contentType(json).content("{\"description\":\"maj\"}")))
                .as("la description reste l'affaire d'un MAINTAINER").isEqualTo(200);

        assertThat(status(patch(project).session(team.owner().session()).contentType(json).content("{\"visibility\":\"public\"}"))).isEqualTo(200);
        assertThat(count("select count(*) from audit_log where action = 'project.visibility' and actor_id = ?", team.owner().id())).isEqualTo(1);
    }

    // ------------------------------------------------------------------ Repasser en privé

    @Test
    void goingPrivateDisconnectsVisitorsButKeepsEveryMemberConnected() throws Exception {
        Team team = newTeam();
        Person writer = addMember(team, Role.WRITE);
        Person reader = addMember(team, Role.READ);
        publish(team, "public");
        assertThat(REALTIME.closeBodies).as("publier ne coupe personne").isEmpty();
        publish(team, "public");
        assertThat(REALTIME.closeBodies).as("déjà public : rien à couper").isEmpty();

        publish(team, "private");

        assertThat(REALTIME.closedCanvases).containsExactly(team.canvas());
        JsonNode closed = JSON.readTree(REALTIME.closeBodies.get(0));
        Set<String> kept = new HashSet<>();
        closed.get("exceptUserIds").forEach(id -> kept.add(id.asText()));
        assertThat(kept).as("tous les membres restent, personne d'autre")
                .containsExactlyInAnyOrder(team.owner().id().toString(), writer.id().toString(), reader.id().toString());

        publish(team, "private");
        assertThat(REALTIME.closeBodies).as("déjà privé : rien à couper").hasSize(1);
    }

    @Test
    void goingPrivateHoldsEvenWhenTheRealtimeServerCannotBeReached() throws Exception {
        Team team = newTeam();
        Person visitor = newPerson();
        publish(team, "public");
        REALTIME.closeStatus = 500;

        publish(team, "private");

        assertThat(REALTIME.closedCanvases).containsExactly(team.canvas());
        assertThat(status(get("/api/projects/" + team.project()).session(visitor.session()))).isEqualTo(404);
    }

    // ------------------------------------------------------------------ La galerie

    @Test
    void theGalleryListsOnlyPublicProjectsOfGithubAccountsNewestFirst() throws Exception {
        Person viewer = newPerson();
        UUID account = githubUser("ada-" + UUID.randomUUID().toString().substring(0, 8), "Ada Lovelace");
        UUID older = project(account, "Ancien", "public", 120);
        UUID newer = project(account, "Récent", "public", 10);
        UUID hidden = project(account, "Secret", "private", 5);
        Team guestTeam = newTeam();
        publish(guestTeam, "public");

        JsonNode gallery = JSON.readTree(body(get("/api/projects/public").session(viewer.session())));
        List<String> ids = new ArrayList<>();
        gallery.forEach(p -> ids.add(p.get("id").asText()));

        assertThat(ids).contains(newer.toString(), older.toString());
        assertThat(ids.indexOf(newer.toString())).as("le plus récent d'abord").isLessThan(ids.indexOf(older.toString()));
        assertThat(ids).as("ni privé").doesNotContain(hidden.toString());
        assertThat(ids).as("ni projet public d'invité").doesNotContain(guestTeam.project());

        JsonNode card = gallery.get(ids.indexOf(newer.toString()));
        Set<String> fields = new HashSet<>();
        card.propertyNames().forEach(fields::add);
        assertThat(fields).as("une fiche, rien de plus").containsExactlyInAnyOrder("id", "name", "description", "ownerName", "ownerLogin", "updatedAt");
        assertThat(card.get("ownerName").asText()).isEqualTo("Ada Lovelace");
        assertThat(card.get("name").asText()).isEqualTo("Récent");

        assertThat(status(get("/api/projects/" + newer).session(viewer.session()))).as("la fiche mène au projet").isEqualTo(200);
    }

    @Test
    void theGalleryRespectsItsLimitsAndNeedsASession() throws Exception {
        Person viewer = newPerson();
        UUID account = githubUser("grace-" + UUID.randomUUID().toString().substring(0, 8), null);
        for (int i = 0; i < 3; i++) {
            project(account, "Projet " + i, "public", i);
        }

        assertThat(JSON.readTree(body(get("/api/projects/public").param("limit", "2").session(viewer.session()))).size()).isEqualTo(2);
        assertThat(JSON.readTree(body(get("/api/projects/public").param("limit", "0").session(viewer.session()))).size()).as("au moins un").isEqualTo(1);
        assertThat(JSON.readTree(body(get("/api/projects/public").param("limit", "100000").session(viewer.session()))).size()).as("50 au plus").isLessThanOrEqualTo(50);
        JsonNode first = JSON.readTree(body(get("/api/projects/public").param("limit", "1").session(viewer.session()))).get(0);
        assertThat(first.get("ownerName").asText()).as("sans nom affiché, l'identifiant GitHub").isNotBlank();

        assertThat(status(get("/api/projects/public"))).isEqualTo(401);
    }

    // ------------------------------------------------------------------ Outils

    private Team newTeam() throws Exception {
        Person owner = newPerson();
        String project = firstId(get("/api/projects").session(owner.session()));
        String canvas = firstId(get("/api/projects/" + project + "/canvases").session(owner.session()));
        String version = JSON.readTree(body(post("/api/canvases/" + canvas + "/versions").session(owner.session())
                .contentType("application/json").content("{\"name\":\"v1\"}"))).get("id").asText();
        return new Team(owner, project, canvas, version);
    }

    private Person newPerson() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")).andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        String me = mockMvc.perform(get("/api/me").session(session)).andReturn().getResponse().getContentAsString();
        return new Person(session, UUID.fromString(JSON.readTree(me).get("id").asText()));
    }

    private Person addMember(Team team, Role role) throws Exception {
        Person person = newPerson();
        jdbc.sql("insert into project_members (project_id, user_id, role) values (?, ?, ?)")
                .param(UUID.fromString(team.project())).param(person.id()).param(role.name()).update();
        return person;
    }

    /** Le propriétaire change la visibilité, par l'API. */
    private void publish(Team team, String visibility) throws Exception {
        assertThat(status(patch("/api/projects/" + team.project()).session(team.owner().session())
                .contentType("application/json").content("{\"visibility\":\"" + visibility + "\"}"))).isEqualTo(200);
    }

    /** Un compte GitHub (une ligne, pas de session : seule la galerie le regarde). */
    private UUID githubUser(String login, String displayName) {
        UUID id = UUID.randomUUID();
        jdbc.sql("insert into users (id, github_id, login, display_name, is_guest) values (?, ?, ?, ?, false)")
                .param(id).param(Math.abs(id.getMostSignificantBits() % 1_000_000_000L) + 1_000_000L).param(login).param(displayName).update();
        return id;
    }

    private UUID project(UUID owner, String name, String visibility, int minutesAgo) {
        UUID id = UUID.randomUUID();
        jdbc.sql("insert into projects (id, name, description, visibility, owner_id, updated_at) values (?, ?, 'desc', ?, ?, now() - make_interval(mins => ?))")
                .param(id).param(name).param(visibility).param(owner).param(minutesAgo).update();
        jdbc.sql("insert into project_members (project_id, user_id, role) values (?, ?, 'OWNER')").param(id).param(owner).update();
        return id;
    }

    private int status(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request).andReturn().getResponse().getStatus();
    }

    private String body(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request).andReturn().getResponse().getContentAsString();
    }

    private String firstId(MockHttpServletRequestBuilder request) throws Exception {
        return JSON.readTree(body(request)).get(0).get("id").asText();
    }

    private int count(String sql, Object... params) {
        var statement = jdbc.sql(sql);
        for (Object param : params) {
            statement = statement.param(param);
        }
        return statement.query(Integer.class).single();
    }
}
