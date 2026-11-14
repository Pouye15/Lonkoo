package com.lonkoo.backend.ai;

import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.web.ForbiddenException;

import jakarta.validation.Valid;

/**
 * Routes de l'agent IA (WP13) : esquisse, complétion, audit et conseiller conversationnel.
 * Chacune renvoie une proposition, des remarques ou des conseils, jamais une écriture.
 */
@RestController
@RequestMapping("/api/canvases/{canvasId}/ai")
public class AiController {

    private final AiService aiService;

    public AiController(AiService aiService) {
        this.aiService = aiService;
    }

    @PostMapping("/sketch")
    AiProposalResponse sketch(Authentication authentication, @PathVariable UUID canvasId,
            @Valid @RequestBody AiSketchRequest request) {
        return aiService.sketch(currentUser(authentication), canvasId, request.brief());
    }

    @PostMapping("/complete")
    AiProposalResponse complete(Authentication authentication, @PathVariable UUID canvasId,
            @Valid @RequestBody(required = false) AiCompleteRequest request) {
        AiCompleteRequest body = request == null ? new AiCompleteRequest(null, null) : request;
        return aiService.complete(currentUser(authentication), canvasId, body.nodeIdsOrEmpty(), body.instruction());
    }

    @PostMapping("/audit")
    AiAuditResponse audit(Authentication authentication, @PathVariable UUID canvasId) {
        return aiService.audit(currentUser(authentication), canvasId);
    }

    @PostMapping("/chat")
    AiChatResponse chat(Authentication authentication, @PathVariable UUID canvasId,
            @Valid @RequestBody AiChatRequest request) {
        return aiService.chat(currentUser(authentication), canvasId, request.messages());
    }

    @PostMapping(value = "/chat/stream", produces = org.springframework.http.MediaType.TEXT_EVENT_STREAM_VALUE)
    org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody chatStream(
            Authentication authentication,
            @PathVariable UUID canvasId,
            @Valid @RequestBody AiChatRequest request) {
        CurrentUser user = currentUser(authentication);
        return out -> aiService.chatStream(user, canvasId, request.messages(), out);
    }

    private CurrentUser currentUser(Authentication authentication) {
        if (authentication != null && authentication.getPrincipal() instanceof CurrentUser user) {
            return user;
        }
        throw new ForbiddenException("Non authentifié");
    }
}
