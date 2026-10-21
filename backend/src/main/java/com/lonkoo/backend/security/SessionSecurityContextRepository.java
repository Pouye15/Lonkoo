package com.lonkoo.backend.security;

import java.time.Instant;
import java.util.List;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.DeferredSecurityContext;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpRequestResponseHolder;
import org.springframework.security.web.context.SecurityContextRepository;

import com.lonkoo.backend.model.CurrentUser;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

/**
 * Charge l'utilisateur depuis la session applicative et le place dans le
 * contexte Spring Security. Lu par {@code SecurityContextHolderFilter}, qui
 * s'exécute avant l'autorisation des routes.
 */
public class SessionSecurityContextRepository implements SecurityContextRepository {

    /** Clé de l'attribut de session qui porte l'utilisateur connecté. */
    public static final String SESSION_USER = "lonkoo.currentUser";

    @Override
    public SecurityContext loadContext(HttpRequestResponseHolder holder) {
        return load(holder.getRequest());
    }

    @Override
    public DeferredSecurityContext loadDeferredContext(HttpServletRequest request) {
        return new DeferredSecurityContext() {
            @Override
            public SecurityContext get() {
                return load(request);
            }

            @Override
            public boolean isGenerated() {
                return false;
            }
        };
    }

    /**
     * Ouvre une session neuve pour {@code user}. L'ancienne session est
     * invalidée : un identifiant de session connu avant la connexion ne doit
     * pas rester valable après (fixation de session).
     */
    public static void login(HttpServletRequest request, CurrentUser user) {
        HttpSession previous = request.getSession(false);
        if (previous != null) {
            previous.invalidate();
        }
        request.getSession(true).setAttribute(SESSION_USER, user);
    }

    private SecurityContext load(HttpServletRequest request) {
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        HttpSession session = request.getSession(false);
        Object attr = session == null ? null : session.getAttribute(SESSION_USER);
        if (attr instanceof CurrentUser user) {
            if (isExpired(user)) {
                // L'invité a dépassé sa durée de vie (la purge planifiée supprimera sa ligne) :
                // la session ne vaut plus rien.
                session.invalidate();
                return context;
            }
            var authorities = List.of(new SimpleGrantedAuthority("ROLE_USER"));
            context.setAuthentication(new UsernamePasswordAuthenticationToken(user, null, authorities));
        }
        return context;
    }

    private static boolean isExpired(CurrentUser user) {
        return user.isGuest() && user.expiresAt() != null && !user.expiresAt().isAfter(Instant.now());
    }

    @Override
    public void saveContext(SecurityContext context, HttpServletRequest request, HttpServletResponse response) {
        // L'écriture de la session est réalisée par AuthController.
        // Rien à faire ici.
    }

    @Override
    public boolean containsContext(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        return session != null
                && session.getAttribute(SESSION_USER) instanceof CurrentUser user
                && !isExpired(user);
    }
}