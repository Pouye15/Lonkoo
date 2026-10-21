package com.lonkoo.backend.support;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Limite simple par adresse sur la création d'invités ({@code POST /auth/guest}
 * et jonction anonyme par lien). Par défaut 20 par heure, compteur en mémoire
 * remis à zéro au redémarrage ; les adresses inactives sont oubliées
 * régulièrement pour que la table ne grossisse pas indéfiniment.
 */
@Component
public class GuestRateLimiter {

    private static final Duration WINDOW = Duration.ofHours(1);

    private final int maxPerHour;
    private final Map<String, Deque<Instant>> hitsByAddress = new ConcurrentHashMap<>();

    public GuestRateLimiter(@Value("${lonkoo.guest-rate-limit-per-hour:20}") int maxPerHour) {
        this.maxPerHour = maxPerHour;
    }

    public boolean allow(String address) {
        Instant now = Instant.now();
        Instant cutoff = now.minus(WINDOW);

        Deque<Instant> hits = hitsByAddress.computeIfAbsent(address, ignored -> new ArrayDeque<>());

        synchronized (hits) {
            while (!hits.isEmpty() && hits.peekFirst().isBefore(cutoff)) {
                hits.pollFirst();
            }
            if (hits.size() >= maxPerHour) {
                return false;
            }
            hits.addLast(now);
            return true;
        }
    }

    /** Oublie les adresses sans appel depuis plus d'une heure. */
    @Scheduled(fixedDelayString = "PT15M", initialDelayString = "PT15M")
    public void purgeIdle() {
        purgeIdle(Instant.now());
    }

    /** Variante à heure donnée (tests). */
    public void purgeIdle(Instant now) {
        Instant cutoff = now.minus(WINDOW);
        hitsByAddress.entrySet().removeIf(entry -> {
            Deque<Instant> hits = entry.getValue();
            synchronized (hits) {
                return hits.isEmpty() || hits.peekLast().isBefore(cutoff);
            }
        });
    }

    /** Nombre d'adresses suivies (tests et diagnostic). */
    public int trackedAddresses() {
        return hitsByAddress.size();
    }
}
