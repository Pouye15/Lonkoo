package com.lonkoo.backend.project;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.UUID;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.lonkoo.backend.canvas.CanvasAccessService;
import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.support.AuditService;
import com.lonkoo.backend.support.UsageLimits;
import com.lonkoo.backend.web.BadRequestException;
import com.lonkoo.backend.web.NotFoundException;
import com.lonkoo.backend.web.ShareLinkResponse;

/**
 * Liens de partage d'un canvas (durée au plus 72 h, rôle WRITE ou READ).
 * Le jeton est aléatoire (32 octets) et seul son empreinte SHA-256 est
 * stockée. Un invité qui ouvre un lien est rattaché comme membre du projet.
 */
@Service
public class ShareLinkService {

    private final JdbcClient jdbcClient;
    private final CanvasAccessService canvasAccessService;
    private final AuditService auditService;
    private final UsageLimits usageLimits;
    private final String publicUrl;
    private final SecureRandom secureRandom = new SecureRandom();

    public ShareLinkService(
            JdbcClient jdbcClient,
            CanvasAccessService canvasAccessService,
            AuditService auditService,
            UsageLimits usageLimits,
            @Value("${app.public-url}") String publicUrl) {
        this.jdbcClient = jdbcClient;
        this.canvasAccessService = canvasAccessService;
        this.auditService = auditService;
        this.usageLimits = usageLimits;
        this.publicUrl = publicUrl;
    }

    @Transactional
    public ShareLinkResponse createLink(CurrentUser user, UUID canvasId, String role, Integer ttlHours) {
        canvasAccessService.requireManageMembers(canvasId);

        if (!role.equals("WRITE") && !role.equals("READ")) {
            throw new BadRequestException("Rôle de partage invalide : " + role);
        }
        usageLimits.requireRoomForShareLink(canvasId);
        int ttl = ttlHours == null ? 72 : ttlHours;
        Instant expiresAt = Instant.now().plus(ttl, ChronoUnit.HOURS);

        String token = generateToken();
        String tokenHash = sha256(token);

        jdbcClient.sql("""
                insert into share_links (token_hash, canvas_id, role, expires_at, created_by)
                values (?, ?, ?, ?, ?)
                """)
                .param(tokenHash)
                .param(canvasId)
                .param(role)
                .param(expiresAt.atOffset(ZoneOffset.UTC))
                .param(user.id())
                .update();

        auditService.record(user.id(), "share.created", "canvas:" + canvasId, null);

        return new ShareLinkResponse(publicUrl + "/join/" + token, expiresAt);
    }

    /**
     * Rattache un utilisateur au projet du canvas via le lien. Renvoie
     * {@link JoinResult} si le lien est valide, sinon lève un 404.
     *
     * <p>{@code userSupplier} n'est appelé qu'une fois le lien reconnu et non
     * expiré : un jeton inventé ne crée donc aucun invité. Dans la même
     * transaction, un échec annule aussi la création de l'invité.</p>
     */
    @Transactional
    public JoinResult join(String token, Supplier<CurrentUser> userSupplier) {
        String tokenHash = sha256(token);
        var row = jdbcClient.sql("""
                select sl.canvas_id, sl.role, sl.expires_at, c.project_id
                from share_links sl
                join canvases c on c.id = sl.canvas_id
                where sl.token_hash = ?
                """)
                .param(tokenHash)
                .query((rs, rowNum) -> new ShareLinkRow(
                        rs.getObject("canvas_id", UUID.class),
                        rs.getObject("project_id", UUID.class),
                        rs.getString("role"),
                        rs.getObject("expires_at", OffsetDateTime.class).toInstant()))
                .optional()
                .orElseThrow(() -> new NotFoundException("Lien de partage inconnu ou expiré"));

        if (row.expiresAt().isBefore(Instant.now())) {
            throw new NotFoundException("Lien de partage expiré");
        }

        CurrentUser user = userSupplier.get();

        // Ajout atomique : deux jonctions simultanées du même utilisateur ne se heurtent pas, et un membre
        // déjà plus haut placé (OWNER, MAINTAINER…) n'est jamais rétrogradé par un lien.
        String roles = "array['OWNER','MAINTAINER','WRITE','TRIAGE','READ']";
        jdbcClient.sql("insert into project_members (project_id, user_id, role) values (?, ?, ?) "
                + "on conflict (project_id, user_id) do update set role = case "
                + "when array_position(" + roles + ", excluded.role::text) < array_position(" + roles + ", project_members.role::text) "
                + "then excluded.role else project_members.role end")
                .param(row.projectId())
                .param(user.id())
                .param(row.role())
                .update();

        auditService.record(user.id(), "share.joined", "canvas:" + row.canvasId(), null);

        return new JoinResult(row.projectId(), row.canvasId(), row.role(), user);
    }

    private String generateToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 indisponible", e);
        }
    }

    /** Résultat du rattachement via un lien ({@code user} : celui qui a rejoint, invité nouvellement créé ou non). */
    public record JoinResult(UUID projectId, UUID canvasId, String role, CurrentUser user) {
    }

    private record ShareLinkRow(UUID canvasId, UUID projectId, String role, Instant expiresAt) {
    }
}