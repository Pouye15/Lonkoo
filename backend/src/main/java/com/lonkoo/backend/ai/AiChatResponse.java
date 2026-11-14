package com.lonkoo.backend.ai;

import java.util.List;

/**
 * Réponse du chatbot d'architecture.
 */
public record AiChatResponse(
        String reply,
        List<String> suggestedActions,
        boolean demo) {
}
