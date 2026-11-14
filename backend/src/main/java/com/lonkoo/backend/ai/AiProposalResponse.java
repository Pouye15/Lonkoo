package com.lonkoo.backend.ai;

import java.util.List;

import tools.jackson.databind.JsonNode;

/**
 * Réponse de {@code /ai/sketch} et {@code /ai/complete} : une proposition à accepter ou non, jamais appliquée par le serveur.
 *
 * @param canvas   instantané proposé, déjà validé contre le contrat du canvas
 * @param summary  ce que la proposition apporte
 * @param warnings ce qu'il faut regarder avant d'accepter (des blocs du canvas qui ont disparu de la proposition, par
 *                 exemple), en français. <strong>Toujours présente</strong>, vide quand il n'y a rien à signaler : une
 *                 suppression est signalée, jamais refusée ni corrigée en silence
 * @param demo     vrai si la réponse est figée (agent de démonstration) et non celle d'un agent
 */
public record AiProposalResponse(JsonNode canvas, String summary, List<String> warnings, boolean demo) {
}
