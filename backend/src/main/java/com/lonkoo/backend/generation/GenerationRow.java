package com.lonkoo.backend.generation;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Une ligne de la table {@code generations}, sans le contenu des fichiers ni l'instantané. */
record GenerationRow(
        UUID id,
        UUID canvasId,
        UUID versionId,
        UUID requestedBy,
        String target,
        String status,
        String projectName,
        String slug,
        Integer fileCount,
        Long totalBytes,
        List<String> warnings,
        String error,
        Instant createdAt,
        Instant finishedAt,
        String pushStatus,
        String repoFullName,
        String repoUrl,
        String commitSha,
        boolean workflowSent,
        List<String> pushWarnings,
        String pushError,
        Instant pushedAt) {
}
