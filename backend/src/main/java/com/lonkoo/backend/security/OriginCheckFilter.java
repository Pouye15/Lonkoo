package com.lonkoo.backend.security;

import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(OriginCheckFilter.class);

    private final URI publicUrl;
    /** L'adresse publique, puis les origines supplémentaires autorisées (développement derrière un relais, voir plus bas). */
    private final List<URI> allowed = new ArrayList<>();

    public OriginCheckFilter(String publicUrl) {
        this(publicUrl, List.of());
    }

    /**
     * @param extraOrigins origines autorisées en plus de l'adresse publique, de la forme « schéma://hôte[:port] ». Réservé
     *                     au développement : dans un Codespace GitHub, le relais du port réécrit l'en-tête {@code Origin}
     *                     en {@code https://localhost:3000}, que le contrôle prendrait sinon pour un autre site.
     */
    public OriginCheckFilter(String publicUrl, List<String> extraOrigins) {
        this.publicUrl = URI.create(publicUrl);
        allowed.add(this.publicUrl);
        for (String extra : extraOrigins) {
            if (extra == null || extra.isBlank()) {
                continue;
            }
            URI uri = URI.create(extra.strip());
            if (uri.getScheme() == null || uri.getHost() == null) {
                throw new IllegalArgumentException("Origine supplémentaire invalide (schéma://hôte[:port] attendu) : " + extra);
            }
            allowed.add(uri);
        }
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
                // Les origines ne sont pas secrètes : le journal dit laquelle a été refusée, ce qui évite de deviner (un
                // relais qui réécrit l'en-tête, une adresse différente de celle configurée…).
                log.warn("Origine refusée : « {} » (attendue : « {} ») pour {} {}", origin, publicUrl, request.getMethod(),
                        request.getRequestURI());
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
            for (URI candidate : allowed) {
                if (uri.getScheme().equals(candidate.getScheme())
                        && uri.getHost().equals(candidate.getHost())
                        && effectivePort(uri) == effectivePort(candidate)) {
                    return true;
                }
            }
            return false;
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