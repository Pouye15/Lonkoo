package com.lonkoo.backend.github;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.model.GithubUser;
import com.lonkoo.backend.security.GithubSession;
import com.lonkoo.backend.security.SessionSecurityContextRepository;
import com.lonkoo.backend.support.AuditService;
import com.lonkoo.backend.web.GithubAuthException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

/**
 * Flux OAuth GitHub côté serveur (WP4b) : redirection vers GitHub, vérification du {@code state},
 * échange du code, lecture du profil, compte local, ouverture de session et conservation du jeton en
 * session uniquement. Aucun jeton n'est journalisé ni persisté. Les appels à GitHub se font hors de
 * toute transaction ; la base n'est touchée que par {@link GithubAccountService}.
 */
@Service
public class GithubOAuthService {

    private static final String STATE_ATTRIBUTE = "lonkoo.githubState";

    private final GithubApiClient githubApiClient;
    private final GithubAccountService accountService;
    private final AuditService auditService;
    private final String clientId;
    private final String redirectUri;
    private final String authorizeEndpoint;
    private final boolean configured;
    private final SecureRandom secureRandom = new SecureRandom();

    public GithubOAuthService(
            GithubApiClient githubApiClient,
            GithubAccountService accountService,
            AuditService auditService,
            @Value("${github.oauth.client-id}") String clientId,
            @Value("${github.oauth.client-secret}") String clientSecret,
            @Value("${github.oauth.redirect-uri}") String redirectUri,
            @Value("${github.oauth.authorize-url:https://github.com/login/oauth/authorize}") String authorizeEndpoint) {
        this.githubApiClient = githubApiClient;
        this.accountService = accountService;
        this.auditService = auditService;
        this.clientId = clientId;
        this.redirectUri = redirectUri;
        this.authorizeEndpoint = authorizeEndpoint;
        this.configured = isReal(clientId) && isReal(clientSecret);
    }

    /** 503 tant que l'application OAuth n'est pas configurée (valeurs absentes ou d'exemple). */
    public void requireConfigured() {
        if (!configured) {
            throw new GithubAuthException(HttpStatus.SERVICE_UNAVAILABLE,
                    "La connexion GitHub n'est pas configurée sur ce serveur");
        }
    }

    /** Adresse GitHub vers laquelle rediriger (le {@code state} est stocké en session). */
    public String authorizeUrl(HttpServletRequest request) {
        byte[] stateBytes = new byte[32];
        secureRandom.nextBytes(stateBytes);
        String state = Base64.getUrlEncoder().withoutPadding().encodeToString(stateBytes);
        request.getSession(true).setAttribute(STATE_ATTRIBUTE, state);

        return authorizeEndpoint
                + "?client_id=" + encode(clientId)
                + "&redirect_uri=" + encode(redirectUri)
                + "&scope=" + encode("read:user public_repo")
                + "&state=" + state;
    }

    /** Abandonne un flux en cours (refus de l'utilisateur) : le {@code state} ne doit pas rester valable. */
    public void forgetState(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.removeAttribute(STATE_ATTRIBUTE);
        }
    }

    /** Vérifie le {@code state} stocké en session (à usage unique, comparaison à temps constant). */
    public void verifyState(HttpServletRequest request, String state) {
        HttpSession session = request.getSession(false);
        String expected = session == null ? null : (String) session.getAttribute(STATE_ATTRIBUTE);
        if (expected == null || state == null
                || !MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), state.getBytes(StandardCharsets.UTF_8))) {
            throw new GithubAuthException(HttpStatus.BAD_REQUEST, "État de connexion invalide");
        }
        // Usage unique : l'état ne doit pas être rejoué.
        session.removeAttribute(STATE_ATTRIBUTE);
    }

    /** Réalise la fin du flux : échange, profil, compte local, session neuve, jeton en session. */
    public CurrentUser complete(HttpServletRequest request, String code, GithubSession githubSession) {
        // L'utilisateur de la session (un invité à rattacher) est lu avant que login() n'invalide la session.
        Optional<UUID> sessionUserId = currentUserId(request);

        String accessToken = githubApiClient.exchangeCode(code);
        GithubUser githubUser = githubApiClient.fetchUser(accessToken);
        CurrentUser user = accountService.signIn(githubUser, sessionUserId);

        // Session neuve (anti-fixation), puis jeton dans cette session seulement.
        SessionSecurityContextRepository.login(request, user);
        githubSession.store(accessToken);

        auditService.record(user.id(), "login.github", "user:" + user.id(), null);
        return user;
    }

    private Optional<UUID> currentUserId(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return Optional.empty();
        }
        Object attr = session.getAttribute(SessionSecurityContextRepository.SESSION_USER);
        return attr instanceof CurrentUser user ? Optional.of(user.id()) : Optional.empty();
    }

    private static boolean isReal(String value) {
        return value != null && !value.isBlank() && !value.toLowerCase(Locale.ROOT).contains("change-me");
    }

    private static String encode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
