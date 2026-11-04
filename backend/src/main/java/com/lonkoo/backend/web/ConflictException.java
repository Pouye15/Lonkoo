package com.lonkoo.backend.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** L'état actuel de la ressource ne permet pas l'action (409, {@code application/problem+json} intitulé « Conflit »). */
public class ConflictException extends ErrorResponseException {

    public ConflictException(String message) {
        super(HttpStatus.CONFLICT, problem(message), null);
    }

    private static ProblemDetail problem(String message) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, message);
        problem.setTitle("Conflit");
        return problem;
    }
}
