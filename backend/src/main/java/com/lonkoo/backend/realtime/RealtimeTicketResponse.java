package com.lonkoo.backend.realtime;

import java.time.Instant;

/**
 * Réponse de {@code POST /api/canvases/{id}/realtime-ticket}.
 */
public record RealtimeTicketResponse(
        String ticket,
        Instant expiresAt,
        String role,
        TicketUser user) {

    public record TicketUser(String name, String color) {
    }
}