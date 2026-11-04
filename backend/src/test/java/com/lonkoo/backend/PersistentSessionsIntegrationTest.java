package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.lonkoo.backend.security.GithubTokenStore;

import tools.jackson.databind.ObjectMapper;

/**
 * Les sessions sont en base : un redémarrage du serveur (déploiement) ne déconnecte plus personne. Ici l'application
 * démarre pour de vrai, deux fois de suite sur la même base, et un client HTTP garde son cookie d'une fois à l'autre.
 * Le jeton GitHub, lui, ne doit jamais atterrir en base.
 */
class PersistentSessionsIntegrationTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String SECRET = "gho_jeton_secret_qui_ne_doit_pas_etre_en_base";

    private final CookieManager cookies = new CookieManager();
    private final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();
    private ConfigurableApplicationContext running;

    @AfterEach
    void stop() {
        if (running != null) {
            running.close();
        }
    }

    // ------------------------------------------------------------------ Redémarrage

    @Test
    void aSignedInPersonStaysSignedInAfterTheServerRestarts() throws Exception {
        start();
        HttpResponse<String> created = send("POST", "/api/auth/guest");
        assertThat(created.statusCode()).isEqualTo(201);
        String userId = JSON.readTree(created.body()).get("id").asText();
        assertThat(JSON.readTree(send("GET", "/api/me").body()).get("id").asText()).isEqualTo(userId);
        assertThat(sessionRows()).as("la session est en base").isPositive();

        restart();

        HttpResponse<String> after = send("GET", "/api/me");
        assertThat(after.statusCode()).as("toujours connecté après le redémarrage").isEqualTo(200);
        assertThat(JSON.readTree(after.body()).get("id").asText()).isEqualTo(userId);
        // Et la personne retrouve ses projets : le projet de démonstration d'un invité ne disparaît plus avec un déploiement.
        assertThat(JSON.readTree(send("GET", "/api/projects").body()).size()).isEqualTo(1);
    }

    @Test
    void loggingOutRemovesTheSessionFromTheDatabase() throws Exception {
        start();
        send("POST", "/api/auth/guest");
        int before = sessionRows();

        assertThat(send("POST", "/api/auth/logout").statusCode()).isEqualTo(204);

        assertThat(sessionRows()).as("la ligne de session est supprimée").isEqualTo(before - 1);
        assertThat(send("GET", "/api/me").statusCode()).isEqualTo(401);
        restart();
        assertThat(send("GET", "/api/me").statusCode()).as("et une session fermée ne revient pas").isEqualTo(401);
    }

    @Test
    void anExpiredSessionIsNotRestoredByARestart() throws Exception {
        start();
        send("POST", "/api/auth/guest");
        String sessionId = currentSessionId();
        // Spring Session juge l'expiration d'après la dernière activité et la durée d'inactivité (24 h), pas d'après expiry_time.
        long twoDaysAgo = System.currentTimeMillis() - 48L * 3600 * 1000;
        jdbc().sql("update spring_session set last_access_time = ?, expiry_time = ? where session_id = ?")
                .param(twoDaysAgo).param(twoDaysAgo + 24L * 3600 * 1000).param(sessionId).update();

        restart();

        assertThat(send("GET", "/api/me").statusCode()).isEqualTo(401);
    }

    // ------------------------------------------------------------------ Le jeton GitHub

    @Test
    void theGithubTokenNeverReachesTheDatabaseAndIsForgottenByARestart() throws Exception {
        start();
        send("POST", "/api/auth/guest");
        String sessionId = currentSessionId();
        running.getBean(GithubTokenStore.class).put(sessionId, SECRET);
        assertThat(running.getBean(GithubTokenStore.class).get(sessionId)).contains(SECRET);

        // Une requête de plus : la session est réécrite en base avec tous ses attributs.
        assertThat(send("GET", "/api/me").statusCode()).isEqualTo(200);
        assertThat(jdbc().sql("select count(*) from spring_session_attributes where position(convert_to(?, 'UTF8') in attribute_bytes) > 0")
                .param(SECRET).query(Integer.class).single()).as("aucune copie du jeton dans les sessions").isZero();

        restart();

        assertThat(send("GET", "/api/me").statusCode()).as("toujours connecté").isEqualTo(200);
        assertThat(running.getBean(GithubTokenStore.class).get(sessionId)).as("mais le jeton est oublié").isEmpty();
        assertThat(JSON.readTree(send("GET", "/api/github/status").body()).get("connected").asBoolean())
                .as("l'interface proposera de reconnecter GitHub").isFalse();
    }

    // ------------------------------------------------------------------ Outils

    private void start() {
        running = new SpringApplicationBuilder(LonkooBackendApplication.class).run(
                "--spring.profiles.active=test",
                "--server.port=0",
                "--spring.main.banner-mode=off",
                "--spring.datasource.url=" + AbstractPostgresIntegrationTest.jdbcUrl(),
                "--spring.datasource.username=postgres",
                "--spring.datasource.password=",
                // Le profil de test exclut les sessions en base (MockHttpSession) : ici on les veut.
                "--spring.autoconfigure.exclude=");
    }

    /** Arrête puis relance l'application sur la même base : ce que fait un déploiement. */
    private void restart() {
        running.close();
        start();
    }

    private HttpResponse<String> send(String method, String path) throws Exception {
        int port = Integer.parseInt(running.getEnvironment().getProperty("local.server.port"));
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .method(method, HttpRequest.BodyPublishers.noBody())
                .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private JdbcClient jdbc() {
        return running.getBean(JdbcClient.class);
    }

    private int sessionRows() {
        return jdbc().sql("select count(*) from spring_session").query(Integer.class).single();
    }

    /** L'identifiant de la session du client : la plus récente en base. */
    private String currentSessionId() {
        return jdbc().sql("select session_id from spring_session order by creation_time desc limit 1")
                .query(String.class).single();
    }
}
