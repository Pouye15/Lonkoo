package com.lonkoo.backend.security;

import java.util.Optional;

import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

/**
 * Implémentation de {@link GithubSession} : le jeton d'accès GitHub est rangé dans {@link GithubTokenStore}, sous
 * l'identifiant de la session HTTP. Il n'est jamais un attribut de la session : les sessions sont en base, et le
 * jeton n'y apparaît donc jamais (ni dans les journaux). Il est perdu au redémarrage.
 */
@Component
@RequestScope
public class SessionGithubSession implements GithubSession {

    private final HttpServletRequest request;
    private final GithubTokenStore store;

    public SessionGithubSession(HttpServletRequest request, GithubTokenStore store) {
        this.request = request;
        this.store = store;
    }

    @Override
    public Optional<String> token() {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return Optional.empty();
        }
        return store.get(session.getId());
    }

    @Override
    public void store(String token) {
        store.put(request.getSession(true).getId(), token);
    }

    @Override
    public void clear() {
        HttpSession session = request.getSession(false);
        if (session != null) {
            store.remove(session.getId());
        }
    }
}
