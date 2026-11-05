package com.lonkoo.backend.web;

import java.time.Instant;
import java.util.UUID;

/**
 * Un message de la discussion d'un projet. {@code authorId} et {@code avatarUrl} sont absents quand l'auteur n'existe
 * plus (invité purgé) : le nom affiché à l'envoi reste. {@code mine} est vrai pour la personne qui demande.
 */
public record MessageResponse(
        long id,
        UUID authorId,
        String authorName,
        String avatarUrl,
        String body,
        Instant createdAt,
        boolean mine) {
}
