package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import com.lonkoo.backend.support.ConfigurationCheck;

/**
 * Contrôle de la configuration au démarrage : refus en production, simple signalement ailleurs.
 */
class ConfigurationCheckTest {

    private static final String SECRET = "k3v9Qx7LmT2pWz8RnB5yHc1JdFa6SuEo";
    private static final String TOKEN = "t0ken-de-service-0123456789";

    private static ConfigurationCheck production(String dbPassword, String ticketSecret, String serviceToken, String url) {
        return new ConfigurationCheck(true, dbPassword, ticketSecret, serviceToken, url);
    }

    @Test
    void aSoundProductionConfigurationPasses() {
        var check = production("un-mot-de-passe-solide", SECRET, TOKEN, "https://lonkoo.example.org");

        assertThat(check.problems()).isEmpty();
        assertThatCode(check::check).doesNotThrowAnyException();
    }

    @Test
    void exampleValuesPreventProductionStartupWithoutRevealingAnyValue() {
        var check = production("change-me", "change-me-avec-au-moins-32-caracteres", "change-me", "https://lonkoo.example.org");

        assertThat(check.problems()).containsExactlyInAnyOrder(
                "POSTGRES_PASSWORD porte une valeur d'exemple",
                "REALTIME_TICKET_SECRET porte une valeur d'exemple",
                "REALTIME_SERVICE_TOKEN porte une valeur d'exemple",
                "REALTIME_SERVICE_TOKEN doit faire au moins 16 caractères");
        assertThatThrownBy(check::check)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("POSTGRES_PASSWORD")
                .hasMessageContaining("REALTIME_SERVICE_TOKEN")
                .hasMessageNotContaining("change-me-avec");
    }

    @Test
    void anEmptyDatabasePasswordIsRefusedInProduction() {
        assertThat(production("", SECRET, TOKEN, "https://lonkoo.example.org").problems())
                .containsExactly("POSTGRES_PASSWORD est vide");
    }

    @Test
    void theTwoRealtimeSecretsMustDiffer() {
        assertThat(production("un-mot-de-passe-solide", SECRET, SECRET, "https://lonkoo.example.org").problems())
                .containsExactly("REALTIME_TICKET_SECRET et REALTIME_SERVICE_TOKEN doivent être différents");
    }

    @Test
    void thePublicUrlMustBeHttpsAndNotLocal() {
        assertThat(production("un-mot-de-passe-solide", SECRET, TOKEN, "http://lonkoo.example.org").problems())
                .containsExactly("APP_PUBLIC_URL doit commencer par https:// en production");
        assertThat(production("un-mot-de-passe-solide", SECRET, TOKEN, "https://localhost").problems())
                .containsExactly("APP_PUBLIC_URL ne doit pas désigner la machine locale en production");
    }

    @Test
    void outsideProductionExampleValuesOnlyWarn() {
        var check = new ConfigurationCheck(false, "change-me", "change-me-avec-au-moins-32-caracteres", "change-me",
                "http://localhost:3000");

        assertThat(check.problems()).hasSize(3).allMatch(problem -> problem.endsWith("valeur d'exemple"));
        assertThatCode(check::check).doesNotThrowAnyException();
    }

    @Test
    void outsideProductionLocalSettingsAreFine() {
        var check = new ConfigurationCheck(false, "", SECRET, "court", "http://localhost:3000");

        assertThat(check.problems()).isEmpty();
    }

    @Test
    void theProductionProfileMakesTheSessionCookieSecure() throws IOException {
        Properties prod = new Properties();
        try (InputStream in = new ClassPathResource("application-prod.properties").getInputStream()) {
            prod.load(in);
        }
        assertThat(prod.getProperty("server.servlet.session.cookie.secure")).isEqualTo("true");
        assertThat(prod.getProperty("management.endpoint.health.show-details")).isEqualTo("never");
    }
}
