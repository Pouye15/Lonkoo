package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.lonkoo.backend.realtime.InternalStateController;
import com.lonkoo.backend.realtime.RealtimeTicketService;

/**
 * Les secrets mal configurés font échouer le démarrage, pas la première requête.
 */
class SecretsValidationTest {

    @Test
    void ticketSecretShorterThan32BytesIsRejected() {
        assertThatThrownBy(() -> new RealtimeTicketService(null, "change-me"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32 octets");
    }

    @Test
    void ticketSecretOf32BytesIsAccepted() {
        new RealtimeTicketService(null, "0123456789abcdef0123456789abcdef");
    }

    @Test
    void blankServiceTokenIsRejected() {
        assertThatThrownBy(() -> new InternalStateController(null, "  ", 1024))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("REALTIME_SERVICE_TOKEN");
    }
}
