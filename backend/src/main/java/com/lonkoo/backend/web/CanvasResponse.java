package com.lonkoo.backend.web;

import java.time.Instant;
import java.util.UUID;

/**
 * Réponse de l'API pour un canvas (métadonnées et rôle de l'appelant).
 */
public record CanvasResponse(
        UUID id,
        UUID projectId,
        String name,
        Instant createdAt,
        String role) {
}