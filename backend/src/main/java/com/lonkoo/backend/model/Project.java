package com.lonkoo.backend.model;

import java.time.Instant;
import java.util.UUID;

/**
 * Ligne de la table {@code projects}.
 */
public record Project(
        UUID id,
        String name,
        String description,
        String visibility,
        UUID ownerId,
        Instant createdAt,
        Instant updatedAt) {
}