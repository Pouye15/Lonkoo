package com.lonkoo.backend.security;

import java.io.IOException;
import java.net.URI;

import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Protection contre les requêtes intersites : pour POST, PUT, PATCH et DELETE,
 * refuse si l'en-tête Origin (ou à défaut Referer) ne correspond pas à
 * l'origine publique. Les requêtes sans Origin (curl, tests) restent
 * acceptées : la protection ne porte que sur les navigateurs.
 *
 * <p>Enregistrée dans la chaîne de sécurité par {@link SecurityConfig}.</p>
 */
public class OriginCheckFilter extends OncePerRequestFilter {

    private final URI publicUrl;

    public OriginCheckFilter(String publicUrl) {
        this.publicUrl = URI.create(publicUrl);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        if (needsOriginCheck(request.getMethod())) {
            String origin = request.getHeader("Origin");
            if (origin == null) {
                origin = request.getHeader("Referer");
            }
            if (origin != null && !isAllowed(origin)) {
                ProblemResponses.write(response, HttpStatus.FORBIDDEN, "Origine non autorisée");
                return;
            }
        }
        filterChain.doFilter(request, response);
    }

    private boolean needsOriginCheck(String method) {
        return switch (method) {
            case "POST", "PUT", "PATCH", "DELETE" -> true;
            default -> false;
        };
    }

    private boolean isAllowed(String headerValue) {
        try {
            var uri = URI.create(headerValue);
            if (uri.getScheme() == null || uri.getHost() == null) {
                return false;
            }
            // Le navigateur envoie "schéma://hôte[:port]" dans Origin : on compare
            // ces trois composants, pas le chemin.
            return uri.getScheme().equals(publicUrl.getScheme())
                    && uri.getHost().equals(publicUrl.getHost())
                    && effectivePort(uri) == effectivePort(publicUrl);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private int effectivePort(URI uri) {
        int port = uri.getPort();
        if (port != -1) {
            return port;
        }
        return "https".equals(uri.getScheme()) ? 443 : 80;
    }
}