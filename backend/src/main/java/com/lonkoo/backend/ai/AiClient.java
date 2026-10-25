package com.lonkoo.backend.ai;

import java.util.List;

import tools.jackson.databind.JsonNode;

/**
 * Le point de raccordement de l'agent IA : une seule interface, derrière laquelle vit le fournisseur (voir
 * {@code docs/architecture.md}). Le reste du backend ne sait rien du fournisseur.
 *
 * <p><strong>Ce que le serveur fait avant et après l'appel</strong> (voir {@link AiService}) : il contrôle le droit de
 * l'appelant sur le canvas, plafonne la taille du texte saisi, lit l'instantané courant auprès du serveur temps réel, et
 * <strong>valide toute sortie</strong> contre le contrat du canvas avant de la renvoyer comme proposition. Une
 * implémentation n'a donc pas à se défendre contre un accès non autorisé, et ce qu'elle renvoie ne passe jamais en base
 * ni dans le document partagé sans qu'une personne l'ait acceptée.</p>
 *
 * <p><strong>Ce que l'implémentation doit faire</strong> : respecter le délai maximal ({@code AI_TIMEOUT_SECONDS}), lire sa
 * clé dans la configuration du serveur (jamais envoyée au navigateur), ne rien journaliser du contenu, et signaler une
 * panne du fournisseur par {@link AiUnavailableException}. Pour brancher un fournisseur : écrire une classe qui implémente
 * cette interface, l'activer par {@code lonkoo.ai.provider=<nom>} (voir {@link FakeAiClient} pour l'exemple), et ne rien
 * changer d'autre. Le quota par personne et par jour ({@code AI_DAILY_QUOTA}) n'est pas encore posé : il demande une
 * table, dans la plage de migrations réservée à l'IA (V20 à V29).</p>
 */
public interface AiClient {

    /** Une esquisse d'architecture complète, d'après un cahier des charges en texte libre. */
    AiProposal sketch(String brief);

    /**
     * Complète le canvas : {@code snapshot} est l'état courant, {@code nodeIds} les blocs sélectionnés (vide : tout le
     * canvas), {@code instruction} une consigne facultative (peut être vide). Rend le canvas entier, complété.
     */
    AiProposal complete(JsonNode snapshot, List<String> nodeIds, String instruction);

    /** Audit consultatif de {@code snapshot} : des remarques, jamais de modification. */
    List<AiFinding> audit(JsonNode snapshot);

    /**
     * Vrai pour une implémentation de démonstration (réponses figées) : les réponses de l'API le disent
     * ({@code demo: true}), pour que l'interface ne présente jamais une réponse figée comme celle d'un agent.
     */
    default boolean demo() {
        return false;
    }
}
