package com.lonkoo.backend.github;

/**
 * Échec d'un appel à l'API GitHub pendant l'envoi d'un projet ou le suivi d'un déploiement. Le message est en
 * français, destiné à l'utilisateur : il ne contient jamais de jeton, d'en-tête ni de corps de réponse brut.
 */
public class GithubPushException extends RuntimeException {

    /** Ce qui s'est passé, pour que l'appelant décide quoi faire (réessayer sans le workflow, réutiliser le dépôt…). */
    public enum Kind {
        /** Un dépôt de ce nom existe déjà sur le compte. */
        NAME_TAKEN,
        /** GitHub ne reconnaît plus le jeton (révoqué ou expiré). */
        TOKEN_REJECTED,
        /** L'autorisation accordée ne permet pas l'action, ou GitHub n'a pas trouvé la ressource. */
        NOT_ALLOWED,
        /** Un fichier de workflow demande l'autorisation « workflow », que le jeton n'a pas. */
        WORKFLOW_SCOPE,
        /** Limite de débit de GitHub atteinte. */
        RATE_LIMITED,
        /** GitHub injoignable, trop lent ou en incident. */
        UNAVAILABLE,
        /** Toute autre réponse inattendue. */
        OTHER
    }

    private final Kind kind;

    public GithubPushException(Kind kind, String message) {
        super(message);
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }
}
