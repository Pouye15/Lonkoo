package com.lonkoo.backend.ai;

import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.web.ForbiddenException;

import jakarta.validation.Valid;

/**
 * Routes globales du conseiller IA (widget flottant, recommandations d'architecture et de déploiement Systalink).
 */
@RestController
@RequestMapping("/api/ai")
public class AiAssistantController {

    private final AiService aiService;

    public AiAssistantController(AiService aiService) {
        this.aiService = aiService;
    }

    @PostMapping("/chat")
    public AiChatResponse chat(Authentication authentication, @Valid @RequestBody AiChatRequest request) {
        return aiService.globalChat(currentUser(authentication), request.messages());
    }

    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public StreamingResponseBody chatStream(
            Authentication authentication,
            @Valid @RequestBody AiChatRequest request) {
        CurrentUser user = currentUser(authentication);
        return out -> aiService.globalChatStream(user, request.messages(), out);
    }

    private CurrentUser currentUser(Authentication authentication) {
        if (authentication != null && authentication.getPrincipal() instanceof CurrentUser user) {
            return user;
        }
        throw new ForbiddenException("Non authentifié");
    }
}
