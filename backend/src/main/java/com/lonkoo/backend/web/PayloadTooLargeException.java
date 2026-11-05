package com.lonkoo.backend.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * Contenu trop volumineux (413, {@code application/problem+json} intitulé « Contenu trop volumineux »). Réessayer à
 * l'identique ne change rien : il faut envoyer moins.
 */
public class PayloadTooLargeException extends ErrorResponseException {

    public PayloadTooLargeException(String message) {
        super(HttpStatus.CONTENT_TOO_LARGE, problem(message), null);
    }

    private static ProblemDetail problem(String message) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONTENT_TOO_LARGE, message);
        problem.setTitle("Contenu trop volumineux");
        return problem;
    }
}
