package com.lonkoo.backend.web;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * Corps de {@code POST /api/canvases/{id}/share-links}.
 */
public record ShareLinkRequest(
        @NotNull @Pattern(regexp = "WRITE|READ", message = "doit valoir WRITE ou READ") String role,
        @Min(1) @Max(72) Integer ttlHours) {
}