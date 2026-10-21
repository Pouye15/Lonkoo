package com.lonkoo.backend;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * Faux serveur temps réel pour les tests du backend : instantané, restauration et fermeture des
 * connexions, avec vérification du jeton de service. Les tests règlent ses réponses et lisent ce
 * qu'il a reçu.
 */
final class FakeRealtimeServer {
    static final String TOKEN = "test-service-token";

    final HttpServer server;
    volatile String snapshot;
    volatile int snapshotStatus = 200;
    volatile int restoreStatus = 204;
    volatile String expectedToken = TOKEN;
    final List<String> restoreBodies = new CopyOnWriteArrayList<>();
    final List<String> authorizations = new CopyOnWriteArrayList<>();
    volatile int closeStatus = 204;
    final List<String> closedCanvases = new CopyOnWriteArrayList<>();

    private FakeRealtimeServer(HttpServer server) {
        this.server = server;
    }

    static FakeRealtimeServer start() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            FakeRealtimeServer fake = new FakeRealtimeServer(server);
            server.createContext("/internal/canvases/", fake::handle);
            server.start();
            return fake;
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    int port() {
        return server.getAddress().getPort();
    }

    void reset(String seed) {
        snapshot = seed;
        snapshotStatus = 200;
        restoreStatus = 204;
        expectedToken = TOKEN;
        restoreBodies.clear();
        authorizations.clear();
        closeStatus = 204;
        closedCanvases.clear();
    }

    private void handle(HttpExchange exchange) throws IOException {
        String authorization = exchange.getRequestHeaders().getFirst("Authorization");
        authorizations.add(String.valueOf(authorization));
        String path = exchange.getRequestURI().getPath();
        if (!("Bearer " + expectedToken).equals(authorization)) {
            respond(exchange, 401, "{}");
        } else if (path.endsWith("/snapshot") && "GET".equals(exchange.getRequestMethod())) {
            respond(exchange, snapshotStatus, snapshotStatus == 200 ? snapshot : "{}");
        } else if (path.endsWith("/close") && "POST".equals(exchange.getRequestMethod())) {
            closedCanvases.add(path.replace("/internal/canvases/", "").replace("/close", ""));
            respond(exchange, closeStatus, null);
        } else if (path.endsWith("/restore") && "POST".equals(exchange.getRequestMethod())) {
            restoreBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            respond(exchange, restoreStatus, null);
        } else {
            respond(exchange, 404, "{}");
        }
    }

    private void respond(HttpExchange exchange, int status, String body) throws IOException {
        if (body == null || status == 204) {
            exchange.sendResponseHeaders(status, -1);
        } else {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
        }
        exchange.close();
    }
}
