package com.lonkoo.backend;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * Faux microservice {@code agent_ia} pour les tests du backend, sur le modèle de {@link FakeGithubApiServer} : un
 * {@link HttpServer} du JDK, aucun accès réseau, aucune clé. Les tests règlent le code de réponse, le corps (ou une
 * suite de corps), un retard volontaire, et relisent ce que le backend a envoyé (chemin, jeton de service, corps).
 *
 * <p>Plusieurs fils d'exécution servent les requêtes : un appel volontairement lent ne doit pas bloquer les
 * suivants.</p>
 */
final class FakeAgentIaServer {

    final HttpServer server;
    private final ExecutorService workers = Executors.newFixedThreadPool(4);

    volatile int status = 200;
    volatile String body = "{}";
    volatile long delayMillis = 0;
    /** Corps programmés un par un ; vide, {@code body} sert à tous les appels. */
    final Queue<String> plannedBodies = new ConcurrentLinkedQueue<>();
    final List<String> paths = new CopyOnWriteArrayList<>();
    final List<String> tokens = new CopyOnWriteArrayList<>();
    final List<String> requestBodies = new CopyOnWriteArrayList<>();

    private FakeAgentIaServer(HttpServer server) {
        this.server = server;
    }

    static FakeAgentIaServer start() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            FakeAgentIaServer fake = new FakeAgentIaServer(server);
            server.setExecutor(fake.workers);
            server.createContext("/", fake::handle);
            server.start();
            return fake;
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    int port() {
        return server.getAddress().getPort();
    }

    void reset() {
        status = 200;
        body = "{}";
        delayMillis = 0;
        plannedBodies.clear();
        paths.clear();
        tokens.clear();
        requestBodies.clear();
    }

    void stop() {
        server.stop(0);
        workers.shutdownNow();
    }

    private void handle(HttpExchange exchange) throws IOException {
        paths.add(exchange.getRequestURI().getPath());
        tokens.add(String.valueOf(exchange.getRequestHeaders().getFirst("X-Service-Token")));
        requestBodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));

        if (delayMillis > 0) {
            try {
                Thread.sleep(delayMillis);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }

        String planned = plannedBodies.poll();
        byte[] bytes = (planned != null ? planned : body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        try {
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        } catch (IOException alreadyGone) {
            // Le backend a coupé (délai dépassé) : il n'y a plus personne à qui répondre.
        } finally {
            exchange.close();
        }
    }
}
