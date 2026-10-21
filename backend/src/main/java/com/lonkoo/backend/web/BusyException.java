package com.lonkoo.backend.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** Le serveur ne peut pas prendre la tâche pour l'instant (503, {@code application/problem+json}) : réessayer plus tard. */
public class BusyException extends ErrorResponseException {

    public BusyException(String message) {
        super(HttpStatus.SERVICE_UNAVAILABLE, problem(message), null);
    }

    private static ProblemDetail problem(String message) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, message);
        problem.setTitle("Serveur occupé");
        return problem;
    }
}
