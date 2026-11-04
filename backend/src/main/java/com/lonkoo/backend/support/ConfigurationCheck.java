package com.lonkoo.backend.support;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

/**
 * Contrôle de la configuration au démarrage. En profil {@code prod}, une valeur d'exemple
 * ({@code change-me}), un secret trop court, un mot de passe de base vide ou une adresse publique qui
 * n'est pas en {@code https} empêchent le démarrage ; ailleurs, les valeurs d'exemple sont seulement
 * signalées dans les journaux. Les messages nomment les variables, jamais leurs valeurs.
 */
@Component
public class ConfigurationCheck {

    private static final Logger log = LoggerFactory.getLogger(ConfigurationCheck.class);
    private static final int MIN_SERVICE_TOKEN_LENGTH = 16;

    private final boolean production;
    private final String databasePassword;
    private final String ticketSecret;
    private final String serviceToken;
    private final String publicUrl;
    private final String githubClientId;
    private final String githubClientSecret;
    private final String githubRedirectUri;

    @Autowired
    public ConfigurationCheck(
            Environment environment,
            @Value("${spring.datasource.password:}") String databasePassword,
            @Value("${realtime.ticket-secret}") String ticketSecret,
            @Value("${realtime.service-token}") String serviceToken,
            @Value("${app.public-url}") String publicUrl,
            @Value("${github.oauth.client-id}") String githubClientId,
            @Value("${github.oauth.client-secret}") String githubClientSecret,
            @Value("${github.oauth.redirect-uri}") String githubRedirectUri) {
        this(environment.acceptsProfiles(Profiles.of("prod")), databasePassword, ticketSecret, serviceToken, publicUrl,
                githubClientId, githubClientSecret, githubRedirectUri);
    }

    /** Constructeur de test : des valeurs GitHub neutres empêchent les contrôles OAuth d'interférer. */
    public ConfigurationCheck(boolean production, String databasePassword, String ticketSecret, String serviceToken,
            String publicUrl) {
        this(production, databasePassword, ticketSecret, serviceToken, publicUrl,
                "test-client-id", "test-client-secret", "https://lonkoo.example.org/api/auth/github/callback");
    }

    public ConfigurationCheck(boolean production, String databasePassword, String ticketSecret, String serviceToken,
            String publicUrl, String githubClientId, String githubClientSecret, String githubRedirectUri) {
        this.production = production;
        this.databasePassword = databasePassword;
        this.ticketSecret = ticketSecret;
        this.serviceToken = serviceToken;
        this.publicUrl = publicUrl;
        this.githubClientId = githubClientId;
        this.githubClientSecret = githubClientSecret;
        this.githubRedirectUri = githubRedirectUri;
    }

    @PostConstruct
    public void check() {
        List<String> problems = problems();
        if (problems.isEmpty()) {
            return;
        }
        if (production) {
            throw new IllegalStateException("Configuration de production refusée : " + String.join(" ; ", problems));
        }
        log.warn("Configuration à corriger avant la production : {}", String.join(" ; ", problems));
    }

    /** Problèmes relevés, sans aucune valeur secrète dans les messages. */
    public List<String> problems() {
        List<String> problems = new ArrayList<>();

        if (isPlaceholder(databasePassword)) {
            problems.add("POSTGRES_PASSWORD porte une valeur d'exemple");
        }
        if (isPlaceholder(ticketSecret)) {
            problems.add("REALTIME_TICKET_SECRET porte une valeur d'exemple");
        }
        if (isPlaceholder(serviceToken)) {
            problems.add("REALTIME_SERVICE_TOKEN porte une valeur d'exemple");
        }
        if (ticketSecret != null && ticketSecret.equals(serviceToken)) {
            problems.add("REALTIME_TICKET_SECRET et REALTIME_SERVICE_TOKEN doivent être différents");
        }

        if (production) {
            if (databasePassword == null || databasePassword.isBlank()) {
                problems.add("POSTGRES_PASSWORD est vide");
            }
            if (serviceToken != null && serviceToken.length() < MIN_SERVICE_TOKEN_LENGTH) {
                problems.add("REALTIME_SERVICE_TOKEN doit faire au moins " + MIN_SERVICE_TOKEN_LENGTH + " caractères");
            }
            if (publicUrl == null || !publicUrl.startsWith("https://")) {
                problems.add("APP_PUBLIC_URL doit commencer par https:// en production");
            } else if (publicUrl.contains("localhost") || publicUrl.contains("127.0.0.1")) {
                problems.add("APP_PUBLIC_URL ne doit pas désigner la machine locale en production");
            }
            if (isPlaceholder(githubClientId)) {
                problems.add("GITHUB_OAUTH_CLIENT_ID porte une valeur d'exemple");
            }
            if (isPlaceholder(githubClientSecret)) {
                problems.add("GITHUB_OAUTH_CLIENT_SECRET porte une valeur d'exemple");
            }
            if (isPlaceholder(githubRedirectUri) || (githubRedirectUri != null && !githubRedirectUri.startsWith("https://"))) {
                problems.add("GITHUB_OAUTH_REDIRECT_URI doit être une adresse https et sans valeur d'exemple");
            }
        }
        return problems;
    }

    private static boolean isPlaceholder(String value) {
        if (value == null) {
            return false;
        }
        String lower = value.toLowerCase(Locale.ROOT);
        return lower.contains("change-me") || lower.contains("changeme") || lower.contains("change_me");
    }
}
