package com.lonkoo.backend.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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
            @Value("${app.public-url}") String publicUrl) throws Exception {

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
                .addFilterBefore(new OriginCheckFilter(publicUrl), AuthorizationFilter.class);

        return http.build();
    }
}