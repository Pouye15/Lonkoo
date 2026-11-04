package com.lonkoo.backend.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Toutes les erreurs de l'API sortent en {@code application/problem+json}
 * (RFC 9457). Les exceptions de Spring MVC (corps illisible, validation,
 * méthode non permise…) et celles de l'application (sous-classes de
 * {@link org.springframework.web.ErrorResponseException}) sont déjà traduites
 * par {@link ResponseEntityExceptionHandler} ; ce qui reste
 * est une erreur inattendue : 500 sans détail technique, détaillée dans les journaux.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(Exception.class)
    public ProblemDetail unexpected(Exception exception) {
        log.error("Erreur inattendue", exception);
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Erreur interne");
    }
}
