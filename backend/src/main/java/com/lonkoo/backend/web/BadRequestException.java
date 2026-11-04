package com.lonkoo.backend.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * Requête mal formée ou valeur refusée (400, {@code application/problem+json}).
 */
public class BadRequestException extends ErrorResponseException {

    public BadRequestException(String message) {
        super(HttpStatus.BAD_REQUEST, ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, message), null);
    }
}
