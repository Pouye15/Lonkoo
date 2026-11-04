package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
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
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.lonkoo.backend.model.Role;

import tools.jackson.databind.JsonNode;

/**
 * Retirer un membre, quitter un projet, lister et révoquer les liens de partage : qui peut quoi, ce qui reste
 * en base (membres, liens, journal d'audit), la coupure des connexions temps réel, et la tenue face à des
 * demandes simultanées. Les droits route par route sont aussi dans {@code AccessMatrixIntegrationTest}.
 */
class MembersApiIntegrationTest extends AbstractPostgresIntegrationTest {

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

    /** Un projet d'invité (propriétaire), son canvas. */
    private record Team(Person owner, String project, String canvas) {
    }

    private record Person(MockHttpSession session, UUID id) {
    }

    // ------------------------------------------------------------------ La liste

    @Test
    void everyMemberSeesTheTeamOrderedByRoleAndWhatTheyMayDoWithEachOne() throws Exception {
        Team team = newTeam();
        Person reader = addMember(team, Role.READ);
        Person writer = addMember(team, Role.WRITE);
        Person maintainer = addMember(team, Role.MAINTAINER);
        addMember(team, Role.MAINTAINER);

        JsonNode asOwner = members(team, team.owner());
        assertThat(roles(asOwner)).containsExactly("OWNER", "MAINTAINER", "MAINTAINER", "WRITE", "READ");
        assertThat(removableBy(asOwner)).as("le propriétaire retire tous les autres, mais ne se retire pas")
                .containsExactly(false, true, true, true, true);
        assertThat(asOwner.get(0).get("you").asBoolean()).isTrue();
        assertThat(asOwner.get(0).get("userId").asText()).isEqualTo(team.owner().id().toString());

        JsonNode asMaintainer = members(team, maintainer);
        assertThat(roles(asMaintainer)).containsExactly("OWNER", "MAINTAINER", "MAINTAINER", "WRITE", "READ");
        for (JsonNode member : asMaintainer) {
            UUID id = UUID.fromString(member.get("userId").asText());
            boolean expected = id.equals(maintainer.id()) || id.equals(writer.id()) || id.equals(reader.id());
            assertThat(member.get("removable").asBoolean()).as("%s vu par un MAINTAINER", member.get("role").asText()).isEqualTo(expected);
            assertThat(member.get("you").asBoolean()).isEqualTo(id.equals(maintainer.id()));
        }

        JsonNode asReader = members(team, reader);
        for (JsonNode member : asReader) {
            boolean self = UUID.fromString(member.get("userId").asText()).equals(reader.id());
            assertThat(member.get("removable").asBoolean()).as("un lecteur ne peut que partir").isEqualTo(self);
        }
    }

    @Test
    void theListShowsWhoTheyAreAndNothingMoreThanThat() throws Exception {
        Team team = newTeam();
        addMember(team, Role.WRITE);

        JsonNode owner = members(team, team.owner()).get(0);
        Set<String> fields = new HashSet<>();
        owner.propertyNames().forEach(fields::add);

        assertThat(fields).containsExactlyInAnyOrder(
                "userId", "displayName", "login", "avatarUrl", "guest", "role", "joinedAt", "you", "removable");
        assertThat(owner.get("guest").asBoolean()).isTrue();
        assertThat(owner.get("login").asText()).isNotBlank();
    }

    // ------------------------------------------------------------------ Retirer quelqu'un

