package com.lonkoo.backend.web;

import java.time.Instant;
import java.util.UUID;

/**
 * Réponse de {@code POST /api/canvases/{id}/share-links}. {@code url} n'est montrée qu'une fois :
 * le serveur ne garde que l'empreinte du jeton ; {@code id} sert ensuite à révoquer le lien.
 */
public record ShareLinkResponse(
        UUID id,
        String url,
        Instant expiresAt) {
}
