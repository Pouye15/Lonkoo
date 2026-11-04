package com.lonkoo.backend.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;

import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

/**
 * Écrit une erreur {@code application/problem+json} (RFC 9457) depuis un
 * filtre ou un point d'entrée de sécurité, là où les contrôleurs et leur
 * {@code @RestControllerAdvice} ne sont pas encore atteints.
 */
final class ProblemResponses {

    private static final JsonMapper JSON = JsonMapper.shared();

    private ProblemResponses() {
    }

    static void write(HttpServletResponse response, HttpStatus status, String detail) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", "about:blank");
        body.put("title", status.getReasonPhrase());
        body.put("status", status.value());
        body.put("detail", detail);

        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(JSON.writeValueAsString(body));
    }
}
