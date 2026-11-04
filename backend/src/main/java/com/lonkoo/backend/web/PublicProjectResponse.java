package com.lonkoo.backend.web;

import java.time.Instant;
import java.util.UUID;

/**
 * Un projet de la galerie publique ({@code GET /api/projects/public}) : ce que montre sa fiche, rien de plus (ni
 * membres, ni identifiant de l'auteur).
 */
public record PublicProjectResponse(
        UUID id,
        String name,
        String description,
        String ownerName,
        String ownerLogin,
        Instant updatedAt) {
}
