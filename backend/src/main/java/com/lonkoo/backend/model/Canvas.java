package com.lonkoo.backend.model;

import java.time.Instant;
import java.util.UUID;

/**
 * Ligne de la table {@code canvases}.
 */
public record Canvas(
        UUID id,
        UUID projectId,
        String name,
        Instant createdAt) {
}