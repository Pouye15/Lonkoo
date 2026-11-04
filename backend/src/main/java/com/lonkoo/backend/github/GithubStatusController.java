package com.lonkoo.backend.github;

import java.util.List;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lonkoo.backend.github.GithubPushException.Kind;
import com.lonkoo.backend.security.GithubSession;
import com.lonkoo.backend.web.GithubAuthException;

/**
 * {@code GET /api/github/status} : la connexion GitHub de la session et ce qu'elle permet, pour que l'interface propose
 * le bon bouton (se connecter, autoriser le déploiement) au lieu de laisser l'utilisateur butter sur une erreur.
 * L'appel à GitHub utilise le jeton de la session ; il n'est ni renvoyé ni conservé.
 */
@RestController
@RequestMapping("/api/github")
class GithubStatusController {

    /**
     * @param connected  la session porte un jeton GitHub reconnu
     * @param expired    la session portait un jeton, que GitHub ne reconnaît plus (révoqué ou expiré)
     * @param login      compte GitHub, si connecté
     * @param scopes     autorisations annoncées par GitHub (vide si GitHub n'en annonce pas)
     * @param canPublish peut envoyer un projet dans un dépôt public ({@code null} : autorisations non annoncées)
     * @param canPrivate peut créer un dépôt privé
     * @param canDeploy  peut lancer le workflow de déploiement depuis LONKOO
     */
    record Status(boolean connected, boolean expired, String login, List<String> scopes, Boolean canPublish, Boolean canPrivate,
            Boolean canDeploy) {
    }

    private final GithubSession githubSession;
    private final GithubRepoClient github;

    GithubStatusController(GithubSession githubSession, GithubRepoClient github) {
        this.githubSession = githubSession;
        this.github = github;
    }

    @GetMapping("/status")
    Status status() {
        Optional<String> token = githubSession.token();
        if (token.isEmpty()) {
            return new Status(false, false, null, List.of(), null, null, null);
        }
        try {
            GithubRepoClient.Account account = github.account(token.get());
            List<String> scopes = List.copyOf(account.scopes());
            if (!account.scopesKnown()) {
                return new Status(true, false, account.login(), scopes, null, null, null);
            }
            boolean repo = account.has("repo");
            return new Status(true, false, account.login(), scopes, repo || account.has("public_repo"), repo,
                    repo && account.has("workflow"));
        } catch (GithubPushException e) {
            if (e.kind() == Kind.TOKEN_REJECTED) {
                return new Status(false, true, null, List.of(), null, null, null);
            }
            throw new GithubAuthException(e.kind() == Kind.UNAVAILABLE ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY,
                    e.getMessage());
        }
    }
}
