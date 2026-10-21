package com.lonkoo.backend.security;

import java.util.Optional;

import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

/**
 * Implémentation de {@link GithubSession} adossée à la session HTTP. Le jeton
 * d'accès GitHub vit uniquement dans la session serveur : il est perdu au
 * redémarrage et n'apparaît jamais en base ni dans les journaux.
 */
@Component
@RequestScope
public class SessionGithubSession implements GithubSession {

    /** Clé de l'attribut de session qui porte le jeton d'accès GitHub. */
    static final String GITHUB_TOKEN = "lonkoo.githubToken";

    private final HttpServletRequest request;

    public SessionGithubSession(HttpServletRequest request) {
        this.request = request;
    }

    @Override
    public Optional<String> token() {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return Optional.empty();
        }
        return Optional.ofNullable((String) session.getAttribute(GITHUB_TOKEN));
    }

    @Override
    public void store(String token) {
        request.getSession(true).setAttribute(GITHUB_TOKEN, token);
    }

    @Override
    public void clear() {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.removeAttribute(GITHUB_TOKEN);
        }
    }
}