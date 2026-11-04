package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
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
import org.springframework.test.web.servlet.MvcResult;

/**
 * Les routes du conseiller conversationnel (chat, chat en flux, chat global du widget) : qui y a droit, ce qu'elles
 * coûtent en quota, et qu'un refus arrive avant le premier octet du flux.
 */
@TestPropertySource(properties = {
        "lonkoo.ai.provider=fake",
        "lonkoo.ai.daily-quota=3",
        "lonkoo.ai.guest-daily-quota=2",
        "lonkoo.ai.global-daily-cap=1000"})
class AiChatRoutesIntegrationTest extends AbstractPostgresIntegrationTest {

    private static final FakeRealtimeServer REALTIME = FakeRealtimeServer.start();
    private static final String CHAT = "{\"messages\":[{\"role\":\"user\",\"content\":\"Comment héberger ma base ?\"}]}";

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

    private record Person(MockHttpSession session, UUID id, String canvas) {
    }

    @Test
    void theGlobalChatNeedsASession() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(post("/api/ai/chat").contentType("application/json").content(CHAT))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(mockMvc.perform(post("/api/ai/chat/stream").contentType("application/json").content(CHAT))
                .andReturn().getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void theGlobalChatAnswersAndCountsInTheQuotaThenIsStopped() throws Exception {
        Person guest = newGuest();

        MockHttpServletResponse first = send(guest, "/api/ai/chat", CHAT);
        assertThat(first.getStatus()).isEqualTo(200);
        assertThat(JSON.readTree(first.getContentAsString()).path("reply").asText()).isNotBlank();
        assertThat(used(guest)).isEqualTo(1);

        assertThat(send(guest, "/api/ai/chat", CHAT).getStatus()).isEqualTo(200);

        MockHttpServletResponse refused = send(guest, "/api/ai/chat", CHAT);
        assertThat(refused.getStatus()).isEqualTo(429);
        assertThat(refused.getHeader("Retry-After")).isNotNull();
        assertThat(used(guest)).as("le refus ne coûte rien").isEqualTo(2);
    }

    @Test
    void theStreamingChatSendsServerSentEventsAndCounts() throws Exception {
        Person guest = newGuest();

        for (String path : new String[] {"/api/canvases/" + guest.canvas() + "/ai/chat/stream", "/api/ai/chat/stream"}) {
            MockHttpServletResponse response = stream(guest, path, CHAT);
            assertThat(response.getStatus()).as(path).isEqualTo(200);
            assertThat(response.getContentAsString(StandardCharsets.UTF_8)).as(path).contains("data: ").contains("[DONE]");
        }
        assertThat(used(guest)).isEqualTo(2);
    }

    @Test
    void aStreamIsRefusedWithItsRealStatusBeforeAnyByteWhenTheQuotaIsSpent() throws Exception {
        Person guest = newGuest();
        send(guest, "/api/ai/chat", CHAT);
        send(guest, "/api/ai/chat", CHAT);

        for (String path : new String[] {"/api/canvases/" + guest.canvas() + "/ai/chat/stream", "/api/ai/chat/stream"}) {
            MockHttpServletResponse refused = stream(guest, path, CHAT);
            assertThat(refused.getStatus()).as(path).isEqualTo(429);
            assertThat(refused.getContentAsString(StandardCharsets.UTF_8)).as(path).doesNotContain("data: ");
        }
        assertThat(used(guest)).isEqualTo(2);
    }

    @Test
    void theCanvasChatRefusesSomeoneWhoIsNotAMemberAndCostsNothing() throws Exception {
        Person owner = newGuest();
        Person outsider = newGuest();

        assertThat(send(outsider, "/api/canvases/" + owner.canvas() + "/ai/chat", CHAT).getStatus()).isEqualTo(404);
        MockHttpServletResponse refused = stream(outsider, "/api/canvases/" + owner.canvas() + "/ai/chat/stream", CHAT);
        assertThat(refused.getStatus()).isEqualTo(404);
        assertThat(refused.getContentAsString(StandardCharsets.UTF_8)).doesNotContain("data: ");
        assertThat(used(outsider)).isZero();
    }

    // ------------------------------------------------------------------ Outils

    private int used(Person person) {
        return jdbc.sql("select coalesce(sum(calls), 0) from ai_usage where user_id = ? and day = (now() at time zone 'utc')::date")
                .param(person.id()).query(Integer.class).single();
    }

    private MockHttpServletResponse send(Person person, String path, String body) throws Exception {
        return mockMvc.perform(post(path).session(person.session()).contentType("application/json").content(body))
                .andReturn().getResponse();
    }

    /** Une route en flux : on attend la fin du traitement asynchrone, puis on rend la réponse définitive. */
    private MockHttpServletResponse stream(Person person, String path, String body) throws Exception {
        MvcResult started = mockMvc.perform(post(path).session(person.session()).contentType("application/json").content(body))
                .andReturn();
        if (started.getRequest().isAsyncStarted()) {
            started.getAsyncResult(5_000);
            return mockMvc.perform(asyncDispatch(started)).andReturn().getResponse();
        }
        return started.getResponse();
    }

    private Person newGuest() throws Exception {
        MockHttpSession session = (MockHttpSession) mockMvc.perform(post("/api/auth/guest")).andReturn().getRequest().getSession(false);
        String me = mockMvc.perform(get("/api/me").session(session)).andReturn().getResponse().getContentAsString();
        String projects = mockMvc.perform(get("/api/projects").session(session)).andReturn().getResponse().getContentAsString();
        String project = JSON.readTree(projects).get(0).get("id").asText();
        String canvases = mockMvc.perform(get("/api/projects/" + project + "/canvases").session(session))
                .andReturn().getResponse().getContentAsString();
        return new Person(session, UUID.fromString(JSON.readTree(me).get("id").asText()), JSON.readTree(canvases).get(0).get("id").asText());
    }
}
