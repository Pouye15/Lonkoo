package com.lonkoo.backend.web;

import java.time.Instant;
import java.util.UUID;

/**
 * Un lien de partage encore actif, tel que le liste {@code GET /api/canvases/{id}/share-links}.
 * Le jeton n'y figure pas (il n'est pas retrouvable) ; {@code createdBy} est le nom de son auteur, ou null s'il a disparu.
 */
public record ShareLinkSummary(
        UUID id,
        String role,
        Instant expiresAt,
        Instant createdAt,
        String createdBy) {
}
