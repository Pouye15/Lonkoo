package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;

import com.lonkoo.backend.model.Role;

import tools.jackson.databind.JsonNode;

/**
 * Discussion d'un projet : tout membre lit et écrit, un étranger ne voit rien, le texte est gardé tel quel, la limite de
 * débit et l'élagage tiennent, et l'historique survit à l'auteur. Les droits route par route sont aussi dans
 * {@code AccessMatrixIntegrationTest}.
 */
class DiscussionApiIntegrationTest extends AbstractPostgresIntegrationTest {

    @Autowired
    private JdbcClient jdbc;

    private record Person(MockHttpSession session, UUID id) {
    }

    private record Team(Person owner, UUID project) {
    }

    // ------------------------------------------------------------------ Lire et écrire

    @Test
    void everyMemberWritesAndReadsTheSameConversationInOrder() throws Exception {
        Team team = newTeam();
        Person reader = addMember(team, Role.READ);
        Person writer = addMember(team, Role.WRITE);

        say(team, team.owner(), "Je propose une base PostgreSQL.");
        say(team, reader, "Et une file pour les notifications ?");
        say(team, writer, "D'accord pour les deux.");

        for (Person viewer : List.of(team.owner(), reader, writer)) {
            JsonNode messages = messages(team, viewer, "");
            assertThat(bodies(messages)).containsExactly(
                    "Je propose une base PostgreSQL.", "Et une file pour les notifications ?", "D'accord pour les deux.");
            for (JsonNode message : messages) {
                boolean mine = UUID.fromString(message.get("authorId").asText()).equals(viewer.id());
                assertThat(message.get("mine").asBoolean()).as("« mine » vu par chacun").isEqualTo(mine);
            }
        }
    }

    @Test
    void aMessageShowsWhoWroteItAndNothingMoreThanThat() throws Exception {
        Team team = newTeam();
        JsonNode created = say(team, team.owner(), "Bonjour");

        Set<String> fields = new HashSet<>();
        created.propertyNames().forEach(fields::add);
        assertThat(fields).containsExactlyInAnyOrder("id", "authorId", "authorName", "avatarUrl", "body", "createdAt", "mine");
        assertThat(created.get("authorName").asText()).isNotBlank();
        assertThat(created.get("mine").asBoolean()).isTrue();
    }

    @Test
    void twoGuestsWhoBothAreCalledGuestCanBeToldApart() throws Exception {
        Team team = newTeam();
        Person other = addMember(team, Role.WRITE);

        String first = say(team, team.owner(), "Je suis le premier").get("authorName").asText();
        String second = say(team, other, "Et moi le second").get("authorName").asText();

        assertThat(first).startsWith("Invité ").isNotEqualTo(second);
        assertThat(second).startsWith("Invité ");
        assertThat(say(team, team.owner(), "Encore moi").get("authorName").asText()).as("le même nom d'un message à l'autre").isEqualTo(first);
    }

    @Test
    void aStrangerSeesNothingAndWritesNothing() throws Exception {
        Team team = newTeam();
        say(team, team.owner(), "Confidentiel");
        Person stranger = newPerson();

        assertThat(status(get(url(team)).session(stranger.session()))).isEqualTo(404);
        assertThat(status(post(url(team)).session(stranger.session()).contentType("application/json").content("{\"body\":\"intrus\"}")))
                .isEqualTo(404);
        assertThat(count("select count(*) from project_messages where project_id = ?", team.project())).isEqualTo(1);
    }

    @Test
    void aMemberWhoIsRemovedLosesTheConversationButTheHistoryStays() throws Exception {
        Team team = newTeam();
        Person member = addMember(team, Role.WRITE);
        say(team, member, "Avant mon départ");

        jdbc.sql("delete from project_members where project_id = ? and user_id = ?").param(team.project()).param(member.id()).update();

        assertThat(status(get(url(team)).session(member.session()))).isEqualTo(404);
        assertThat(bodies(messages(team, team.owner(), ""))).containsExactly("Avant mon départ");
    }

    // ------------------------------------------------------------------ Le texte

