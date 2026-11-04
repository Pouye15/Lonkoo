package com.lonkoo.backend.ai;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** Aucun fournisseur d'IA n'est branché sur ce serveur (501, propriété {@code code} : {@code AI_NOT_IMPLEMENTED}). */
public class AiNotImplementedException extends ErrorResponseException {

    public AiNotImplementedException() {
        super(HttpStatus.NOT_IMPLEMENTED, problem(), null);
    }

    private static ProblemDetail problem() {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_IMPLEMENTED,
                "L'agent IA n'est pas encore branché sur ce serveur.");
        problem.setTitle("Non implémenté");
        problem.setProperty("code", "AI_NOT_IMPLEMENTED");
        return problem;
    }
}
