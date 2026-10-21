package com.lonkoo.backend.model;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/**
 * Utilisateur connecté, conservé dans la session serveur et exposé comme
 * principal Spring Security.
 */
public record CurrentUser(
        UUID id,
        String login,
        String displayName,
        String avatarUrl,
        boolean isGuest,
        Instant expiresAt) implements Serializable {
}