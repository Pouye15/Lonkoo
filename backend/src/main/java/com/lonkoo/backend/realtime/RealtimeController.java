package com.lonkoo.backend.realtime;

import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.web.ForbiddenException;

/**
 * Temps réel (WP6) : délivre un ticket JWT court pour accéder à un canvas.
 */
@RestController
@RequestMapping("/api")
public class RealtimeController {

    private final RealtimeTicketService ticketService;

    public RealtimeController(RealtimeTicketService ticketService) {
        this.ticketService = ticketService;
    }

    @PostMapping("/canvases/{canvasId}/realtime-ticket")
    RealtimeTicketResponse ticket(Authentication authentication, @PathVariable UUID canvasId) {
        return ticketService.issue(currentUser(authentication), canvasId);
    }

    private CurrentUser currentUser(Authentication authentication) {
        if (authentication != null && authentication.getPrincipal() instanceof CurrentUser user) {
            return user;
        }
        throw new ForbiddenException("Non authentifié");
    }
}