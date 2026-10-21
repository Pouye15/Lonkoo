package com.lonkoo.backend.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * Accès refusé (authentifié mais rôle insuffisant), 403 en {@code application/problem+json}.
 */
public class ForbiddenException extends ErrorResponseException {

    public ForbiddenException(String message) {
        super(HttpStatus.FORBIDDEN, ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, message), null);
    }
}
