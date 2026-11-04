package com.lonkoo.backend.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * L'action demande un compte GitHub connecté (403, titre « Connexion GitHub requise »). L'interface y répond
 * par un bouton de connexion : c'est un manque d'autorisation de l'utilisateur, pas une panne.
 */
public class GithubRequiredException extends ErrorResponseException {

    public GithubRequiredException(String message) {
        super(HttpStatus.FORBIDDEN, problem(message), null);
    }

    private static ProblemDetail problem(String message) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, message);
        problem.setTitle("Connexion GitHub requise");
        return problem;
    }
}
