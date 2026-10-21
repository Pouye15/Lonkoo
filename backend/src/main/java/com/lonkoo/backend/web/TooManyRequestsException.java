package com.lonkoo.backend.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * Limite d'usage atteinte (429, {@code application/problem+json}).
 */
public class TooManyRequestsException extends ErrorResponseException {

    public TooManyRequestsException(String message) {
        super(HttpStatus.TOO_MANY_REQUESTS, ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, message), null);
    }
}
