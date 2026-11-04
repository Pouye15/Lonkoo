package com.lonkoo.backend.ai;

import jakarta.validation.constraints.NotBlank;

/** Corps de {@code POST /canvases/{id}/ai/sketch} : le cahier des charges en texte libre (taille plafonnée par {@code AI_MAX_INPUT_CHARS}). */
public record AiSketchRequest(@NotBlank String brief) {
}
