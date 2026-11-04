package com.lonkoo.backend.realtime;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * Le serveur temps réel ne répond pas comme attendu : 503 s'il est injoignable, 504 s'il met trop
 * de temps, 502 s'il répond une erreur ou un contenu inutilisable ({@code application/problem+json}).
 */
public class RealtimeUnavailableException extends ErrorResponseException {

    public RealtimeUnavailableException(HttpStatus status, String detail) {
        super(status, ProblemDetail.forStatusAndDetail(status, detail), null);
    }
}
