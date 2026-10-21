package com.lonkoo.backend.security;

import java.util.Optional;

/**
 * Jeton d'accès GitHub de l'utilisateur connecté, conservé uniquement dans la
 * session serveur (jamais en base, jamais dans les journaux). Exposé ainsi
 * pour que le lot de génération (R8) y accède sans connaître la session HTTP.
 */
public interface GithubSession {

    /** Jeton d'accès, présent seulement si l'utilisateur s'est connecté via GitHub. */
    Optional<String> token();

    /** Enregistre le jeton dans la session courante. */
    void store(String token);

    /** Efface le jeton (déconnexion). */
    void clear();
}