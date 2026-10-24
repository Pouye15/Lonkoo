package com.lonkoo.backend.web;

import java.time.Instant;
import java.util.UUID;

/**
 * Un membre d'un projet, tel que le liste {@code GET /api/projects/{id}/members}.
 * {@code you} est vrai pour la personne qui demande ; {@code removable} dit si elle peut retirer ce membre
 * (ou, pour elle-même, quitter le projet), pour que l'interface n'affiche que des boutons qui marchent.
 */
public record MemberResponse(
        UUID userId,
        String displayName,
        String login,
        String avatarUrl,
        boolean guest,
        String role,
        Instant joinedAt,
        boolean you,
        boolean removable) {
}
