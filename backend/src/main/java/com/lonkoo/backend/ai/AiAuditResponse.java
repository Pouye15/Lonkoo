package com.lonkoo.backend.ai;

import java.util.List;

/**
 * Réponse de {@code /ai/audit} : des remarques consultatives.
 *
 * @param findings  remarques dont le bloc visé existe dans le canvas
 * @param discarded nombre de remarques écartées parce qu'elles visaient un bloc absent du canvas
 * @param demo      vrai si la réponse est figée (agent de démonstration) et non celle d'un agent
 */
public record AiAuditResponse(List<AiFinding> findings, int discarded, boolean demo) {
}
