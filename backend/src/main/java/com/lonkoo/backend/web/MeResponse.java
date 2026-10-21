package com.lonkoo.backend.web;

import java.util.UUID;

/**
 * Réponse de {@code GET /api/me} et {@code POST /api/auth/guest}.
 */
public record MeResponse(
        UUID id,
        String login,
        String displayName,
        String avatarUrl,
        boolean isGuest) {
}