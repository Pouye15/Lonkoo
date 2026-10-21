package com.lonkoo.backend.github;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Construit le client GitHub à partir de la configuration. Les URL de jeton et de profil sont par
 * défaut celles de GitHub ; elles peuvent être remplacées en test par un faux serveur local.
 */
@Configuration
public class GithubConfig {

    @Bean
    GithubApiClient githubApiClient(
            @Value("${github.oauth.client-id}") String clientId,
            @Value("${github.oauth.client-secret}") String clientSecret,
            @Value("${github.oauth.redirect-uri}") String redirectUri,
            @Value("${github.oauth.token-url:https://github.com/login/oauth/access_token}") String tokenUrl,
            @Value("${github.oauth.user-url:https://api.github.com/user}") String userUrl,
            @Value("${github.oauth.request-timeout-seconds:10}") int requestTimeoutSeconds) {
        return new GithubApiClient(clientId, clientSecret, redirectUri, tokenUrl, userUrl,
                Duration.ofSeconds(requestTimeoutSeconds));
    }

    /** Envoi d'un projet sur GitHub (création du dépôt, commit). Adresse configurable pour les tests. */
    @Bean
    GithubRepoClient githubRepoClient(
            @Value("${github.api.base-url:https://api.github.com}") String baseUrl,
            @Value("${github.api.request-timeout-seconds:20}") int requestTimeoutSeconds,
            @Value("${github.api.retry-delay-millis:700}") long retryDelayMillis) {
        return new GithubRepoClient(baseUrl, Duration.ofSeconds(requestTimeoutSeconds), Duration.ofMillis(retryDelayMillis));
    }
}
