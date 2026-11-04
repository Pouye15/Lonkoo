package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.lonkoo.backend.github.GithubApiClient;
import com.lonkoo.backend.model.GithubUser;
import com.lonkoo.backend.web.GithubAuthException;
import com.sun.net.httpserver.HttpServer;

/**
 * Le client GitHub : requêtes émises, profil lu, et traduction des pannes (400, 502, 503, 504)
 * sans jamais reprendre le code, le jeton ou le secret dans un message.
 */
class GithubApiClientTest {

    private static final String CODE = "code-a-ne-pas-divulguer";
    private static final String TOKEN = "jeton-a-ne-pas-divulguer";
    private static final String SECRET = "secret-a-ne-pas-divulguer";

    private final List<String> requests = new CopyOnWriteArrayList<>();
    private final List<String> bodies = new CopyOnWriteArrayList<>();

    private HttpServer server;
    private volatile int status = 200;
    private volatile String responseBody = "{}";
    private volatile long delayMillis = 0;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            var headers = exchange.getRequestHeaders();
            requests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath()
                    + " | Authorization=" + headers.getFirst("Authorization")
                    + " | Accept=" + headers.getFirst("Accept")
                    + " | Upgrade=" + headers.getFirst("Upgrade"));
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            try {
                Thread.sleep(delayMillis);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            byte[] bytes = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    private GithubApiClient client() {
        return client(Duration.ofSeconds(5));
    }

    private GithubApiClient client(Duration timeout) {
        String base = "http://127.0.0.1:" + server.getAddress().getPort();
        return new GithubApiClient("id-appli", SECRET, "http://localhost:3000/api/auth/github/callback",
                base + "/login/oauth/access_token", base + "/user", timeout);
    }

    private static void assertStatus(Throwable thrown, int expected) {
        assertThat(thrown).isInstanceOfSatisfying(GithubAuthException.class,
                e -> assertThat(e.getStatusCode().value()).isEqualTo(expected));
        assertThat(String.valueOf(thrown.getMessage())).doesNotContain(CODE, TOKEN, SECRET);
        assertThat(((GithubAuthException) thrown).getBody().getDetail()).doesNotContain(CODE, TOKEN, SECRET);
    }

    // ------------------------------------------------------------------ Échange du code

    @Test
    void exchangeSendsTheApplicationCredentialsAndReturnsTheToken() throws Exception {
        responseBody = "{\"access_token\":\"" + TOKEN + "\",\"token_type\":\"bearer\"}";

        assertThat(client().exchangeCode(CODE)).isEqualTo(TOKEN);

        assertThat(requests.get(0)).startsWith("POST /login/oauth/access_token")
                .contains("Accept=application/json").contains("Upgrade=null");
        var sent = tools.jackson.databind.json.JsonMapper.shared().readTree(bodies.get(0));
        assertThat(sent.get("client_id").asText()).isEqualTo("id-appli");
        assertThat(sent.get("client_secret").asText()).isEqualTo(SECRET);
        assertThat(sent.get("code").asText()).isEqualTo(CODE);
        assertThat(sent.get("redirect_uri").asText()).isEqualTo("http://localhost:3000/api/auth/github/callback");
    }

    @Test
    void anExpiredCodeIsABadRequest() {
        responseBody = "{\"error\":\"bad_verification_code\",\"error_description\":\"" + CODE + "\"}";

        assertThatThrownBy(() -> client().exchangeCode(CODE)).satisfies(e -> assertStatus(e, 400));
    }

    @Test
    void otherGithubErrorsAreBadGateway() {
        responseBody = "{\"error\":\"incorrect_client_credentials\"}";
        assertThatThrownBy(() -> client().exchangeCode(CODE)).satisfies(e -> assertStatus(e, 502));

        responseBody = "{\"token_type\":\"bearer\"}";
        assertThatThrownBy(() -> client().exchangeCode(CODE)).satisfies(e -> assertStatus(e, 502));

        responseBody = "pas du json";
        assertThatThrownBy(() -> client().exchangeCode(CODE)).satisfies(e -> assertStatus(e, 502));

        status = 500;
        responseBody = "{}";
        assertThatThrownBy(() -> client().exchangeCode(CODE)).satisfies(e -> assertStatus(e, 502));
    }

    // ------------------------------------------------------------------ Profil

    @Test
    void theProfileIsReadWithTheBearerToken() {
        responseBody = "{\"id\":7,\"login\":\"octocat\",\"name\":\"Octo Cat\",\"avatar_url\":\"https://a/o.png\"}";

        GithubUser user = client().fetchUser(TOKEN);

        assertThat(user).isEqualTo(new GithubUser(7, "octocat", "Octo Cat", "https://a/o.png"));
        assertThat(requests.get(0)).startsWith("GET /user")
                .contains("Authorization=Bearer " + TOKEN).contains("Accept=application/vnd.github+json");
    }

    @Test
    void aProfileWithoutNameOrAvatarIsAccepted() {
        responseBody = "{\"id\":8,\"login\":\"anonyme\",\"name\":null}";

        assertThat(client().fetchUser(TOKEN)).isEqualTo(new GithubUser(8, "anonyme", null, null));
    }

    @Test
    void anUnusableProfileIsBadGateway() {
        status = 401;
        assertThatThrownBy(() -> client().fetchUser(TOKEN)).satisfies(e -> assertStatus(e, 502));

        status = 200;
        responseBody = "{\"login\":\"sans-id\"}";
        assertThatThrownBy(() -> client().fetchUser(TOKEN)).satisfies(e -> assertStatus(e, 502));

        responseBody = "pas du json";
        assertThatThrownBy(() -> client().fetchUser(TOKEN)).satisfies(e -> assertStatus(e, 502));
    }

    // ------------------------------------------------------------------ Réseau

    @Test
    void anUnreachableGithubIsServiceUnavailable() throws IOException {
        int closedPort;
        try (ServerSocket socket = new ServerSocket(0)) {
            closedPort = socket.getLocalPort();
        }
        String base = "http://127.0.0.1:" + closedPort;
        var client = new GithubApiClient("id", SECRET, "http://localhost/cb", base + "/token", base + "/user", Duration.ofSeconds(5));

        assertThatThrownBy(() -> client.exchangeCode(CODE)).satisfies(e -> assertStatus(e, 503));
        assertThatThrownBy(() -> client.fetchUser(TOKEN)).satisfies(e -> assertStatus(e, 503));
    }

    @Test
    void aSlowGithubIsGatewayTimeout() {
        delayMillis = 1500;

        assertThatThrownBy(() -> client(Duration.ofMillis(300)).exchangeCode(CODE)).satisfies(e -> assertStatus(e, 504));
    }
}
