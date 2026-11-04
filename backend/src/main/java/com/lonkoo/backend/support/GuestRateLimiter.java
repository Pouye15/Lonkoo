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

import com.lonkoo.backend.web.TooManyRequestsException;

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

    /** Dans combien de temps une place se libère pour cette adresse (au moins une seconde). */
    public Duration retryAfter(String address) {
        Deque<Instant> hits = hitsByAddress.get(address);
        if (hits == null) {
            return Duration.ofSeconds(1);
        }
        synchronized (hits) {
            Instant oldest = hits.peekFirst();
            if (oldest == null) {
                return Duration.ofSeconds(1);
            }
            Duration wait = Duration.between(Instant.now(), oldest.plus(WINDOW));
            return wait.isNegative() || wait.isZero() ? Duration.ofSeconds(1) : wait;
        }
    }

    /**
     * Le refus à renvoyer quand {@link #allow} a dit non : un 429 qui dit quand réessayer et rappelle qu'une connexion
     * GitHub n'est pas concernée (plusieurs personnes derrière une même adresse, par exemple un Wi-Fi partagé, se
     * partagent la limite).
     */
    public TooManyRequestsException refusal(String address) {
        Duration wait = retryAfter(address);
        long minutes = Math.max(1, (wait.toSeconds() + 59) / 60);
        return new TooManyRequestsException(
                "Trop d'espaces de démonstration ont été ouverts depuis cette adresse. Réessayez dans " + minutes
                        + (minutes > 1 ? " minutes" : " minute") + ", ou connectez-vous avec GitHub : cette limite ne s'y applique pas.",
                wait);
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
