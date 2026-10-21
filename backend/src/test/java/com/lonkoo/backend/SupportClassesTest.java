package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

import com.lonkoo.backend.support.GuestRateLimiter;
import com.lonkoo.backend.web.ApiExceptionHandler;

/**
 * Limiteur d'invités et traduction des erreurs inattendues, sans contexte Spring.
 */
class SupportClassesTest {

    @Test
    void rateLimiterAllowsTheConfiguredCountPerAddress() {
        GuestRateLimiter limiter = new GuestRateLimiter(2);

        assertThat(limiter.allow("a")).isTrue();
        assertThat(limiter.allow("a")).isTrue();
        assertThat(limiter.allow("a")).isFalse();
        assertThat(limiter.allow("b")).isTrue();
    }

    @Test
    void rateLimiterForgetsIdleAddresses() {
        GuestRateLimiter limiter = new GuestRateLimiter(5);
        limiter.allow("a");
        limiter.allow("b");
        assertThat(limiter.trackedAddresses()).isEqualTo(2);

        limiter.purgeIdle(Instant.now().plus(Duration.ofMinutes(30)));
        assertThat(limiter.trackedAddresses()).isEqualTo(2);

        limiter.purgeIdle(Instant.now().plus(Duration.ofHours(2)));
        assertThat(limiter.trackedAddresses()).isZero();
    }

    @Test
    void unexpectedErrorsAreIntern500WithoutTechnicalDetail() {
        ProblemDetail problem = new ApiExceptionHandler()
                .unexpected(new IllegalStateException("mot de passe de la base : hunter2"));

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR.value());
        assertThat(problem.getDetail()).isEqualTo("Erreur interne").doesNotContain("hunter2");
    }
}
