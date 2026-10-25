package com.lonkoo.backend.ai;

import tools.jackson.databind.JsonNode;

/**
 * Réponse de {@code /ai/sketch} et {@code /ai/complete} : une proposition à accepter ou non, jamais appliquée par le serveur.
 *
 * @param canvas  instantané proposé, déjà validé contre le contrat du canvas
 * @param summary ce que la proposition apporte
 * @param demo    vrai si la réponse est figée (agent de démonstration) et non celle d'un agent
 */
public record AiProposalResponse(JsonNode canvas, String summary, boolean demo) {
}
