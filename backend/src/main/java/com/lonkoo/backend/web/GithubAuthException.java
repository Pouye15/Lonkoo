package com.lonkoo.backend.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * Défaillance du flux OAuth GitHub (état invalide, code refusé, appel à
 * l'API impossible) : 400 pour une demande mal formée, 502 quand GitHub
 * ne répond pas de façon exploitable. Le détail ne contient jamais de jeton.
 */
public class GithubAuthException extends ErrorResponseException {

    public GithubAuthException(HttpStatus status, String message) {
        super(status, ProblemDetail.forStatusAndDetail(status, message), null);
    }
}