    @Test
    void theTextIsKeptExactlyAsWrittenAndNeverInterpreted() throws Exception {
        Team team = newTeam();
        String text = "<script>alert(1)</script> & \"guillemets\" https://exemple.org/a?b=1&c=2 😀";

        JsonNode created = say(team, team.owner(), "  " + text + "  ");

        assertThat(created.get("body").asText()).as("espaces de bord retirés, le reste intact").isEqualTo(text);
        assertThat(bodies(messages(team, team.owner(), ""))).containsExactly(text);
    }

    @Test
    void anEmptyOrTooLongMessageIsRefusedBeforeReachingTheDatabase() throws Exception {
        Team team = newTeam();

        for (String body : List.of("", "   ", "\n\t")) {
            assertThat(send(team, team.owner(), body)).as("« %s »", body.replace("\n", "\\n").replace("\t", "\\t")).isEqualTo(400);
        }
        assertThat(send(team, team.owner(), "x".repeat(2001))).isEqualTo(400);
        assertThat(count("select count(*) from project_messages where project_id = ?", team.project())).isZero();

        assertThat(send(team, team.owner(), "x".repeat(2000))).as("2 000 caractères passent").isEqualTo(201);
        assertThat(status(post(url(team)).session(team.owner().session()).contentType("application/json").content("{}")))
                .as("sans champ « body »").isEqualTo(400);
    }

    // ------------------------------------------------------------------ Lire par morceaux

    @Test
    void theLatestMessagesComeFirstWhenOpeningAndOnlyTheNewOnesAfterwards() throws Exception {
        Team team = newTeam();
        List<Long> ids = new ArrayList<>();
        for (int i = 1; i <= 5; i++) {
            ids.add(say(team, team.owner(), "m" + i).get("id").asLong());
        }

        assertThat(bodies(messages(team, team.owner(), "?limit=3"))).as("les 3 derniers, dans l'ordre").containsExactly("m3", "m4", "m5");
        assertThat(bodies(messages(team, team.owner(), "?after=" + ids.get(1)))).containsExactly("m3", "m4", "m5");
        assertThat(messages(team, team.owner(), "?after=" + ids.get(4)).size()).as("rien de nouveau").isZero();
        assertThat(bodies(messages(team, team.owner(), "?after=" + ids.get(0) + "&limit=2"))).containsExactly("m2", "m3");
        assertThat(messages(team, team.owner(), "?limit=0").size()).as("une limite à 0 est ramenée à 1").isEqualTo(1);
    }

    @Test
    void theNumberOfMessagesPerPageIsCapped() throws Exception {
        Team team = newTeam();
        jdbc.sql("""
                insert into project_messages (project_id, user_id, author_name, body, created_at)
                select ?, ?, 'Auteur', 'message ' || n, now() - interval '1 day' + n * interval '1 second'
                from generate_series(1, 150) n
                """).param(team.project()).param(team.owner().id()).update();

        assertThat(messages(team, team.owner(), "?limit=1000").size()).isEqualTo(100);
        assertThat(messages(team, team.owner(), "").size()).as("50 par défaut").isEqualTo(50);
    }

    // ------------------------------------------------------------------ Garde-fous

    @Test
    void aPersonWhoWritesTooFastIsSlowedDownOthersAreNot() throws Exception {
        Team team = newTeam();
        Person other = addMember(team, Role.WRITE);

        for (int i = 1; i <= 20; i++) {
            assertThat(send(team, team.owner(), "message " + i)).as("message %d", i).isEqualTo(201);
        }
        MockHttpServletResponse refused = perform(team, team.owner(), "le vingt et unième");
        assertThat(refused.getStatus()).isEqualTo(429);
        assertThat(refused.getContentType()).startsWith("application/problem+json");
        assertThat(Integer.parseInt(refused.getHeader("Retry-After"))).as("dit dans combien de secondes réessayer").isBetween(1, 60);
        assertThat(count("select count(*) from project_messages where project_id = ?", team.project())).as("refusé, rien d'écrit").isEqualTo(20);

        assertThat(send(team, other, "moi, je peux")).as("la limite est par personne").isEqualTo(201);
        assertThat(status(get(url(team)).session(team.owner().session()))).as("lire reste possible").isEqualTo(200);
    }

