package com.lonkoo.backend.web;

import java.time.Duration;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * Limite d'usage atteinte (429, {@code application/problem+json}), avec {@code Retry-After} quand on sait dire
 * dans combien de temps une place se libère.
 */
public class TooManyRequestsException extends ErrorResponseException {

    public TooManyRequestsException(String message) {
        super(HttpStatus.TOO_MANY_REQUESTS, ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, message), null);
    }

    public TooManyRequestsException(String message, Duration retryAfter) {
        this(message);
        getHeaders().set("Retry-After", String.valueOf(Math.max(1, retryAfter.toSeconds())));
    }
}
