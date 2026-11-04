package com.lonkoo.backend.ai;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * La proposition de l'agent ne respecte pas le contrat du canvas : 502, avec les erreurs du validateur dans la
 * propriété {@code errors}. Ce n'est pas la faute de la personne (422) mais celle du fournisseur : rien n'est renvoyé.
 */
public class AiOutputInvalidException extends ErrorResponseException {

    public AiOutputInvalidException(List<String> errors) {
        super(HttpStatus.BAD_GATEWAY, problem(errors), null);
    }

    private static ProblemDetail problem(List<String> errors) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY,
                "La proposition de l'agent IA ne respecte pas le contrat du canvas : elle n'est pas renvoyée.");
        problem.setTitle("Réponse IA invalide");
        problem.setProperty("errors", List.copyOf(errors));
        return problem;
    }
}
