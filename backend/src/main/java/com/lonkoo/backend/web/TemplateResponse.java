package com.lonkoo.backend.web;

/**
 * Un modèle de départ, tel que le liste {@code GET /api/templates} : de quoi le présenter, pas son contenu
 * (le serveur le copie lui-même dans le canvas à la création du projet).
 */
public record TemplateResponse(String id, String name, String description, int blocks, int links) {
}
