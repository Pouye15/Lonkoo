package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.security.SessionSecurityContextRepository;
import com.lonkoo.backend.support.GuestCleanupTask;

import tools.jackson.databind.JsonNode;

/**
 * Cas limites relevés à la revue du backend : API interne sur canvas neuf,
 * valeurs invalides (400 et non 500), jeton de partage inventé, expiration
 * des invités, fixation de session.
 */
class HardeningIntegrationTest extends AbstractPostgresIntegrationTest {

    private static final String SERVICE_TOKEN = "Bearer test-service-token";

    @Autowired
    private JdbcClient jdbcClient;

    // ------------------------------------------------------------------ API interne

    @Test
    void internalStateOfNeverSavedCanvasIsEmptyNotAnError() throws Exception {
        MockHttpSession session = newGuest();
        String canvasId = firstCanvasId(session, firstProjectId(session));

        JsonNode body = internalGet(canvasId);
        assertThat(body.get("state").isNull()).isTrue();
        // Le canvas « Démo » porte le modèle d'exemple comme seed.
        assertThat(body.get("seed").isObject()).isTrue();
    }

    @Test
    void internalStateOfCanvasWithoutSeedHasNullSeedAndState() throws Exception {
        MockHttpSession session = newGuest();
        String projectId = createProject(session, "{\"name\":\"Vide\"}");
        String canvasId = firstCanvasId(session, projectId);

        JsonNode body = internalGet(canvasId);
        assertThat(body.get("state").isNull()).isTrue();
        assertThat(body.get("seed").isNull()).isTrue();
    }

    @Test
    void internalStateRoundTrip() throws Exception {
        MockHttpSession session = newGuest();
        String canvasId = firstCanvasId(session, firstProjectId(session));

        mockMvc.perform(put("/internal/canvases/" + canvasId + "/state")
                .header("Authorization", SERVICE_TOKEN)
                .contentType("application/json").content("{\"state\":\"AAEC\"}"))
                .andExpect(status().isNoContent());
        assertThat(internalGet(canvasId).get("state").asText()).isEqualTo("AAEC");

        // Une seconde écriture remplace la première.
        mockMvc.perform(put("/internal/canvases/" + canvasId + "/state")
                .header("Authorization", SERVICE_TOKEN)
                .contentType("application/json").content("{\"state\":\"AwQF\"}"))
                .andExpect(status().isNoContent());
        assertThat(internalGet(canvasId).get("state").asText()).isEqualTo("AwQF");
    }

    @Test
    void internalStateRefusesAnOversizedStateAndKeepsTheStoredOne() throws Exception {
        MockHttpSession session = newGuest();
        String canvasId = firstCanvasId(session, firstProjectId(session));
        String url = "/internal/canvases/" + canvasId + "/state";

        // Plafond du profil de test : 65 536 octets. Un état valide juste en dessous passe…
        String atTheLimit = java.util.Base64.getEncoder().encodeToString(new byte[65536]);
        mockMvc.perform(put(url).header("Authorization", SERVICE_TOKEN)
                .contentType("application/json").content("{\"state\":\"" + atTheLimit + "\"}"))
                .andExpect(status().isNoContent());

        // …un octet de plus est refusé en 413 (problem+json), et l'état enregistré reste celui d'avant.
        String overTheLimit = java.util.Base64.getEncoder().encodeToString(new byte[65537]);
        mockMvc.perform(put(url).header("Authorization", SERVICE_TOKEN)
                .contentType("application/json").content("{\"state\":\"" + overTheLimit + "\"}"))
                .andExpect(status().isContentTooLarge());
        assertThat(internalGet(canvasId).get("state").asText()).isEqualTo(atTheLimit);

        // Un texte Base64 bien plus long que le plafond est refusé avant même d'être décodé.
        String enormous = "A".repeat(10_000_000);
        mockMvc.perform(put(url).header("Authorization", SERVICE_TOKEN)
                .contentType("application/json").content("{\"state\":\"" + enormous + "\"}"))
                .andExpect(status().isContentTooLarge());
    }

