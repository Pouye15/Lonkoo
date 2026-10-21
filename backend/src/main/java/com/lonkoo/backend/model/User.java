package com.lonkoo.backend.model;

import java.time.Instant;
import java.util.UUID;

/**
 * Ligne de la table {@code users}.
 *
 * @param githubId null pour un invité
 * @param expiresAt null sauf pour un invité éphémère
 */
public record User(
        UUID id,
        Long githubId,
        String login,
        String displayName,
        String avatarUrl,
        boolean isGuest,
        Instant expiresAt,
        Instant createdAt) {
}