    @Test
    void theOwnerRemovesAWriterWhoLosesEveryAccessAndIsDisconnected() throws Exception {
        Team team = newTeam();
        Person writer = addMember(team, Role.WRITE);

        assertThat(status(delete(memberUrl(team, writer)).session(team.owner().session()))).isEqualTo(204);

        assertThat(count("select count(*) from project_members where project_id = ? and user_id = ?",
                UUID.fromString(team.project()), writer.id())).isZero();
        assertThat(status(get("/api/projects/" + team.project()).session(writer.session()))).isEqualTo(404);
        assertThat(status(get("/api/canvases/" + team.canvas()).session(writer.session()))).isEqualTo(404);
        assertThat(status(post("/api/canvases/" + team.canvas() + "/realtime-ticket").session(writer.session()))).as("plus de ticket de connexion").isEqualTo(404);
        assertThat(status(get("/api/projects/" + team.project() + "/members").session(writer.session()))).isEqualTo(404);
        assertThat(REALTIME.closedCanvases).as("les connexions ouvertes sont coupées").containsExactly(team.canvas());
        assertThat(REALTIME.closeBodies).as("celles de cette personne seulement")
                .singleElement().satisfies(body -> assertThat(JSON.readTree(body).get("userId").asText()).isEqualTo(writer.id().toString()));

        String detail = jdbc.sql("select detail::text from audit_log where action = 'member.removed' and target = ?")
                .param("project:" + team.project()).query(String.class).single();
        assertThat(JSON.readTree(detail).get("userId").asText()).isEqualTo(writer.id().toString());
        assertThat(JSON.readTree(detail).get("role").asText()).isEqualTo("WRITE");
        assertThat(count("select count(*) from audit_log where action = 'member.removed' and actor_id = ?", team.owner().id())).isEqualTo(1);
    }

    @Test
    void aMaintainerRemovesAnyoneBelowThemButNeitherAMaintainerNorTheOwner() throws Exception {
        Team team = newTeam();
        Person maintainer = addMember(team, Role.MAINTAINER);
        Person otherMaintainer = addMember(team, Role.MAINTAINER);
        Person secondOwner = addMember(team, Role.OWNER);
        Person reader = addMember(team, Role.READ);

        for (Person protectedMember : List.of(otherMaintainer, secondOwner, team.owner())) {
            assertThat(status(delete(memberUrl(team, protectedMember)).session(maintainer.session())))
                    .as("un MAINTAINER ne retire pas %s", protectedMember.id()).isEqualTo(403);
        }
        assertThat(count("select count(*) from project_members where project_id = ?", UUID.fromString(team.project()))).isEqualTo(5);
        assertThat(REALTIME.closedCanvases).as("un refus ne coupe personne").isEmpty();

        assertThat(status(delete(memberUrl(team, reader)).session(maintainer.session()))).isEqualTo(204);
        assertThat(status(delete(memberUrl(team, otherMaintainer)).session(team.owner().session()))).isEqualTo(204);
        assertThat(status(delete(memberUrl(team, secondOwner)).session(team.owner().session())))
                .as("même un propriétaire n'en retire pas un autre").isEqualTo(403);
    }

    @Test
    void aWriterOrAReaderCannotRemoveAnyoneAndLearnsNothingAboutWhoIsThere() throws Exception {
        Team team = newTeam();
        Person writer = addMember(team, Role.WRITE);
        Person reader = addMember(team, Role.READ);

        assertThat(status(delete(memberUrl(team, reader)).session(writer.session()))).isEqualTo(403);
        assertThat(status(delete(memberUrl(team, team.owner())).session(reader.session()))).isEqualTo(403);
        assertThat(status(delete("/api/projects/" + team.project() + "/members/" + UUID.randomUUID()).session(reader.session())))
                .as("même réponse pour un inconnu : le refus ne révèle pas qui est membre").isEqualTo(403);
        assertThat(count("select count(*) from project_members where project_id = ?", UUID.fromString(team.project()))).isEqualTo(3);
    }

    @Test
    void removingSomeoneWhoIsNotAMemberOfThisProjectChangesNothingElsewhere() throws Exception {
        Team team = newTeam();
        Team elsewhere = newTeam();

        assertThat(status(delete("/api/projects/" + team.project() + "/members/" + UUID.randomUUID()).session(team.owner().session()))).isEqualTo(404);
        assertThat(status(delete(memberUrl(team, elsewhere.owner())).session(team.owner().session()))).isEqualTo(404);

        assertThat(count("select count(*) from project_members where project_id = ? and user_id = ?",
                UUID.fromString(elsewhere.project()), elsewhere.owner().id())).as("son propre projet est intact").isEqualTo(1);
        assertThat(count("select count(*) from audit_log where action like 'member.%' and target = ?", "project:" + team.project())).isZero();
    }

    @Test
    void aRemovalHoldsEvenWhenTheRealtimeServerCannotBeReached() throws Exception {
        Team team = newTeam();
        Person writer = addMember(team, Role.WRITE);
        REALTIME.closeStatus = 500;

        assertThat(status(delete(memberUrl(team, writer)).session(team.owner().session()))).isEqualTo(204);

        assertThat(REALTIME.closedCanvases).containsExactly(team.canvas());
        assertThat(status(get("/api/projects/" + team.project()).session(writer.session()))).isEqualTo(404);
    }

