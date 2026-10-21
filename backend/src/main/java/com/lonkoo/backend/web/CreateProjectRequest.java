package com.lonkoo.backend.web;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Corps de {@code POST /api/projects}.
 */
public record CreateProjectRequest(
        @NotBlank @Size(max = 80) String name,
        @Size(max = 500) String description,
        @Pattern(regexp = "private|public", message = "doit valoir private ou public") String visibility) {
}