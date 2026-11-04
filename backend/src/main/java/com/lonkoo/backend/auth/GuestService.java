package com.lonkoo.backend.auth;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.lonkoo.backend.canvas.SeedContent;
import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.support.AuditService;

/**
 * Création des invités éphémères. {@link #createGuest()} crée en plus un
 * projet « Démo » ; {@link #createGuestUser()} ne crée que l'utilisateur
 * (utilisé par les liens de partage).
 */
@Service
public class GuestService {

    private final JdbcClient jdbcClient;
    private final SeedContent seedContent;
    private final AuditService auditService;
    private final long guestTtlHours;

    public GuestService(
            JdbcClient jdbcClient,
            SeedContent seedContent,
            AuditService auditService,
            @Value("${lonkoo.guest-ttl-hours:24}") long guestTtlHours) {
        this.jdbcClient = jdbcClient;
        this.seedContent = seedContent;
        this.auditService = auditService;
        this.guestTtlHours = guestTtlHours;
    }

    @Transactional
    public CurrentUser createGuest() {
        CurrentUser user = createGuestUser();
        UUID projectId = UUID.randomUUID();
        UUID canvasId = UUID.randomUUID();

        jdbcClient.sql("""
                insert into projects (id, name, description, visibility, owner_id)
                values (?, 'Démo', 'Modèle d''exemple : marketplace avec paiement mobile', 'private', ?)
                """)
                .param(projectId)
                .param(user.id())
                .update();

        jdbcClient.sql("""
                insert into project_members (project_id, user_id, role)
                values (?, ?, 'OWNER')
                """)
                .param(projectId)
                .param(user.id())
                .update();

        jdbcClient.sql("""
                insert into canvases (id, project_id, name, seed_snapshot)
                values (?, ?, 'Architecture', ?::jsonb)
                """)
                .param(canvasId)
                .param(projectId)
                .param(seedContent.json())
                .update();

        return user;
    }

    /**
     * Crée uniquement l'utilisateur invité (sans projet). Journalise
     * {@code guest.created}.
     */
    @Transactional
    public CurrentUser createGuestUser() {
        UUID userId = UUID.randomUUID();
        String login = "invite-" + userId.toString().substring(0, 8);
        Instant expiresAt = Instant.now().plus(guestTtlHours, ChronoUnit.HOURS);

        jdbcClient.sql("""
                insert into users (id, login, display_name, is_guest, expires_at)
                values (?, ?, ?, true, ?)
                """)
                .param(userId)
                .param(login)
                .param("Invité")
                .param(expiresAt.atOffset(ZoneOffset.UTC))
                .update();

        auditService.record(userId, "guest.created", "user:" + userId, null);

        return new CurrentUser(userId, login, "Invité", null, true, expiresAt);
    }
}