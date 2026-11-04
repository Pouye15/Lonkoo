package com.lonkoo.backend.canvas;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * Instantané de canvas invalide (schéma ou règles métier) : 422 en {@code application/problem+json},
 * avec la liste des erreurs dans la propriété {@code errors}.
 */
public class InvalidCanvasException extends ErrorResponseException {

    private final List<String> errors;

    public InvalidCanvasException(List<String> errors) {
        super(HttpStatus.UNPROCESSABLE_ENTITY, problem(errors), null);
        this.errors = List.copyOf(errors);
    }

    /** Les erreurs détaillées du validateur, pour un traitement qui n'est pas une réponse HTTP (travail asynchrone). */
    public List<String> getErrors() {
        return errors;
    }

    private static ProblemDetail problem(List<String> errors) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY,
                "Le canvas ne respecte pas le contrat");
        problem.setTitle("Instantané invalide");
        problem.setProperty("errors", errors);
        return problem;
    }
}
