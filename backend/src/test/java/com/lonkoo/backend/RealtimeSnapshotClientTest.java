package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import com.lonkoo.backend.realtime.RealtimeSnapshotClient;
import com.lonkoo.backend.realtime.RealtimeUnavailableException;
import com.sun.net.httpserver.HttpServer;

import tools.jackson.databind.json.JsonMapper;

/**
 * Le client du serveur temps réel : jeton de service, HTTP/1.1, et traduction des pannes en
 * 502, 503 ou 504 (jamais en 500).
 */
class RealtimeSnapshotClientTest {

    private static final String TOKEN = "jeton-de-test";
    private static final String EMPTY_SNAPSHOT = "{\"schemaVersion\":1,\"nodes\":[],\"edges\":[]}";

    private final List<String> requests = new CopyOnWriteArrayList<>();
    private final List<String> bodies = new CopyOnWriteArrayList<>();
    private final UUID canvasId = UUID.randomUUID();

    private HttpServer server;
    private volatile int status = 200;
    private volatile String responseBody = EMPTY_SNAPSHOT;
    private volatile long delayMillis = 0;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            var headers = exchange.getRequestHeaders();
            requests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath()
                    + " | Authorization=" + headers.getFirst("Authorization")
                    + " | Upgrade=" + headers.getFirst("Upgrade")
                    + " | Connection=" + headers.getFirst("Connection"));
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            try {
                Thread.sleep(delayMillis);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            if (status == 204) {
                exchange.sendResponseHeaders(204, -1);
            } else {
                byte[] bytes = responseBody.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(status, bytes.length);
                exchange.getResponseBody().write(bytes);
            }
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    private RealtimeSnapshotClient client() {
        return new RealtimeSnapshotClient("http://127.0.0.1:" + server.getAddress().getPort(), TOKEN, Duration.ofSeconds(5));
    }

    private static int statusOf(RealtimeUnavailableException e) {
        return e.getStatusCode().value();
    }

    @Test
    void snapshotPresentsTheServiceTokenOverPlainHttp11() {
        var snapshot = client().snapshot(canvasId);

        assertThat(snapshot.get("schemaVersion").asInt()).isEqualTo(1);
        assertThat(requests).hasSize(1);
        assertThat(requests.get(0))
                .startsWith("GET /internal/canvases/" + canvasId + "/snapshot")
                .contains("Authorization=Bearer " + TOKEN)
                // Pas de montée en HTTP/2 en clair : c'est elle que le serveur Node refusait.
                .contains("Upgrade=null")
                .doesNotContain("HTTP2-Settings");
        assertThat(requests.get(0)).doesNotContain("Connection=Upgrade");
    }

    @Test
    void restorePostsTheSnapshotAndExpectsNoContent() throws Exception {
        status = 204;
        var snapshot = JsonMapper.shared().readTree("{\"schemaVersion\":1,\"nodes\":[],\"edges\":[],\"meta\":{\"name\":\"x\"}}");

        client().restore(canvasId, snapshot);

        assertThat(requests.get(0))
                .startsWith("POST /internal/canvases/" + canvasId + "/restore")
                .contains("Authorization=Bearer " + TOKEN);
        assertThat(JsonMapper.shared().readTree(bodies.get(0))).isEqualTo(snapshot);
    }

    @Test
    void closeConnectionsPostsToTheCloseRouteWithTheServiceToken() {
        status = 204;

        client().closeConnections(canvasId);

        assertThat(requests).hasSize(1);
        assertThat(requests.get(0)).startsWith("POST /internal/canvases/" + canvasId + "/close")
                .contains("Authorization=Bearer " + TOKEN).contains("Upgrade=null");
    }

    @Test
    void closingTheConnectionsOfOnePersonNamesThemInTheBodyAndKeepsTheServiceToken() throws Exception {
        status = 204;
        UUID userId = UUID.randomUUID();

        client().closeConnections(canvasId, userId);

        assertThat(requests).hasSize(1);
        assertThat(requests.get(0)).startsWith("POST /internal/canvases/" + canvasId + "/close")
                .contains("Authorization=Bearer " + TOKEN).contains("Upgrade=null");
        assertThat(JsonMapper.shared().readTree(bodies.get(0)).get("userId").asText()).isEqualTo(userId.toString());
    }

    @Test
    void closingEveryConnectionOfACanvasSendsNoBody() {
        status = 204;

        client().closeConnections(canvasId);

        assertThat(bodies.get(0)).isEmpty();
    }

    @Test
    void aFailedCloseForOnePersonIsReportedAsBadGateway() {
        status = 500;

        assertThatThrownBy(() -> client().closeConnections(canvasId, UUID.randomUUID()))
                .isInstanceOfSatisfying(RealtimeUnavailableException.class,
                        e -> assertThat(statusOf(e)).isEqualTo(HttpStatus.BAD_GATEWAY.value()));
    }

    @Test
    void aFailedCloseIsReportedAsBadGateway() {
        status = 500;

        assertThatThrownBy(() -> client().closeConnections(canvasId))
                .isInstanceOfSatisfying(RealtimeUnavailableException.class,
                        e -> assertThat(statusOf(e)).isEqualTo(HttpStatus.BAD_GATEWAY.value()));
    }

    @Test
    void anErrorFromTheRealtimeServerIsBadGateway() {
        status = 500;
        responseBody = "{\"error\":\"erreur interne\"}";

        assertThatThrownBy(() -> client().snapshot(canvasId))
                .isInstanceOfSatisfying(RealtimeUnavailableException.class, e -> {
                    assertThat(statusOf(e)).isEqualTo(HttpStatus.BAD_GATEWAY.value());
                    assertThat(e.getBody().getDetail()).contains("500");
                });
        assertThatThrownBy(() -> client().restore(canvasId, JsonMapper.shared().createObjectNode()))
                .isInstanceOfSatisfying(RealtimeUnavailableException.class,
                        e -> assertThat(statusOf(e)).isEqualTo(HttpStatus.BAD_GATEWAY.value()));
    }

    @Test
    void aRefusedServiceTokenIsExplainedInTheDetail() {
        status = 401;
        responseBody = "{}";

        assertThatThrownBy(() -> client().snapshot(canvasId))
                .isInstanceOfSatisfying(RealtimeUnavailableException.class, e -> {
                    assertThat(statusOf(e)).isEqualTo(HttpStatus.BAD_GATEWAY.value());
                    assertThat(e.getBody().getDetail()).contains("jeton de service");
                });
    }

    @Test
    void anUnreadableSnapshotIsBadGateway() {
        responseBody = "ceci n'est pas du json";

        assertThatThrownBy(() -> client().snapshot(canvasId))
                .isInstanceOfSatisfying(RealtimeUnavailableException.class,
                        e -> assertThat(statusOf(e)).isEqualTo(HttpStatus.BAD_GATEWAY.value()));
    }

    @Test
    void anUnreachableServerIsServiceUnavailable() throws IOException {
        int closedPort;
        try (ServerSocket socket = new ServerSocket(0)) {
            closedPort = socket.getLocalPort();
        }
        var client = new RealtimeSnapshotClient("http://127.0.0.1:" + closedPort, TOKEN, Duration.ofSeconds(5));

        assertThatThrownBy(() -> client.snapshot(canvasId))
                .isInstanceOfSatisfying(RealtimeUnavailableException.class,
                        e -> assertThat(statusOf(e)).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE.value()));
    }

    @Test
    void aSlowServerIsGatewayTimeout() {
        delayMillis = 1500;
        var client = new RealtimeSnapshotClient("http://127.0.0.1:" + server.getAddress().getPort(), TOKEN,
                Duration.ofMillis(300));

        assertThatThrownBy(() -> client.snapshot(canvasId))
                .isInstanceOfSatisfying(RealtimeUnavailableException.class,
                        e -> assertThat(statusOf(e)).isEqualTo(HttpStatus.GATEWAY_TIMEOUT.value()));
    }

    @Test
    void aBlankServiceTokenPreventsStartup() {
        assertThatThrownBy(() -> new RealtimeSnapshotClient("http://localhost:1234", " ", Duration.ofSeconds(1)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("REALTIME_SERVICE_TOKEN");
    }
}