    // ------------------------------------------------------------------ Quitter

    @Test
    void anyMemberButTheOwnerCanLeaveAndThenLosesTheProject() throws Exception {
        Team team = newTeam();
        for (Role role : List.of(Role.MAINTAINER, Role.WRITE, Role.TRIAGE, Role.READ)) {
            Person member = addMember(team, role);

            assertThat(status(delete(memberUrl(team, member)).session(member.session()))).as("%s part", role).isEqualTo(204);
            assertThat(REALTIME.closeBodies.get(REALTIME.closeBodies.size() - 1)).as("sa connexion est coupée, pas celle des autres")
                    .contains(member.id().toString());

            assertThat(status(get("/api/projects/" + team.project()).session(member.session()))).as("%s après son départ", role).isEqualTo(404);
            assertThat(count("select count(*) from audit_log where action = 'member.left' and actor_id = ?", member.id())).isEqualTo(1);
        }
        assertThat(REALTIME.closedCanvases).hasSize(4);
        assertThat(count("select count(*) from project_members where project_id = ?", UUID.fromString(team.project()))).as("il reste le propriétaire").isEqualTo(1);
    }

    @Test
    void theOwnerCannotLeaveTheirOwnProject() throws Exception {
        Team team = newTeam();
        addMember(team, Role.WRITE);

        assertThat(status(delete(memberUrl(team, team.owner())).session(team.owner().session()))).isEqualTo(409);

        assertThat(count("select count(*) from project_members where project_id = ? and user_id = ? and role = 'OWNER'",
                UUID.fromString(team.project()), team.owner().id())).isEqualTo(1);
        assertThat(count("select count(*) from audit_log where action like 'member.%' and target = ?", "project:" + team.project())).isZero();
        assertThat(REALTIME.closedCanvases).isEmpty();
    }

    @Test
    void aStrangerCannotLeaveAProjectTheyDoNotBelongTo() throws Exception {
        Team team = newTeam();
        Person stranger = newPerson();

        assertThat(status(delete(memberUrl(team, stranger)).session(stranger.session()))).isEqualTo(404);
        assertThat(count("select count(*) from audit_log where action like 'member.%' and target = ?", "project:" + team.project())).isZero();
    }

    // ------------------------------------------------------------------ Simultanéité

