package com.lonkoo.backend.web;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Corps de {@code POST /api/canvases/{id}/versions}.
 */
public record CreateVersionRequest(
        @NotBlank @Size(max = 80) String name,
        @Size(max = 500) String message) {
}