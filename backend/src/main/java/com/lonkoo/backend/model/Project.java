package com.lonkoo.backend.model;

import java.time.Instant;
import java.util.UUID;

/**
 * Ligne de la table {@code projects}, avec le login de son propriétaire (joint à la lecture).
 */
public record Project(
        UUID id,
        String name,
        String description,
        String visibility,
        UUID ownerId,
        String ownerLogin,
        Instant createdAt,
        Instant updatedAt) {
}