    @Test
    void whenTheMemberLeavesAsTheOwnerRemovesThemTheRemovalHappensExactlyOnce() throws Exception {
        Team team = newTeam();
        int threads = 12;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            // Plusieurs manches : une seule course serait gagnée à coup sûr par la chance.
            for (int round = 1; round <= 8; round++) {
                Person writer = addMember(team, Role.WRITE);
                CountDownLatch start = new CountDownLatch(1);
                List<Future<Integer>> results = new ArrayList<>();
                for (int i = 0; i < threads; i++) {
                    MockHttpSession session = i % 2 == 0 ? writer.session() : team.owner().session();
                    results.add(pool.submit(() -> {
                        start.await();
                        return status(delete(memberUrl(team, writer)).session(session));
                    }));
                }
                start.countDown();
                List<Integer> statuses = new ArrayList<>();
                for (Future<Integer> result : results) {
                    statuses.add(result.get(30, TimeUnit.SECONDS));
                }

                assertThat(statuses.stream().filter(s -> s == 204).count()).as("manche %d : un seul retrait", round).isEqualTo(1);
                assertThat(statuses.stream().filter(s -> s == 404).count()).as("manche %d : les autres trouvent déjà le membre parti", round)
                        .isEqualTo(threads - 1);
                assertThat(count("select count(*) from audit_log where action in ('member.left', 'member.removed') and detail->>'userId' = ?",
                        writer.id().toString())).as("manche %d : une seule ligne de journal", round).isEqualTo(1);
            }
        } finally {
            pool.shutdownNow();
        }
        assertThat(count("select count(*) from project_members where project_id = ?", UUID.fromString(team.project()))).isEqualTo(1);
    }

    // ------------------------------------------------------------------ Liens de partage : lister et révoquer

    @Test
    void theLinkListShowsLiveLinksWithoutTheirTokenToAMaintainerOnly() throws Exception {
        Team team = newTeam();
        JsonNode first = createLink(team, "READ", 24);
        JsonNode second = createLink(team, "WRITE", 48);
        JsonNode expired = createLink(team, "READ", 1);
        jdbc.sql("update share_links set expires_at = now() - interval '1 minute' where id = ?")
                .param(UUID.fromString(expired.get("id").asText())).update();

        String json = mockMvcBody(get("/api/canvases/" + team.canvas() + "/share-links").session(team.owner().session()));
        JsonNode links = JSON.readTree(json);

        assertThat(links).as("les liens expirés ne sont pas listés").hasSize(2);
        assertThat(links.get(0).get("id").asText()).as("le plus récent d'abord").isEqualTo(second.get("id").asText());
        assertThat(links.get(0).get("role").asText()).isEqualTo("WRITE");
        assertThat(links.get(1).get("id").asText()).isEqualTo(first.get("id").asText());
        assertThat(links.get(0).get("createdBy").asText()).isEqualTo(
                jdbc.sql("select coalesce(display_name, login) from users where id = ?").param(team.owner().id()).query(String.class).single());
        Set<String> fields = new HashSet<>();
        links.get(0).propertyNames().forEach(fields::add);
        assertThat(fields).as("ni le jeton ni l'adresse du lien")
                .containsExactlyInAnyOrder("id", "role", "expiresAt", "createdAt", "createdBy");
        assertThat(json).doesNotContain("/join/");

        Person writer = addMember(team, Role.WRITE);
        assertThat(status(get("/api/canvases/" + team.canvas() + "/share-links").session(writer.session()))).isEqualTo(403);
        Person maintainer = addMember(team, Role.MAINTAINER);
        assertThat(status(get("/api/canvases/" + team.canvas() + "/share-links").session(maintainer.session()))).isEqualTo(200);
    }

    @Test
    void revokingALinkStopsNewJoinsButKeepsThoseWhoAlreadyJoined() throws Exception {
        Team team = newTeam();
        JsonNode link = createLink(team, "WRITE", 24);
        String token = tokenOf(link);
        MockHttpSession early = newPerson().session();
        assertThat(status(post("/api/join/" + token).session(early))).isEqualTo(200);

        assertThat(status(delete("/api/canvases/" + team.canvas() + "/share-links/" + link.get("id").asText()).session(team.owner().session()))).isEqualTo(204);

        MockHttpSession late = newPerson().session();
        assertThat(status(post("/api/join/" + token).session(late))).as("un lien révoqué ne rattache plus personne").isEqualTo(404);
        assertThat(status(get("/api/projects/" + team.project()).session(late))).isEqualTo(404);
        assertThat(status(get("/api/projects/" + team.project()).session(early))).as("celui qui avait rejoint reste membre").isEqualTo(200);
        assertThat(count("select count(*) from audit_log where action = 'share.revoked' and target = ?", "canvas:" + team.canvas())).isEqualTo(1);
        assertThat(jdbc.sql("select detail::text from audit_log where action = 'share.revoked' and target = ?")
                .param("canvas:" + team.canvas()).query(String.class).single())
                .as("le journal garde l'identifiant du lien, jamais son jeton")
                .contains(link.get("id").asText()).doesNotContain(token);
    }

    @Test
    void revokingALinkTwiceOrThroughAnotherCanvasIsNotFoundAndChangesNothing() throws Exception {
        Team team = newTeam();
        Team elsewhere = newTeam();
        JsonNode mine = createLink(team, "READ", 24);
        JsonNode theirs = createLink(elsewhere, "READ", 24);

        assertThat(status(delete("/api/canvases/" + team.canvas() + "/share-links/" + theirs.get("id").asText()).session(team.owner().session())))
                .as("le lien d'un autre canvas").isEqualTo(404);
        assertThat(count("select count(*) from share_links where id = ?", UUID.fromString(theirs.get("id").asText()))).isEqualTo(1);

        assertThat(status(delete("/api/canvases/" + team.canvas() + "/share-links/" + mine.get("id").asText()).session(team.owner().session()))).isEqualTo(204);
        assertThat(status(delete("/api/canvases/" + team.canvas() + "/share-links/" + mine.get("id").asText()).session(team.owner().session()))).isEqualTo(404);
        assertThat(status(delete("/api/canvases/" + team.canvas() + "/share-links/" + UUID.randomUUID()).session(team.owner().session()))).isEqualTo(404);
        assertThat(count("select count(*) from audit_log where action = 'share.revoked' and target in (?, ?)",
                "canvas:" + team.canvas(), "canvas:" + elsewhere.canvas())).as("seule la vraie révocation est journalisée").isEqualTo(1);
    }

    @Test
    void aMaintainerRevokesALinkTheOwnerMadeButAWriterCannot() throws Exception {
        Team team = newTeam();
        JsonNode link = createLink(team, "READ", 24);
        String url = "/api/canvases/" + team.canvas() + "/share-links/" + link.get("id").asText();
        Person writer = addMember(team, Role.WRITE);
        Person maintainer = addMember(team, Role.MAINTAINER);

        assertThat(status(delete(url).session(writer.session()))).isEqualTo(403);
        assertThat(count("select count(*) from share_links where id = ?", UUID.fromString(link.get("id").asText()))).isEqualTo(1);
        assertThat(status(delete(url).session(maintainer.session()))).isEqualTo(204);
    }

    @Test
    void removingAMemberDoesNotCloseTheDoorWhileTheirLinkIsStillAlive() throws Exception {
        Team team = newTeam();
        JsonNode link = createLink(team, "WRITE", 24);
        String token = tokenOf(link);
        Person guest = newPerson();
        assertThat(status(post("/api/join/" + token).session(guest.session()))).isEqualTo(200);

        assertThat(status(delete(memberUrl(team, guest)).session(team.owner().session()))).isEqualTo(204);
        assertThat(status(post("/api/join/" + token).session(guest.session()))).as("le lien encore actif les ramène").isEqualTo(200);

        assertThat(status(delete(memberUrl(team, guest)).session(team.owner().session()))).isEqualTo(204);
        assertThat(status(delete("/api/canvases/" + team.canvas() + "/share-links/" + link.get("id").asText()).session(team.owner().session()))).isEqualTo(204);
        assertThat(status(post("/api/join/" + token).session(guest.session()))).as("retiré puis lien révoqué : c'est fini").isEqualTo(404);
        assertThat(status(get("/api/projects/" + team.project()).session(guest.session()))).isEqualTo(404);
    }

    // ------------------------------------------------------------------ Outils

    private Team newTeam() throws Exception {
        Person owner = newPerson();
        String project = firstId(get("/api/projects").session(owner.session()));
        String canvas = firstId(get("/api/projects/" + project + "/canvases").session(owner.session()));
        return new Team(owner, project, canvas);
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

    private JsonNode createLink(Team team, String role, int hours) throws Exception {
        String json = mockMvcBody(post("/api/canvases/" + team.canvas() + "/share-links").session(team.owner().session())
                .contentType("application/json").content("{\"role\":\"" + role + "\",\"ttlHours\":" + hours + "}"));
        return JSON.readTree(json);
    }

    private static String tokenOf(JsonNode link) {
        String url = link.get("url").asText();
        return url.substring(url.lastIndexOf('/') + 1);
    }

    private JsonNode members(Team team, Person viewer) throws Exception {
        return JSON.readTree(mockMvcBody(get("/api/projects/" + team.project() + "/members").session(viewer.session())));
    }

    private static List<String> roles(JsonNode members) {
        List<String> roles = new ArrayList<>();
        members.forEach(m -> roles.add(m.get("role").asText()));
        return roles;
    }

    private static List<Boolean> removableBy(JsonNode members) {
        List<Boolean> flags = new ArrayList<>();
        members.forEach(m -> flags.add(m.get("removable").asBoolean()));
        return flags;
    }

    private static String memberUrl(Team team, Person person) {
        return "/api/projects/" + team.project() + "/members/" + person.id();
    }

    private int status(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request).andReturn().getResponse().getStatus();
    }

    private String mockMvcBody(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request).andReturn().getResponse().getContentAsString();
    }

    private String firstId(MockHttpServletRequestBuilder request) throws Exception {
        return JSON.readTree(mockMvcBody(request)).get(0).get("id").asText();
    }

    private int count(String sql, Object... params) {
        var statement = jdbc.sql(sql);
        for (Object param : params) {
            statement = statement.param(param);
        }
        return statement.query(Integer.class).single();
    }
}
