package com.lonkoo.backend.canvas;

import tools.jackson.databind.JsonNode;

/** Une version avec son instantané (détail d'une version). */
public record CanvasVersionDetail(CanvasVersion version, JsonNode snapshot) {
}