    @Test
    void onlyTheLatestThousandMessagesOfAProjectAreKept() throws Exception {
        Team team = newTeam();
        jdbc.sql("""
                insert into project_messages (project_id, user_id, author_name, body, created_at)
                select ?, ?, 'Auteur', 'ancien ' || n, now() - interval '1 day' + n * interval '1 second'
                from generate_series(1, 1000) n
                """).param(team.project()).param(team.owner().id()).update();

        say(team, team.owner(), "le plus récent");

        assertThat(count("select count(*) from project_messages where project_id = ?", team.project())).isEqualTo(1000);
        assertThat(count("select count(*) from project_messages where project_id = ? and body = 'ancien 1'", team.project()))
                .as("le plus ancien est parti").isZero();
        assertThat(count("select count(*) from project_messages where project_id = ? and body = 'le plus récent'", team.project())).isEqualTo(1);
        assertThat(count("select count(*) from project_messages where project_id = ? and body = 'ancien 2'", team.project()))
                .as("le suivant est gardé").isEqualTo(1);
    }

    // ------------------------------------------------------------------ Durée de vie

    @Test
    void theHistoryOutlivesItsAuthorWhoIsPurged() throws Exception {
        Team team = newTeam();
        Person guest = addMember(team, Role.WRITE);
        String name = say(team, guest, "Je ne serai plus là demain").get("authorName").asText();

        jdbc.sql("delete from users where id = ?").param(guest.id()).update();

        JsonNode message = messages(team, team.owner(), "").get(0);
        assertThat(message.get("body").asText()).isEqualTo("Je ne serai plus là demain");
        assertThat(message.get("authorName").asText()).as("le nom affiché à l'envoi").isEqualTo(name);
        assertThat(message.get("authorId").isNull()).isTrue();
        assertThat(message.get("avatarUrl").isNull()).isTrue();
        assertThat(message.get("mine").asBoolean()).isFalse();
    }

    @Test
    void deletingAProjectDeletesItsConversation() throws Exception {
        Team team = newTeam();
        say(team, team.owner(), "Bientôt supprimé");

        jdbc.sql("delete from projects where id = ?").param(team.project()).update();

        assertThat(count("select count(*) from project_messages where project_id = ?", team.project())).isZero();
    }

    // ------------------------------------------------------------------ Outils

    private static String url(Team team) {
        return "/api/projects/" + team.project() + "/messages";
    }

    private Team newTeam() throws Exception {
        Person owner = newPerson();
        String project = JSON.readTree(mockMvc.perform(get("/api/projects").session(owner.session())).andReturn()
                .getResponse().getContentAsString()).get(0).get("id").asText();
        return new Team(owner, UUID.fromString(project));
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
                .param(team.project()).param(person.id()).param(role.name()).update();
        return person;
    }

    private MockHttpServletResponse perform(Team team, Person who, String body) throws Exception {
        String json = JSON.writeValueAsString(java.util.Map.of("body", body));
        return mockMvc.perform(post(url(team)).session(who.session()).contentType("application/json").content(json))
                .andReturn().getResponse();
    }

    private int send(Team team, Person who, String body) throws Exception {
        return perform(team, who, body).getStatus();
    }

    private JsonNode say(Team team, Person who, String body) throws Exception {
        MockHttpServletResponse response = perform(team, who, body);
        assertThat(response.getStatus()).as("envoi de « %s »", body).isEqualTo(201);
        return JSON.readTree(response.getContentAsString());
    }

    private JsonNode messages(Team team, Person viewer, String query) throws Exception {
        MockHttpServletResponse response = mockMvc.perform(get(url(team) + query).session(viewer.session())).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        return JSON.readTree(response.getContentAsString());
    }

    private static List<String> bodies(JsonNode messages) {
        List<String> bodies = new ArrayList<>();
        messages.forEach(m -> bodies.add(m.get("body").asText()));
        return bodies;
    }

    private int status(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request).andReturn().getResponse().getStatus();
    }

    private int count(String sql, Object... params) {
        var statement = jdbc.sql(sql);
        for (Object param : params) {
            statement = statement.param(param);
        }
        return statement.query(Integer.class).single();
    }
}
