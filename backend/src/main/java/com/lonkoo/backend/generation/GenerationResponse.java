package com.lonkoo.backend.generation;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Une génération de projet : son état, ses fichiers et l'envoi sur GitHub qui l'a suivie. */
public record GenerationResponse(
        UUID id,
        UUID canvasId,
        UUID versionId,
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
        Push push,
        /** Liste des fichiers (chemin et taille), seulement pour une génération terminée et seulement au détail. */
        List<FileInfo> files) {

    /** L'envoi sur GitHub : {@code status} vaut null tant qu'aucun envoi n'a été demandé. */
    public record Push(
            String status,
            String repoFullName,
            String repoUrl,
            String commitSha,
            boolean workflowSent,
            List<String> warnings,
            String error,
            Instant pushedAt) {
    }

    public record FileInfo(String path, int bytes) {
    }

    static GenerationResponse of(GenerationRow row, List<FileInfo> files) {
        Push push = row.pushStatus() == null
                ? new Push(null, null, null, null, false, List.of(), null, null)
                : new Push(row.pushStatus(), row.repoFullName(), row.repoUrl(), row.commitSha(), row.workflowSent(),
                        row.pushWarnings(), row.pushError(), row.pushedAt());
        return new GenerationResponse(row.id(), row.canvasId(), row.versionId(), row.target(), row.status(), row.projectName(),
                row.slug(), row.fileCount(), row.totalBytes(), row.warnings(), row.error(), row.createdAt(), row.finishedAt(), push, files);
    }
}
