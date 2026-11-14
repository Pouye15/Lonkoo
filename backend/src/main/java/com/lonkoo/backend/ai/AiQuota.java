package com.lonkoo.backend.ai;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.web.TooManyRequestsException;

/**
 * Plafonds d'appels à l'IA, comptés par jour UTC (Dakar est en UTC) : un plafond par personne (plus bas pour un invité,
 * qu'on peut multiplier à volonté) et un plafond pour tout le service, pour que le coût reste borné quoi qu'il arrive.
 *
 * <p>Deux compteurs séparés : les <strong>propositions</strong> (esquisse, complétion, audit) et le
 * <strong>dialogue</strong> (chatbot). Un échange de dix messages ne doit pas épuiser le quota d'esquisses, et un
 * message de conversation ne coûte pas autant qu'une esquisse : chacun a son plafond
 * ({@code AI_DAILY_QUOTA} et {@code AI_CHAT_DAILY_QUOTA}). Le plafond du service, lui, compte la <strong>somme</strong>
 * des deux : c'est le coût total qui est borné.</p>
 *
 * <p>Le compteur d'une personne est incrémenté en un seul ordre SQL qui refuse au-delà du plafond : deux appels
 * simultanés ne passent jamais le plafond à eux deux. Le plafond du service est lu juste avant ; sous forte
 * concurrence il peut être dépassé de quelques appels, ce qui ne change rien au coût borné. Un appel est compté
 * avant d'être envoyé au fournisseur, que celui-ci réponde ou non : c'est l'appel qui coûte.</p>
 */
@Service
public class AiQuota {

    private final JdbcClient jdbcClient;
    private final int perUser;
    private final int perGuest;
    private final int chatPerUser;
    private final int chatPerGuest;
    private final int globalCap;

    public AiQuota(
            JdbcClient jdbcClient,
            @Value("${lonkoo.ai.daily-quota:30}") int perUser,
            @Value("${lonkoo.ai.guest-daily-quota:5}") int perGuest,
            @Value("${lonkoo.ai.chat-daily-quota:60}") int chatPerUser,
            @Value("${lonkoo.ai.chat-guest-daily-quota:10}") int chatPerGuest,
            @Value("${lonkoo.ai.global-daily-cap:500}") int globalCap) {
        this.jdbcClient = jdbcClient;
        this.perUser = perUser;
        this.perGuest = perGuest;
        this.chatPerUser = chatPerUser;
        this.chatPerGuest = chatPerGuest;
        this.globalCap = globalCap;
    }

    /** Compte une proposition (esquisse, complétion, audit), ou lève un 429 (avec {@code Retry-After}) si un plafond est atteint. */
    public void consume(CurrentUser user) {
        Duration untilReset = untilNextDay();
        requireServiceCapacity(untilReset);

        int limit = user.isGuest() ? perGuest : perUser;
        boolean counted = limit > 0 && jdbcClient.sql("""
                insert into ai_usage (user_id, day, calls)
                values (?, (now() at time zone 'utc')::date, 1)
                on conflict (user_id, day) do update set calls = ai_usage.calls + 1
                where ai_usage.calls < ?
                returning calls
                """)
                .param(user.id())
                .param(limit)
                .query(Integer.class)
                .optional()
                .isPresent();
        if (!counted) {
            throw new TooManyRequestsException(user.isGuest()
                    ? "Un espace de démonstration peut faire " + perGuest + " appels à l'IA par jour. Connectez-vous avec GitHub pour en avoir "
                            + perUser + ", ou réessayez demain."
                    : "Vous avez atteint votre limite de " + perUser + " appels à l'IA par jour. Elle se renouvelle à minuit (UTC).",
                    untilReset);
        }
    }

    /**
     * Compte un message de dialogue (chatbot), sur son propre compteur : une conversation n'entame pas le quota des
     * esquisses, et réciproquement. Même refus en 429 avec {@code Retry-After} au-delà du plafond.
     */
    public void consumeChat(CurrentUser user) {
        Duration untilReset = untilNextDay();
        requireServiceCapacity(untilReset);

        int limit = user.isGuest() ? chatPerGuest : chatPerUser;
        boolean counted = limit > 0 && jdbcClient.sql("""
                insert into ai_usage (user_id, day, calls, chat_calls)
                values (?, (now() at time zone 'utc')::date, 0, 1)
                on conflict (user_id, day) do update set chat_calls = ai_usage.chat_calls + 1
                where ai_usage.chat_calls < ?
                returning chat_calls
                """)
                .param(user.id())
                .param(limit)
                .query(Integer.class)
                .optional()
                .isPresent();
        if (!counted) {
            throw new TooManyRequestsException(user.isGuest()
                    ? "Un espace de démonstration peut échanger " + chatPerGuest
                            + " messages avec le copilote IA par jour. Connectez-vous avec GitHub pour en avoir "
                            + chatPerUser + ", ou réessayez demain."
                    : "Vous avez atteint votre limite de " + chatPerUser
                            + " messages avec le copilote IA par jour. Elle se renouvelle à minuit (UTC).",
                    untilReset);
        }
    }

    /** Le plafond de tout le service : propositions et dialogue comptés ensemble. */
    private void requireServiceCapacity(Duration untilReset) {
        if (globalCap <= 0 || usedToday() >= globalCap) {
            throw new TooManyRequestsException(
                    "Le copilote IA a atteint sa limite pour aujourd'hui. Réessayez demain.", untilReset);
        }
    }

    private int usedToday() {
        return jdbcClient.sql("select coalesce(sum(calls + chat_calls), 0) from ai_usage where day = (now() at time zone 'utc')::date")
                .query(Integer.class)
                .single();
    }

    private static Duration untilNextDay() {
        Instant now = Instant.now();
        Instant midnight = LocalDate.now(ZoneOffset.UTC).plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        return Duration.between(now, midnight);
    }

    /** Oublie les compteurs de plus de 30 jours : ils ne servent plus à rien. */
    @Scheduled(cron = "0 15 3 * * *", zone = "UTC")
    void purgeOld() {
        jdbcClient.sql("delete from ai_usage where day < (now() at time zone 'utc')::date - 30").update();
    }
}