    @Test
    void internalStateRejectsBadInput() throws Exception {
        MockHttpSession session = newGuest();
        String canvasId = firstCanvasId(session, firstProjectId(session));
        String url = "/internal/canvases/" + canvasId + "/state";

        mockMvc.perform(put(url).header("Authorization", SERVICE_TOKEN)
                .contentType("application/json").content("{\"state\":\"@@@\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(put(url).header("Authorization", SERVICE_TOKEN)
                .contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest());

        String unknown = "/internal/canvases/" + UUID.randomUUID() + "/state";
        mockMvc.perform(get(unknown).header("Authorization", SERVICE_TOKEN))
                .andExpect(status().isNotFound());
        mockMvc.perform(put(unknown).header("Authorization", SERVICE_TOKEN)
                .contentType("application/json").content("{\"state\":\"AAEC\"}"))
                .andExpect(status().isNotFound());

        mockMvc.perform(get(url)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(url).header("Authorization", "Bearer autre-jeton")).andExpect(status().isUnauthorized());
        mockMvc.perform(get(url).header("Authorization", "Bearer ")).andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------------ Valeurs invalides

    @Test
    void invalidValuesAreBadRequests() throws Exception {
        MockHttpSession session = newGuest();
        String projectId = firstProjectId(session);
        String canvasId = firstCanvasId(session, projectId);

        mockMvc.perform(post("/api/projects").session(session)
                .contentType("application/json").content("{\"name\":\"x\",\"visibility\":\"bogus\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(patch("/api/projects/" + projectId).session(session)
                .contentType("application/json").content("{\"visibility\":\"bogus\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/canvases/" + canvasId + "/share-links").session(session)
                .contentType("application/json").content("{\"role\":\"ADMIN\"}"))
                .andExpect(status().isBadRequest());

        // Les valeurs permises passent toujours.
        mockMvc.perform(patch("/api/projects/" + projectId).session(session)
                .contentType("application/json").content("{\"visibility\":\"public\"}"))
                .andExpect(status().isOk());
    }

    // ------------------------------------------------------------------ Lien de partage

    @Test
    void joiningWithMadeUpTokenCreatesNoUser() throws Exception {
        int before = countUsers();
        for (int i = 0; i < 5; i++) {
            mockMvc.perform(post("/api/join/jeton-invente-" + i)).andExpect(status().isNotFound());
        }
        assertThat(countUsers()).isEqualTo(before);
    }

    @Test
    void joiningWithValidTokenCreatesExactlyOneGuest() throws Exception {
        MockHttpSession owner = newGuest();
        String canvasId = firstCanvasId(owner, firstProjectId(owner));
        MvcResult link = mockMvc.perform(post("/api/canvases/" + canvasId + "/share-links").session(owner)
                .contentType("application/json").content("{\"role\":\"READ\",\"ttlHours\":1}"))
                .andExpect(status().isCreated()).andReturn();
        String url = JSON.readTree(link.getResponse().getContentAsString()).get("url").asText();
        String token = url.substring(url.lastIndexOf('/') + 1);

        int before = countUsers();
        MvcResult joined = mockMvc.perform(post("/api/join/" + token)).andExpect(status().isOk()).andReturn();
        assertThat(countUsers()).isEqualTo(before + 1);

        MockHttpSession visitor = (MockHttpSession) joined.getRequest().getSession(false);
        mockMvc.perform(get("/api/me").session(visitor)).andExpect(status().isOk());
    }

    // ------------------------------------------------------------------ Sessions

    @Test
    void expiredGuestSessionIsRejectedAndClosed() throws Exception {
        MockHttpSession session = newGuest();
        CurrentUser user = (CurrentUser) session.getAttribute(SessionSecurityContextRepository.SESSION_USER);
        session.setAttribute(SessionSecurityContextRepository.SESSION_USER, new CurrentUser(
                user.id(), user.login(), user.displayName(), null, true, Instant.now().minusSeconds(60)));

        mockMvc.perform(get("/api/me").session(session)).andExpect(status().isUnauthorized());
        assertThat(session.isInvalid()).isTrue();
    }

    @Test
    void guestSessionNotYetExpiredStillWorks() throws Exception {
        MockHttpSession session = newGuest();
        mockMvc.perform(get("/api/me").session(session)).andExpect(status().isOk());
    }

    @Test
    void loginReplacesTheExistingSession() throws Exception {
        MockHttpSession before = new MockHttpSession();
        before.setAttribute("marqueur", "ancienne session");
        String oldId = before.getId();

        MvcResult result = mockMvc.perform(post("/api/auth/guest").session(before))
                .andExpect(status().isCreated()).andReturn();

        MockHttpSession after = (MockHttpSession) result.getRequest().getSession(false);
        assertThat(before.isInvalid()).isTrue();
        assertThat(after).isNotNull();
        assertThat(after.getId()).isNotEqualTo(oldId);
        assertThat(after.getAttribute("marqueur")).isNull();
    }

    // ------------------------------------------------------------------ Purge et audit

    @Autowired
    private GuestCleanupTask cleanupTask;

    @Test
    void cleanupRemovesExpiredGuestsAndExpiredLinksOnly() throws Exception {
        MockHttpSession owner = newGuest();
        UUID canvasId = UUID.fromString(firstCanvasId(owner, firstProjectId(owner)));
        mockMvc.perform(post("/api/canvases/" + canvasId + "/share-links").session(owner)
                .contentType("application/json").content("{\"role\":\"READ\"}"))
                .andExpect(status().isCreated());
        jdbcClient.sql("insert into share_links (token_hash, canvas_id, role, expires_at) "
                + "values (?, ?, 'READ', now() - interval '1 hour')")
                .param("a".repeat(64)).param(canvasId).update();

        MockHttpSession expiredGuest = newGuest();
        UUID expiredId = ((CurrentUser) expiredGuest.getAttribute(SessionSecurityContextRepository.SESSION_USER)).id();
        jdbcClient.sql("update users set expires_at = now() - interval '1 hour' where id = ?")
                .param(expiredId).update();
        UUID liveId = ((CurrentUser) owner.getAttribute(SessionSecurityContextRepository.SESSION_USER)).id();

        cleanupTask.purgeExpired();

        assertThat(countWhere("users", "id = ?", expiredId)).isZero();
        assertThat(countWhere("users", "id = ?", liveId)).isEqualTo(1);
        assertThat(countWhere("share_links", "canvas_id = ? and expires_at < now()", canvasId)).isZero();
        assertThat(countWhere("share_links", "canvas_id = ? and expires_at > now()", canvasId)).isEqualTo(1);
    }

    @Test
    void patchRecordsOneAuditLinePerKindOfChange() throws Exception {
        MockHttpSession session = newGuest();
        String projectId = createProject(session, "{\"name\":\"Audit\"}");
        String target = "project:" + projectId;

        mockMvc.perform(patch("/api/projects/" + projectId).session(session)
                .contentType("application/json").content("{\"visibility\":\"public\"}"))
                .andExpect(status().isOk());
        assertThat(auditCount("project.visibility", target)).isEqualTo(1);
        assertThat(auditCount("project.updated", target)).isZero();
        assertThat(jdbcClient.sql("select detail->>'visibility' from audit_log where action = 'project.visibility' and target = ?")
                .param(target).query(String.class).single()).isEqualTo("public");

        mockMvc.perform(patch("/api/projects/" + projectId).session(session)
                .contentType("application/json").content("{\"name\":\"Audit 2\"}"))
                .andExpect(status().isOk());
        assertThat(auditCount("project.visibility", target)).isEqualTo(1);
        assertThat(auditCount("project.updated", target)).isEqualTo(1);
    }

    // ------------------------------------------------------------------ Outils

    private int countWhere(String table, String condition, Object param) {
        return jdbcClient.sql("select count(*) from " + table + " where " + condition)
                .param(param).query(Integer.class).single();
    }

    private int auditCount(String action, String target) {
        return jdbcClient.sql("select count(*) from audit_log where action = ? and target = ?")
                .param(action).param(target).query(Integer.class).single();
    }

    private MockHttpSession newGuest() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")).andExpect(status().isCreated()).andReturn();
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    private String firstProjectId(MockHttpSession session) throws Exception {
        String json = mockMvc.perform(get("/api/projects").session(session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JSON.readTree(json).get(0).get("id").asText();
    }

    private String createProject(MockHttpSession session, String body) throws Exception {
        String json = mockMvc.perform(post("/api/projects").session(session)
                .contentType("application/json").content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JSON.readTree(json).get("id").asText();
    }

    private String firstCanvasId(MockHttpSession session, String projectId) throws Exception {
        String json = mockMvc.perform(get("/api/projects/" + projectId + "/canvases").session(session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JSON.readTree(json).get(0).get("id").asText();
    }

    private JsonNode internalGet(String canvasId) throws Exception {
        String json = mockMvc.perform(get("/internal/canvases/" + canvasId + "/state")
                .header("Authorization", SERVICE_TOKEN))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JSON.readTree(json);
    }

    private int countUsers() {
        return jdbcClient.sql("select count(*) from users").query(Integer.class).single();
    }
}
