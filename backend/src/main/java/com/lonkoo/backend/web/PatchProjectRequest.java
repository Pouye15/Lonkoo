package com.lonkoo.backend.web;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Corps de {@code PATCH /api/projects/{id}}. Seuls les champs fournis sont
 * modifiés (null = inchangé).
 */
public record PatchProjectRequest(
        @Size(max = 80) String name,
        @Size(max = 500) String description,
        @Pattern(regexp = "private|public", message = "doit valoir private ou public") String visibility) {
}