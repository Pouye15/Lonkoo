package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
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
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.lonkoo.backend.ai.AiQuota;
import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.security.SessionSecurityContextRepository;

/**
 * Le quota d'appels à l'IA : un plafond par jour par personne (plus bas pour un invité), un plafond pour tout le
 * service, un appel compté seulement quand il part vraiment vers le fournisseur, et jamais de texte gardé.
 */
@TestPropertySource(properties = {
        "lonkoo.ai.provider=fake",
        "lonkoo.ai.daily-quota=3",
        "lonkoo.ai.guest-daily-quota=2",
        "lonkoo.ai.chat-daily-quota=4",
        "lonkoo.ai.chat-guest-daily-quota=2",
        "lonkoo.ai.global-daily-cap=1000"})
class AiQuotaIntegrationTest extends AbstractPostgresIntegrationTest {

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
    private AiQuota quota;

    @BeforeEach
    void resetRealtime() throws IOException {
        REALTIME.reset(new String(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8));
    }

    private record Person(MockHttpSession session, UUID id, String project, String canvas) {
    }

    @Test
    void aGuestHasAFewCallsADayThenGetsATooManyRequestsWithWhenToRetry() throws Exception {
        Person guest = newGuest();

        assertThat(ai(guest, "sketch", "{\"brief\":\"a\"}").getStatus()).isEqualTo(200);
        assertThat(ai(guest, "audit", null).getStatus()).as("l'audit compte aussi").isEqualTo(200);

        MockHttpServletResponse refused = ai(guest, "complete", "{}");
        assertThat(refused.getStatus()).isEqualTo(429);
        assertThat(Long.parseLong(refused.getHeader("Retry-After"))).as("secondes jusqu'à minuit UTC").isBetween(1L, 86_400L);
        assertThat(refused.getContentAsString()).contains("GitHub").contains("2 appels");
        assertThat(used(guest)).isEqualTo(2);

        Person other = newGuest();
        assertThat(ai(other, "sketch", "{\"brief\":\"a\"}").getStatus()).as("le plafond est par personne").isEqualTo(200);
    }

    @Test
    void aGithubAccountHasTheHigherLimit() throws Exception {
        Person user = newGithubAccount();

        for (int i = 0; i < 3; i++) {
            assertThat(ai(user, "sketch", "{\"brief\":\"a\"}").getStatus()).isEqualTo(200);
        }
        MockHttpServletResponse refused = ai(user, "sketch", "{\"brief\":\"a\"}");
        assertThat(refused.getStatus()).isEqualTo(429);
        assertThat(refused.getContentAsString()).contains("3 appels").doesNotContain("GitHub pour");
    }

    @Test
    void onlyACallThatReallyGoesToTheProviderIsCounted() throws Exception {
        Person guest = newGuest();
        Person outsider = newGuest();

        assertThat(ai(guest, "sketch", "{\"brief\":\"" + "a".repeat(8001) + "\"}").getStatus()).as("texte trop long").isEqualTo(400);
        assertThat(ai(guest, "complete", "{\"nodeIds\":[\"inconnu\"]}").getStatus()).as("bloc inconnu").isEqualTo(400);
        assertThat(ai(outsider, "sketch", "{\"brief\":\"a\"}", guest.canvas()).getStatus()).as("pas membre : 404").isEqualTo(404);

        assertThat(used(guest)).as("aucun de ces refus n'a coûté un appel").isZero();
        assertThat(used(outsider)).isZero();
    }

    @Test
    void theCounterKeepsNoTextAndIsPurgedOnceOld() throws Exception {
        Person guest = newGuest();
        ai(guest, "sketch", "{\"brief\":\"texte-secret\"}");

        assertThat(jdbc.sql("select count(*) from information_schema.columns where table_name = 'ai_usage'")
                .query(Integer.class).single()).as("user_id, day, calls, chat_calls : rien d'autre").isEqualTo(4);

        jdbc.sql("insert into ai_usage (user_id, day, calls) values (?, (now() at time zone 'utc')::date - 40, 7)")
                .param(guest.id()).update();
        jdbc.sql("insert into ai_usage (user_id, day, calls) values (?, (now() at time zone 'utc')::date - 5, 7)")
                .param(guest.id()).update();
        invokePurge();
        assertThat(jdbc.sql("select count(*) from ai_usage where user_id = ?").param(guest.id()).query(Integer.class).single())
                .as("aujourd'hui et il y a 5 jours restent, il y a 40 jours part").isEqualTo(2);
    }

