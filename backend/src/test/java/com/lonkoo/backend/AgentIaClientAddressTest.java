package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.http.HttpClient;
import java.time.Duration;

import org.junit.jupiter.api.Test;

import com.lonkoo.backend.ai.AgentIaClient;

/**
 * L'adresse du microservice IA doit être lisible par java.net.URI, qui refuse un tiret bas dans un nom de machine :
 * le nom du service Docker donnait « unsupported URI » (erreur 500) à chaque appel, sans que les tests, qui appellent
 * localhost, le voient. Le client refuse maintenant une telle adresse au démarrage.
 */
class AgentIaClientAddressTest {

    private static AgentIaClient clientFor(String url) {
        return new AgentIaClient(HttpClient.newHttpClient(), url, "jeton-de-test-0123456789", Duration.ofSeconds(5));
    }

    @Test
    void theDefaultAddressIsReadableByJava() {
        assertThatCode(() -> clientFor(null)).doesNotThrowAnyException();
        assertThatCode(() -> clientFor("")).doesNotThrowAnyException();
    }

    @Test
    void aHyphenatedHostAndALocalhostAddressAreAccepted() {
        assertThatCode(() -> clientFor("http://agent-ia:8000")).doesNotThrowAnyException();
        assertThatCode(() -> clientFor("http://localhost:8000/")).doesNotThrowAnyException();
    }

    @Test
    void aHostWithAnUnderscoreIsRefusedAtStartupWithItsCause() {
        assertThatThrownBy(() -> clientFor("http://agent_ia:8000"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("nom de machine");
    }
}
