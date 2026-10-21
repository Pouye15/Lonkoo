package com.lonkoo.backend.github;

import java.net.URI;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.lonkoo.backend.security.GithubSession;
import com.lonkoo.backend.web.GithubAuthException;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Connexion GitHub (WP4b) :
 * <ul>
 *   <li>{@code GET /api/auth/github/login} : redirige vers GitHub avec le {@code state}.</li>
 *   <li>{@code GET /api/auth/github/callback} : vérifie le {@code state}, échange le code, lit le
 *       profil, ouvre une session neuve et redirige vers le tableau de bord.</li>
 * </ul>
 * Si l'utilisateur refuse l'autorisation, le navigateur est renvoyé vers la page de connexion
 * (adresse fixe, {@code ?error=github}) sans session. Toutes les redirections vont vers des adresses
 * construites à partir de {@code APP_PUBLIC_URL} : aucune ne dépend d'un paramètre de la requête.
 * Tant que l'application OAuth n'est pas configurée, les deux routes répondent 503.
 */
@RestController
@RequestMapping("/api/auth/github")
public class GithubController {

    private final GithubOAuthService githubOAuthService;
    private final GithubSession githubSession;
    private final String publicUrl;

    public GithubController(
            GithubOAuthService githubOAuthService,
            GithubSession githubSession,
            @Value("${app.public-url}") String publicUrl) {
        this.githubOAuthService = githubOAuthService;
        this.githubSession = githubSession;
        this.publicUrl = publicUrl.endsWith("/") ? publicUrl.substring(0, publicUrl.length() - 1) : publicUrl;
    }

    @GetMapping("/login")
    ResponseEntity<Void> login(HttpServletRequest request) {
        githubOAuthService.requireConfigured();
        return redirect(githubOAuthService.authorizeUrl(request));
    }

    @GetMapping("/callback")
    ResponseEntity<Void> callback(
            HttpServletRequest request,
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error) {
        githubOAuthService.requireConfigured();

        if (error != null) {
            // Refus d'autorisation : le flux est abandonné, aucune session n'est ouverte.
            githubOAuthService.forgetState(request);
            return redirect(publicUrl + "/login?error=github");
        }
        if (code == null || code.isBlank()) {
            throw new GithubAuthException(HttpStatus.BAD_REQUEST, "Code de connexion manquant");
        }

        githubOAuthService.verifyState(request, state);
        githubOAuthService.complete(request, code, githubSession);
        return redirect(publicUrl + "/dashboard");
    }

    private static ResponseEntity<Void> redirect(String location) {
        return ResponseEntity.status(HttpStatus.FOUND).header(HttpHeaders.LOCATION, URI.create(location).toString()).build();
    }
}