    @Test
    void theServiceWideCapStopsEveryoneEvenWithQuotaLeft() throws Exception {
        // Un plafond de service déjà atteint : un compte neuf, avec tout son quota, est tout de même refusé.
        UUID filler = UUID.randomUUID();
        jdbc.sql("insert into users (id, github_id, login, display_name, is_guest) values (?, ?, 'remplisseur', 'R', false)")
                .param(filler).param(Math.abs(filler.getMostSignificantBits() % 1_000_000_000L) + 5_000_000L).update();
        jdbc.sql("insert into ai_usage (user_id, day, calls) values (?, (now() at time zone 'utc')::date, 1000)")
                .param(filler).update();

        Person fresh = newGuest();
        MockHttpServletResponse refused = ai(fresh, "sketch", "{\"brief\":\"a\"}");
        assertThat(refused.getStatus()).isEqualTo(429);
        assertThat(refused.getContentAsString()).contains("limite pour aujourd'hui");
        assertThat(used(fresh)).as("et son quota personnel n'est pas entamé").isZero();

        jdbc.sql("delete from ai_usage where user_id = ?").param(filler).update();
        assertThat(ai(fresh, "sketch", "{\"brief\":\"a\"}").getStatus()).isEqualTo(200);
    }

    // ------------------------------------------------------------------ Le dialogue a son propre compteur

    @Test
    void theChatHasItsOwnQuotaAndNeitherSideEatsTheOther() throws Exception {
        Person guest = newGuest();

        assertThat(chat(guest).getStatus()).isEqualTo(200);
        assertThat(chat(guest).getStatus()).isEqualTo(200);

        MockHttpServletResponse refused = chat(guest);
        assertThat(refused.getStatus()).isEqualTo(429);
        assertThat(Long.parseLong(refused.getHeader("Retry-After"))).as("secondes jusqu'à minuit UTC").isBetween(1L, 86_400L);
        assertThat(refused.getContentAsString()).contains("messages").contains("GitHub");
        assertThat(usedChat(guest)).isEqualTo(2);
        assertThat(used(guest)).as("le dialogue n'a pas entamé le quota des propositions").isZero();

        assertThat(ai(guest, "sketch", "{\"brief\":\"a\"}").getStatus()).as("les propositions restent possibles").isEqualTo(200);
        assertThat(ai(guest, "audit", null).getStatus()).isEqualTo(200);
        assertThat(ai(guest, "sketch", "{\"brief\":\"a\"}").getStatus()).as("puis leur propre plafond s'applique").isEqualTo(429);
        assertThat(usedChat(guest)).as("et les propositions n'ont pas entamé le quota du dialogue").isEqualTo(2);
    }

    @Test
    void aGithubAccountChatsMoreThanAGuest() throws Exception {
        Person user = newGithubAccount();

        for (int i = 0; i < 4; i++) {
            assertThat(chat(user).getStatus()).isEqualTo(200);
        }
        MockHttpServletResponse refused = chat(user);
        assertThat(refused.getStatus()).isEqualTo(429);
        assertThat(refused.getContentAsString()).contains("4 messages").doesNotContain("GitHub pour");
    }

    @Test
    void theServiceWideCapCountsTheProposalsAndTheChatTogether() throws Exception {
        // Le plafond du service est atteint par le seul compteur de dialogue : plus rien ne part, dialogue compris.
        UUID filler = UUID.randomUUID();
        jdbc.sql("insert into users (id, github_id, login, display_name, is_guest) values (?, ?, 'remplisseur-chat', 'R', false)")
                .param(filler).param(Math.abs(filler.getMostSignificantBits() % 1_000_000_000L) + 7_000_000L).update();
        jdbc.sql("insert into ai_usage (user_id, day, calls, chat_calls) values (?, (now() at time zone 'utc')::date, 400, 600)")
                .param(filler).update();

        Person fresh = newGuest();
        assertThat(ai(fresh, "sketch", "{\"brief\":\"a\"}").getStatus()).isEqualTo(429);
        MockHttpServletResponse refusedChat = chat(fresh);
        assertThat(refusedChat.getStatus()).isEqualTo(429);
        assertThat(refusedChat.getContentAsString()).contains("limite pour aujourd'hui");
        assertThat(usedChat(fresh)).isZero();

        jdbc.sql("delete from ai_usage where user_id = ?").param(filler).update();
        assertThat(chat(fresh).getStatus()).isEqualTo(200);
    }

