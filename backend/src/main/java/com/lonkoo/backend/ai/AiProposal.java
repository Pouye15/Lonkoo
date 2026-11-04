package com.lonkoo.backend.ai;

import tools.jackson.databind.JsonNode;

/**
 * Ce qu'un {@link AiClient} propose pour un canvas : un instantané complet que la personne accepte ou non. Le serveur le
 * valide contre le contrat du canvas avant de le renvoyer, et ne l'écrit jamais lui-même.
 *
 * @param canvas  instantané proposé (même forme que {@code GET /canvases/{id}/snapshot})
 * @param summary ce que la proposition change ou apporte, en une ou deux phrases
 */
public record AiProposal(JsonNode canvas, String summary) {
}
