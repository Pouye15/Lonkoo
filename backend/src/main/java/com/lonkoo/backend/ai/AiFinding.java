package com.lonkoo.backend.ai;

/**
 * Une remarque de l'audit d'architecture. Consultative : elle ne modifie jamais le canvas.
 *
 * @param id             identifiant de la remarque, stable dans une réponse
 * @param severity       gravité
 * @param category       domaine concerné
 * @param title          titre court
 * @param targetNodeId   bloc visé : un identifiant qui existe dans le canvas audité (sinon la remarque est écartée)
 * @param rationale      pourquoi
 * @param currentConfig  ce qu'on observe aujourd'hui
 * @param proposedConfig ce qu'on propose à la place
 */
public record AiFinding(
        String id,
        Severity severity,
        Category category,
        String title,
        String targetNodeId,
        String rationale,
        String currentConfig,
        String proposedConfig) {

    public enum Severity {
        CRITICAL, RECOMMENDED, OPTIMIZATION
    }

    public enum Category {
        RESILIENCE, STACK, SECURITY, PERFORMANCE
    }
}
