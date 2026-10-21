package com.lonkoo.backend.model;

/**
 * Profil GitHub retourné par {@code GET https://api.github.com/user}.
 * Le jeton d'accès n'est volontairement PAS porté par ce record : il reste
 * en session serveur, jamais en base ni dans le modèle.
 */
public record GithubUser(
        long id,
        String login,
        String displayName,
        String avatarUrl) {
}