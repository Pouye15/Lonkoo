package com.lonkoo.backend.ai;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * Le fournisseur d'IA n'a pas répondu comme il fallait (panne, délai dépassé, quota du fournisseur) : 502, 503 ou 504
 * en {@code application/problem+json}. À lever par une implémentation de {@link AiClient} ; le message, en français,
 * s'affiche tel quel : il ne doit donc contenir ni clé ni détail interne.
 */
public class AiUnavailableException extends ErrorResponseException {

    public AiUnavailableException(HttpStatus status, String message) {
        super(status, ProblemDetail.forStatusAndDetail(status, message), null);
    }

    public AiUnavailableException(String message) {
        this(HttpStatus.BAD_GATEWAY, message);
    }
}
