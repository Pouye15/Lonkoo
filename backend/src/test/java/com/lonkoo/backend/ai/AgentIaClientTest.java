package com.lonkoo.backend.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import com.sun.net.httpserver.HttpServer;

import tools.jackson.databind.json.JsonMapper;

/**
 * Le client du microservice {@code agent_ia}, contre un faux service HTTP (aucun réseau extérieur).
 */
class AgentIaClientTest {

    private static final JsonMapper JSON = JsonMapper.shared();

    private HttpServer service;
    private final AtomicInteger status = new AtomicInteger(200);
    private final AtomicReference<String> body = new AtomicReference<>("{}");
    private final AtomicReference<String> receivedToken = new AtomicReference<>();
    private final AtomicInteger calls = new AtomicInteger();

    @BeforeEach
    void startService() throws IOException {
        service = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        service.createContext("/", exchange -> {
            calls.incrementAndGet();
            receivedToken.set(exchange.getRequestHeaders().getFirst("X-Service-Token"));
            exchange.getRequestBody().readAllBytes();
            byte[] bytes = body.get().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(status.get(), bytes.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        });
        service.start();
    }

    @AfterEach
    void stopService() {
        service.stop(0);
    }

    private AgentIaClient client(String token) {
        return new AgentIaClient(HttpClient.newHttpClient(), "http://127.0.0.1:" + service.getAddress().getPort(), token,
                Duration.ofSeconds(5));
    }

    @Test
    void theServiceTokenIsSentInTheDedicatedHeader() {
        body.set("{\"findings\":[]}");

        client("jeton-de-service-0123456789").audit(JSON.readTree("{\"nodes\":[]}"));

        assertThat(receivedToken.get()).isEqualTo("jeton-de-service-0123456789");
    }

    @Test
    void auditKeepsOnlyCompleteFindings() {
        body.set("""
                {"findings":[
                  {"id":"r1","severity":"CRITICAL","category":"SECURITY","title":"Base exposée","targetNodeId":"n1"},
                  {"id":"r2","severity":"URGENT","category":"SECURITY","title":"Gravité inconnue","targetNodeId":"n1"},
                  {"id":"r3","severity":"CRITICAL","category":"SECURITY","title":"","targetNodeId":"n1"}
                ]}""");

        List<AiFinding> findings = client("jeton-de-service-0123456789").audit(JSON.readTree("{\"nodes\":[]}"));

        assertThat(findings).extracting(AiFinding::id).containsExactly("r1");
    }

    @Test
    void aRefusedTokenIsReportedAsAnInternalConfigurationError() {
        status.set(403);

        assertThatThrownBy(() -> client("mauvais-jeton-0123456789").audit(JSON.readTree("{\"nodes\":[]}")))
                .isInstanceOfSatisfying(AiUnavailableException.class, e -> {
                    assertThat(e.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
                    assertThat(e.getBody().getDetail()).doesNotContain("mauvais-jeton-0123456789");
                });
    }

    @Test
    void anEmptyTokenSendsNoHeaderSoTheAgentRefusesTheCall() {
        client("").audit(JSON.readTree("{\"nodes\":[]}"));

        assertThat(calls.get()).isEqualTo(1);
        assertThat(receivedToken.get()).isNull();
    }
}
