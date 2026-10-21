package com.lonkoo.backend.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * Ressource introuvable (ou non visible par l'appelant) : renvoie un 404
 * volontairement indistinct pour ne pas révéler l'existence d'une ressource.
 */
public class NotFoundException extends ErrorResponseException {

    public NotFoundException(String message) {
        super(HttpStatus.NOT_FOUND, ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, message), null);
    }
}
