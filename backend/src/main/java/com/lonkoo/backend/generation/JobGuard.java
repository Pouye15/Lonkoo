package com.lonkoo.backend.generation;

import org.slf4j.Logger;

/**
 * Garde-fou des travaux en arrière-plan : une erreur grave (mémoire épuisée, pile débordée…) n'est pas une
 * {@link RuntimeException}, et laissée telle quelle elle abandonnerait la ligne en base à « en cours » : plus aucune
 * génération, envoi ou déploiement ne serait accepté sur ce canvas avant un redémarrage.
 */
final class JobGuard {

    private JobGuard() {
    }

    /**
     * Marque l'échec sans jamais lever : on est déjà dans un cas d'erreur grave, et une panne de la base à cet instant
     * ne doit pas masquer l'erreur d'origine (le nettoyage périodique rattrapera la ligne).
     */
    static void markFailedQuietly(Logger log, String what, Runnable markFailed) {
        try {
            markFailed.run();
        } catch (Throwable failure) {
            log.error("Impossible de marquer {} comme échoué après une erreur grave", what, failure);
        }
    }
}
