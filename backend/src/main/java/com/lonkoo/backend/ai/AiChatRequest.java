package com.lonkoo.backend.ai;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

/**
 * Requête pour l'assistant conversationnel (Chatbot) d'architecture.
 */
public record AiChatRequest(
        @NotEmpty @Size(max = 20) List<Message> messages) {

    public record Message(
            @NotBlank String role,
            @NotBlank @Size(max = 8000) String content) {
    }
}
