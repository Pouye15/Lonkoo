package com.lonkoo.backend.web;

import java.time.Instant;
import java.util.UUID;

/**
 * Réponse de l'API pour un projet (résumé sans membres).
 */
public record ProjectResponse(
        UUID id,
        String name,
        String description,
        String visibility,
        UUID ownerId,
        Instant createdAt,
        Instant updatedAt) {
}