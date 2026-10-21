package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;

import tools.jackson.databind.JsonNode;

/**
 * Tests sur un vrai serveur HTTP (Tomcat), là où MockMvc ne passe ni par le
 * traitement des en-têtes de proxy ni par la page d'erreur :
 * adresse client lue dans X-Forwarded-For, et erreurs en problem+json.
 * La limite est abaissée à 2 invités par heure et par adresse pour ce contexte.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "lonkoo.guest-rate-limit-per-hour=2")
class RealServerIntegrationTest extends AbstractPostgresIntegrationTest {

    @Value("${local.server.port}")
    private int port;

    private final HttpClient client = HttpClient.newHttpClient();

    @Test
    void guestLimitCountsTheForwardedAddressNotTheProxy() throws Exception {
        // Caddy transmet l'adresse du visiteur dans X-Forwarded-For ; la requête arrive de 127.0.0.1,
        // proxy de confiance.
        assertThat(postGuest("203.0.113.7").statusCode()).isEqualTo(201);
        assertThat(postGuest("203.0.113.7").statusCode()).isEqualTo(201);
        assertThat(postGuest("203.0.113.7").statusCode()).isEqualTo(429);

        // Un autre visiteur derrière le même proxy n'est pas touché.
        assertThat(postGuest("203.0.113.8").statusCode()).isEqualTo(201);
    }

    @Test
    void errorsAreProblemJson() throws Exception {
        HttpResponse<String> noSession = send("GET", "/api/me", null, null, null);
        assertProblem(noSession, 401);

        HttpResponse<String> badOrigin = send("POST", "/api/auth/guest", null, "https://evil.example.com", null);
        assertProblem(badOrigin, 403);

        HttpResponse<String> guest = postGuest("203.0.113.50");
        assertThat(guest.statusCode()).isEqualTo(201);
        String cookie = guest.headers().firstValue("Set-Cookie").orElseThrow().split(";")[0];

        assertProblem(send("GET", "/api/projects/" + UUID.randomUUID(), cookie, null, null), 404);
        assertProblem(send("POST", "/api/projects", cookie, null, "{pas du json"), 400);
        assertProblem(send("POST", "/api/projects", cookie, null, "{\"name\":\"x\",\"visibility\":\"bogus\"}"), 400);
        assertProblem(send("GET", "/api/route-qui-n-existe-pas", cookie, null, null), 404);
    }

    @Test
    void sessionCookieIsHttpOnlyAndSameSiteLax() throws Exception {
        String setCookie = postGuest("203.0.113.60").headers().firstValue("Set-Cookie").orElseThrow();
        assertThat(setCookie).contains("HttpOnly").containsIgnoringCase("SameSite=Lax");
    }

    @Test
    void healthIsPublicUnderApiPrefix() throws Exception {
        HttpResponse<String> health = send("GET", "/api/actuator/health", null, null, null);
        assertThat(health.statusCode()).isEqualTo(200);
        assertThat(JSON.readTree(health.body()).get("status").asText()).isEqualTo("UP");
        // Aucun détail de santé exposé.
        assertThat(JSON.readTree(health.body()).has("components")).isFalse();
    }

    private void assertProblem(HttpResponse<String> response, int status) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(response.headers().firstValue("Content-Type").orElse("")).startsWith("application/problem+json");
        JsonNode body = JSON.readTree(response.body());
        assertThat(body.get("status").asInt()).isEqualTo(status);
        assertThat(body.get("title").asText()).isNotBlank();
    }

    private HttpResponse<String> postGuest(String forwardedFor) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/auth/guest"))
                .header("X-Forwarded-For", forwardedFor)
                .POST(HttpRequest.BodyPublishers.noBody())
                .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> send(String method, String path, String cookie, String origin, String body)
            throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .method(method, body == null
                        ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofString(body));
        if (body != null) {
            builder.header("Content-Type", "application/json");
        }
        if (cookie != null) {
            builder.header("Cookie", cookie);
        }
        if (origin != null) {
            builder.header("Origin", origin);
        }
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}
