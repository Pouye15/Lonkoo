package com.lonkoo.backend.security;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Jetons d'accès GitHub, gardés <strong>en mémoire du serveur seulement</strong>, par identifiant de session.
 *
 * <p>Les sessions, elles, sont en base (un redémarrage ne déconnecte plus personne) : y ranger le jeton le
 * recopierait, en clair, dans la table des sessions et dans ses sauvegardes. On ne le fait pas. Conséquence voulue : après
 * un redémarrage, la personne reste connectée mais doit reconnecter GitHub avant d'envoyer un projet (le statut
 * {@code GET /api/github/status} annonce alors « non connecté », et l'interface propose de se reconnecter).</p>
 *
 * <p>Un jeton qui n'a servi à rien pendant la durée d'une session est oublié, comme la session elle-même. Une
 * seule instance du serveur : avec plusieurs, il faudrait un magasin partagé et chiffré.</p>
 */
@Component
public class GithubTokenStore {

    private record Entry(String token, Instant lastUsed) {
    }

    private final ConcurrentHashMap<String, Entry> tokens = new ConcurrentHashMap<>();
    private final Duration idleTimeout;

    public GithubTokenStore(@Value("${server.servlet.session.timeout:24h}") Duration idleTimeout) {
        this.idleTimeout = idleTimeout;
    }

    public void put(String sessionId, String token) {
        tokens.put(sessionId, new Entry(token, Instant.now()));
    }

    /** Le jeton de cette session s'il sert encore ; chaque lecture repousse son oubli, comme pour la session. */
    public Optional<String> get(String sessionId) {
        Entry entry = tokens.get(sessionId);
        if (entry == null) {
            return Optional.empty();
        }
        Instant now = Instant.now();
        if (entry.lastUsed().plus(idleTimeout).isBefore(now)) {
            tokens.remove(sessionId, entry);
            return Optional.empty();
        }
        tokens.replace(sessionId, entry, new Entry(entry.token(), now));
        return Optional.of(entry.token());
    }

    public void remove(String sessionId) {
        tokens.remove(sessionId);
    }

    /** Oublie les jetons de sessions que plus personne n'utilise (déconnexion sans passer par « se déconnecter »). */
    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT1H")
    void forgetIdle() {
        Instant limit = Instant.now().minus(idleTimeout);
        tokens.values().removeIf(entry -> entry.lastUsed().isBefore(limit));
    }

    int size() {
        return tokens.size();
    }
}
