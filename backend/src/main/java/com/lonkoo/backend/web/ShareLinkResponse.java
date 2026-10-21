package com.lonkoo.backend.web;

import java.time.Instant;

/**
 * Réponse de {@code POST /api/canvases/{id}/share-links}.
 */
public record ShareLinkResponse(
        String url,
        Instant expiresAt) {
}