package com.lonkoo.backend.security;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;

/**
 * Sécurité web : CSRF désactivé (remplacé par Origin + SameSite=Lax).
 * L'utilisateur est chargé depuis la session applicative par le
 * {@link SessionSecurityContextRepository}, consulté par
 * {@code SecurityContextHolderFilter} avant l'autorisation.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            @Value("${app.public-url}") String publicUrl,
            @Value("${app.extra-allowed-origins:}") List<String> extraOrigins,
            Environment environment) throws Exception {

        refuseExtraOriginsInProduction(extraOrigins, environment.acceptsProfiles(Profiles.of("prod")));

        http
                .securityMatcher("/api/**", "/internal/**")
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.NEVER))
                .securityContext(security -> security
                        .securityContextRepository(new SessionSecurityContextRepository()))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/actuator/health", "/api/auth/**", "/api/join/**", "/internal/**").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, authException) ->
                                ProblemResponses.write(response, HttpStatus.UNAUTHORIZED, "Non authentifié"))
                        .accessDeniedHandler((request, response, deniedException) ->
                                ProblemResponses.write(response, HttpStatus.FORBIDDEN, "Accès refusé")))
                .addFilterBefore(new OriginCheckFilter(publicUrl, extraOrigins), AuthorizationFilter.class);

        return http.build();
    }

    /** Une origine supplémentaire affaiblit le contrôle contre les requêtes intersites : jamais en production. */
    public static void refuseExtraOriginsInProduction(List<String> extraOrigins, boolean production) {
        if (production && extraOrigins.stream().anyMatch(origin -> origin != null && !origin.isBlank())) {
            throw new IllegalStateException(
                    "Configuration de production refusée : EXTRA_ALLOWED_ORIGINS est réservé au développement");
        }
    }
}
