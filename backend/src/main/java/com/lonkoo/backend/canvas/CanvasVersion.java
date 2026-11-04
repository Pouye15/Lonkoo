package com.lonkoo.backend.canvas;

import java.time.Instant;
import java.util.UUID;

/**
 * Version nommée d'un canvas (instantané JSON validé).
 */
public record CanvasVersion(
        UUID id,
        UUID canvasId,
        String name,
        String message,
        int schemaVersion,
        UUID authorId,
        Instant createdAt) {
}