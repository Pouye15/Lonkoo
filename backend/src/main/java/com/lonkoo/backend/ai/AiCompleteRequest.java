package com.lonkoo.backend.ai;

import java.util.List;

import jakarta.validation.constraints.Size;

/**
 * Corps de {@code POST /canvases/{id}/ai/complete}. {@code nodeIds} : les blocs sélectionnés (vide ou absent : tout le
 * canvas), 50 au plus ; {@code instruction} : une consigne facultative (taille plafonnée par {@code AI_MAX_INPUT_CHARS}).
 */
public record AiCompleteRequest(@Size(max = 50) List<String> nodeIds, String instruction) {

    public List<String> nodeIdsOrEmpty() {
        return nodeIds == null ? List.of() : nodeIds;
    }
}
