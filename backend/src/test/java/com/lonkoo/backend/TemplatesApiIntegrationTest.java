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
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;

import tools.jackson.databind.JsonNode;

/**
 * Modèles de départ : la liste, la création d'un projet à partir d'un modèle (le canvas le reçoit, le serveur temps réel
 * le charge), un projet sans modèle toujours vide, et les refus (modèle inconnu, identifiant qui n'en est pas un).
 */
class TemplatesApiIntegrationTest extends AbstractPostgresIntegrationTest {

    @Autowired
    private JdbcClient jdbc;

    private MockHttpSession newGuest() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")).andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    private MockHttpServletResponse createProject(MockHttpSession session, String body) throws Exception {
        return mockMvc.perform(post("/api/projects").session(session).contentType("application/json").content(body))
                .andReturn().getResponse();
    }

    private JsonNode templateFile(String id) throws Exception {
        return JSON.readTree(new ClassPathResource("seed/" + id + ".canvas.json").getInputStream());
    }

    private String canvasOf(String projectId) {
        return jdbc.sql("select id::text from canvases where project_id = ?").param(UUID.fromString(projectId)).query(String.class).single();
    }

    // ------------------------------------------------------------------ La liste

    @Test
    void theListShowsTheFiveTemplatesWithWhatIsNeededToChooseOne() throws Exception {
        MockHttpSession session = newGuest();

        MockHttpServletResponse response = mockMvc.perform(get("/api/templates").session(session)).andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        JsonNode list = JSON.readTree(response.getContentAsString());
        List<String> ids = new ArrayList<>();
        list.forEach(item -> ids.add(item.get("id").asText()));
        assertThat(ids).containsExactly("clinique-rendez-vous", "ecole-inscriptions", "livraison-colis", "marketplace-mobile", "tontine-numerique");

        Set<String> fields = new HashSet<>();
        list.get(0).propertyNames().forEach(fields::add);
        assertThat(fields).as("la liste ne renvoie pas le contenu du modèle").containsExactlyInAnyOrder("id", "name", "description", "blocks", "links");
        for (JsonNode item : list) {
            JsonNode file = templateFile(item.get("id").asText());
            assertThat(item.get("name").asText()).isEqualTo(file.path("meta").path("name").asText());
            assertThat(item.get("blocks").asInt()).isEqualTo(file.path("nodes").size());
            assertThat(item.get("links").asInt()).isEqualTo(file.path("edges").size());
        }
    }

    // ------------------------------------------------------------------ Créer à partir d'un modèle

    @Test
    void aProjectCreatedFromATemplateGetsItInItsCanvasAndTheRealtimeServerLoadsIt() throws Exception {
        MockHttpSession session = newGuest();

        MockHttpServletResponse created = createProject(session, "{\"name\":\"Ma clinique\",\"template\":\"clinique-rendez-vous\"}");

        assertThat(created.getStatus()).isEqualTo(201);
        String projectId = JSON.readTree(created.getContentAsString()).get("id").asText();
        String canvasId = canvasOf(projectId);

        JsonNode stored = JSON.readTree(jdbc.sql("select seed_snapshot::text from canvases where id = ?::uuid").param(canvasId).query(String.class).single());
        assertThat(stored).as("le canvas enregistre le modèle").isEqualTo(templateFile("clinique-rendez-vous"));

        // Le serveur temps réel lit ce contenu à la première ouverture (route interne, jeton de service).
        String state = mockMvc.perform(get("/internal/canvases/" + canvasId + "/state").header("Authorization", "Bearer test-service-token"))
                .andReturn().getResponse().getContentAsString();
        JsonNode body = JSON.readTree(state);
        assertThat(body.get("state").isNull()).as("pas d'état enregistré : c'est le modèle qui sert").isTrue();
        assertThat(body.get("seed")).isEqualTo(templateFile("clinique-rendez-vous"));

        assertThat(jdbc.sql("select detail::text from audit_log where action = 'project.created' and target = ?")
                .param("project:" + projectId).query(String.class).single()).contains("clinique-rendez-vous");
    }

    @Test
    void everyTemplateOfTheListCanStartAProject() throws Exception {
        MockHttpSession session = newGuest();
        JsonNode list = JSON.readTree(mockMvc.perform(get("/api/templates").session(session)).andReturn().getResponse().getContentAsString());

        for (JsonNode item : list) {
            String id = item.get("id").asText();
            MockHttpServletResponse created = createProject(session, "{\"name\":\"Projet " + id + "\",\"template\":\"" + id + "\"}");
            assertThat(created.getStatus()).as("création depuis " + id).isEqualTo(201);
            String canvasId = canvasOf(JSON.readTree(created.getContentAsString()).get("id").asText());
            JsonNode stored = JSON.readTree(jdbc.sql("select seed_snapshot::text from canvases where id = ?::uuid").param(canvasId).query(String.class).single());
            assertThat(stored.path("nodes").size()).as("blocs de " + id).isEqualTo(item.get("blocks").asInt());
        }
    }

    // ------------------------------------------------------------------ Sans modèle, et les refus

    @Test
    void aProjectWithoutATemplateStaysEmptyLikeBefore() throws Exception {
        MockHttpSession session = newGuest();

        for (String body : List.of("{\"name\":\"Vide\"}", "{\"name\":\"Vide aussi\",\"template\":null}")) {
            MockHttpServletResponse created = createProject(session, body);
            assertThat(created.getStatus()).isEqualTo(201);
            String canvasId = canvasOf(JSON.readTree(created.getContentAsString()).get("id").asText());
            assertThat(jdbc.sql("select seed_snapshot is null from canvases where id = ?::uuid").param(canvasId).query(Boolean.class).single())
                    .as("aucun modèle : canvas vide").isTrue();
        }
    }

    @Test
    void anUnknownTemplateIsRefusedBeforeAnythingIsWritten() throws Exception {
        MockHttpSession session = newGuest();
        int before = jdbc.sql("select count(*) from projects").query(Integer.class).single();

        MockHttpServletResponse response = createProject(session, "{\"name\":\"Fantôme\",\"template\":\"n-existe-pas\"}");

        assertThat(response.getStatus()).isEqualTo(400);
        assertThat(response.getContentType()).startsWith("application/problem+json");
        assertThat(response.getContentAsString()).contains("Modèle inconnu");
        assertThat(jdbc.sql("select count(*) from projects").query(Integer.class).single()).as("aucun projet créé").isEqualTo(before);
    }

    @Test
    void anIdentifierThatIsNotAnIdentifierIsRefused() throws Exception {
        MockHttpSession session = newGuest();

        for (String bad : List.of("../etc/passwd", "UPPER", "avec espace", "a".repeat(41), "")) {
            assertThat(createProject(session, "{\"name\":\"Test\",\"template\":\"" + bad + "\"}").getStatus())
                    .as("modèle « %s »", bad).isEqualTo(400);
        }
    }

    @Test
    void theFirstProjectOfAGuestStillComesWithTheMarketplaceExample() throws Exception {
        MockHttpSession session = newGuest();
        String projectId = JSON.readTree(mockMvc.perform(get("/api/projects").session(session)).andReturn().getResponse().getContentAsString())
                .get(0).get("id").asText();

        JsonNode seed = JSON.readTree(jdbc.sql("select seed_snapshot::text from canvases where project_id = ?").param(UUID.fromString(projectId)).query(String.class).single());

        assertThat(seed).isEqualTo(templateFile("marketplace-mobile"));
    }
}