    @Test
    void simultaneousCallsNeverPassThePersonalLimit() throws Exception {
        Person guest = newGuest();
        CurrentUser user = new CurrentUser(guest.id(), null, "Invité", null, true, Instant.now().plusSeconds(3600));

        int[] accepted = {0};
        Thread[] threads = new Thread[12];
        for (int i = 0; i < threads.length; i++) {
            threads[i] = new Thread(() -> {
                try {
                    quota.consume(user);
                    synchronized (accepted) {
                        accepted[0]++;
                    }
                } catch (RuntimeException refused) {
                    // 429 attendu pour les appels au-delà du plafond
                }
            });
            threads[i].start();
        }
        for (Thread thread : threads) {
            thread.join();
        }
        assertThat(accepted[0]).isEqualTo(2);
        assertThat(used(guest)).isEqualTo(2);
    }

    // ------------------------------------------------------------------ Outils

    private void invokePurge() throws Exception {
        var method = AiQuota.class.getDeclaredMethod("purgeOld");
        method.setAccessible(true);
        method.invoke(quota);
    }

    private int used(Person person) {
        return jdbc.sql("select coalesce(sum(calls), 0) from ai_usage where user_id = ? and day = (now() at time zone 'utc')::date")
                .param(person.id()).query(Integer.class).single();
    }

    private int usedChat(Person person) {
        return jdbc.sql("select coalesce(sum(chat_calls), 0) from ai_usage where user_id = ? and day = (now() at time zone 'utc')::date")
                .param(person.id()).query(Integer.class).single();
    }

    private MockHttpServletResponse chat(Person person) throws Exception {
        return ai(person, "chat", "{\"messages\":[{\"role\":\"user\",\"content\":\"bonjour\"}]}");
    }

    private MockHttpServletResponse ai(Person person, String route, String body) throws Exception {
        return ai(person, route, body, person.canvas());
    }

    private MockHttpServletResponse ai(Person person, String route, String body, String canvas) throws Exception {
        MockHttpServletRequestBuilder request = post("/api/canvases/" + canvas + "/ai/" + route).session(person.session());
        if (body != null) {
            request = request.contentType("application/json").content(body);
        }
        return mockMvc.perform(request).andReturn().getResponse();
    }

    private Person newGuest() throws Exception {
        MockHttpSession session = (MockHttpSession) mockMvc.perform(post("/api/auth/guest")).andReturn().getRequest().getSession(false);
        return describe(session);
    }

    /** Un compte GitHub : sa ligne, son projet, et une session qui le dit (le plafond lit « invité » dans la session). */
    private Person newGithubAccount() throws Exception {
        UUID id = UUID.randomUUID();
        jdbc.sql("insert into users (id, github_id, login, display_name, is_guest) values (?, ?, ?, 'Compte GitHub', false)")
                .param(id).param(Math.abs(id.getMostSignificantBits() % 1_000_000_000L) + 6_000_000L).param("compte-" + id.toString().substring(0, 8)).update();
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(SessionSecurityContextRepository.SESSION_USER,
                new CurrentUser(id, "compte", "Compte GitHub", null, false, null));
        String body = mockMvc.perform(post("/api/projects").session(session).contentType("application/json").content("{\"name\":\"Projet IA\"}"))
                .andReturn().getResponse().getContentAsString();
        String project = JSON.readTree(body).get("id").asText();
        return new Person(session, id, project, firstCanvas(session, project));
    }

    private Person describe(MockHttpSession session) throws Exception {
        String me = mockMvc.perform(get("/api/me").session(session)).andReturn().getResponse().getContentAsString();
        String projects = mockMvc.perform(get("/api/projects").session(session)).andReturn().getResponse().getContentAsString();
        String project = JSON.readTree(projects).get(0).get("id").asText();
        return new Person(session, UUID.fromString(JSON.readTree(me).get("id").asText()), project, firstCanvas(session, project));
    }

    private String firstCanvas(MockHttpSession session, String project) throws Exception {
        String json = mockMvc.perform(get("/api/projects/" + project + "/canvases").session(session)).andReturn().getResponse().getContentAsString();
        return JSON.readTree(json).get(0).get("id").asText();
    }
}
