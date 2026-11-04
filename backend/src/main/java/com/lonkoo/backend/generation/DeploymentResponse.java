package com.lonkoo.backend.generation;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Un déploiement du projet généré. {@code manual} donne les étapes à suivre soi-même quand LONKOO ne peut pas lancer
 * le workflow (méthode {@code MANUAL}) ; il est absent pour un déploiement lancé par LONKOO.
 */
public record DeploymentResponse(
        UUID id,
        UUID generationId,
        String method,
        String status,
        String publicUrl,
        String runUrl,
        String detail,
        Instant createdAt,
        Instant updatedAt,
        Manual manual) {

    /** Étapes d'un déploiement fait à la main : page du workflow, page des secrets, secrets attendus, commandes. */
    public record Manual(String actionsUrl, String secretsUrl, List<String> secrets, List<String> commands) {
    }

    static DeploymentResponse of(DeploymentRow row, Manual manual) {
        return new DeploymentResponse(row.id(), row.generationId(), row.method(), row.status(), row.publicUrl(), row.runUrl(),
                row.detail(), row.createdAt(), row.updatedAt(), "MANUAL".equals(row.method()) ? manual : null);
    }
}
