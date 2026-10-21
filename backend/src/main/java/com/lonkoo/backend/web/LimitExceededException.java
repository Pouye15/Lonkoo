package com.lonkoo.backend.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * Plafond d'usage atteint (409, {@code application/problem+json} intitulé « Limite atteinte »). Ce n'est
 * pas un 429 : réessayer plus tard ne change rien, il faut libérer de la place ou se connecter.
 */
public class LimitExceededException extends ErrorResponseException {

    public LimitExceededException(String message) {
        super(HttpStatus.CONFLICT, problem(message), null);
    }

    private static ProblemDetail problem(String message) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, message);
        problem.setTitle("Limite atteinte");
        return problem;
    }
}
