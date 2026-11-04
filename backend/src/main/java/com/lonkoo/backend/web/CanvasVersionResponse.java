package com.lonkoo.backend.web;

import java.time.Instant;
import java.util.UUID;

import tools.jackson.databind.JsonNode;

/**
 * Réponse de l'API pour une version de canvas (avec instantané, pour le détail).
 */
public record CanvasVersionResponse(
        UUID id,
        UUID canvasId,
        String name,
        String message,
        int schemaVersion,
        UUID authorId,
        Instant createdAt,
        JsonNode snapshot) {
}