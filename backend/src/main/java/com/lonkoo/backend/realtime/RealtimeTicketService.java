package com.lonkoo.backend.realtime;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.lonkoo.backend.canvas.CanvasAccessService;
import com.lonkoo.backend.model.CurrentUser;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

/**
 * Délivre les tickets temps réel (JWT HS256, durée de vie 5 minutes). Le
 * serveur temps réel vérifie signature, expiration, audience et que le canvas
 * du ticket (cid) est bien le document ouvert.
 */
@Service
public class RealtimeTicketService {

    private static final long TICKET_TTL_SECONDS = 300;
    private static final int MIN_SECRET_BYTES = 32;

    /** Couleurs de curseur lisibles sur fond clair comme sombre ; une par utilisateur, stable. */
    private static final String[] CURSOR_COLORS = {
        "#1265DD", "#D9480F", "#2B8A3E", "#9C36B5", "#C2255C", "#0B7285", "#E67700", "#5F3DC4"
    };

    /** Couleur de curseur d'un utilisateur : toujours la même pour un même identifiant. */
    public static String colorFor(UUID userId) {
        return CURSOR_COLORS[Math.floorMod(userId.hashCode(), CURSOR_COLORS.length)];
    }

    private final CanvasAccessService canvasAccessService;
    private final byte[] secret;

    public RealtimeTicketService(
            CanvasAccessService canvasAccessService,
            @Value("${realtime.ticket-secret}") String ticketSecret) {
        this.canvasAccessService = canvasAccessService;
        this.secret = ticketSecret.getBytes(StandardCharsets.UTF_8);
        // HS256 exige une clé d'au moins 256 bits : mieux vaut refuser de démarrer
        // que répondre 500 à chaque demande de ticket.
        if (secret.length < MIN_SECRET_BYTES) {
            throw new IllegalStateException("realtime.ticket-secret (REALTIME_TICKET_SECRET) doit faire au moins "
                    + MIN_SECRET_BYTES + " octets (ex. : openssl rand -hex 32)");
        }
    }

    public RealtimeTicketResponse issue(CurrentUser user, UUID canvasId) {
        var access = canvasAccessService.requireRead(canvasId);

        String name = user.displayName() != null ? user.displayName() : user.login();
        String color = colorFor(user.id());

        Instant issuedAt = Instant.now();
        Instant expiresAt = issuedAt.plusSeconds(TICKET_TTL_SECONDS);

        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer("lonkoo-backend")
                .audience("lonkoo-realtime")
                .subject(user.id().toString())
                .claim("cid", canvasId.toString())
                .claim("role", access.role().name())
                .claim("name", name)
                .claim("color", color)
                .issueTime(Date.from(issuedAt))
                .expirationTime(Date.from(expiresAt))
                .build();

        SignedJWT signedJWT = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
        try {
            signedJWT.sign(new MACSigner(secret));
        } catch (JOSEException e) {
            throw new IllegalStateException("Impossible de signer le ticket temps réel", e);
        }

        return new RealtimeTicketResponse(
                signedJWT.serialize(),
                expiresAt,
                access.role().name(),
                new RealtimeTicketResponse.TicketUser(name, color));
    }
}