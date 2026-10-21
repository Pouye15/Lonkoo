package com.lonkoo.backend.generation;

import java.time.Instant;
import java.util.UUID;

/** Une ligne de la table {@code deployments}. */
record DeploymentRow(
        UUID id,
        UUID generationId,
        UUID requestedBy,
        String method,
        String status,
        String publicUrl,
        Long runId,
        String runUrl,
        String detail,
        Instant createdAt,
        Instant updatedAt) {
}
