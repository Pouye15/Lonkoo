package com.lonkoo.backend.web;

import java.util.UUID;

/**
 * Réponse de {@code POST /api/join/{token}}.
 */
public record JoinResponse(
        UUID projectId,
        UUID canvasId,
        String role) {
}