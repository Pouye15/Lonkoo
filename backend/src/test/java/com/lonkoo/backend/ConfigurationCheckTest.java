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
import com.lonkoo.backend.support.ConfigurationCheck.AiSettings;

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
    void githubApplicationValuesAreCheckedInProduction() {
        var good = new ConfigurationCheck(true, "un-mot-de-passe-solide", SECRET, TOKEN, "https://lonkoo.example.org",
                "Iv1.identifiant", "valeur-secrete-de-l-application", "https://lonkoo.example.org/api/auth/github/callback");
        assertThat(good.problems()).isEmpty();

        var examples = new ConfigurationCheck(true, "un-mot-de-passe-solide", SECRET, TOKEN, "https://lonkoo.example.org",
                "change-me", "change-me", "http://localhost:3000/api/auth/github/callback");
        assertThat(examples.problems()).containsExactlyInAnyOrder(
                "GITHUB_OAUTH_CLIENT_ID porte une valeur d'exemple",
                "GITHUB_OAUTH_CLIENT_SECRET porte une valeur d'exemple",
                "GITHUB_OAUTH_REDIRECT_URI doit être une adresse https et sans valeur d'exemple");

        var insecure = new ConfigurationCheck(true, "un-mot-de-passe-solide", SECRET, TOKEN, "https://lonkoo.example.org",
                "Iv1.identifiant", "valeur-secrete-de-l-application", "http://lonkoo.example.org/api/auth/github/callback");
        assertThat(insecure.problems()).containsExactly("GITHUB_OAUTH_REDIRECT_URI doit être une adresse https et sans valeur d'exemple");
    }

    @Test
    void githubExampleValuesAreToleratedOutsideProduction() {
        var check = new ConfigurationCheck(false, "", SECRET, TOKEN, "http://localhost:3000",
                "change-me", "change-me", "http://localhost:3000/api/auth/github/callback");

        assertThat(check.problems()).isEmpty();
    }

    /** Un contrôle en production, avec des réglages d'IA donnés et tout le reste correct. */
    private static ConfigurationCheck productionWithAi(AiSettings ai) {
        return new ConfigurationCheck(true, "un-mot-de-passe-solide", SECRET, TOKEN, "https://lonkoo.example.org",
                "Iv1.id", "secret", "https://lonkoo.example.org/api/auth/github/callback", ai);
    }

    @Test
    void geminiNeedsItsKeyAndItsModelInProduction() {
        assertThat(productionWithAi(AiSettings.gemini("AIzaSySolide", "gemini-1.5-flash")).problems()).isEmpty();

        assertThat(productionWithAi(AiSettings.gemini("change-me", "change-me")).problems()).containsExactlyInAnyOrder(
                "AI_API_KEY porte une valeur d'exemple",
                "AI_MODEL porte une valeur d'exemple");

        assertThat(productionWithAi(AiSettings.gemini("", "")).problems()).containsExactlyInAnyOrder(
                "AI_API_KEY est vide alors que AI_PROVIDER vaut gemini",
                "AI_MODEL est vide alors que AI_PROVIDER vaut gemini");
    }

    @Test
    void theMicroserviceNeedsItsAddressAndItsTokenButNoKeyOfItsOwn() {
        // La clé du modèle vit dans le microservice : le backend n'en a pas besoin, et ne doit pas l'exiger.
        assertThat(productionWithAi(AiSettings.agent("http://agent_ia:8000", TOKEN)).problems()).isEmpty();

        assertThat(productionWithAi(AiSettings.agent("", "")).problems()).containsExactlyInAnyOrder(
                "AI_SERVICE_TOKEN est vide alors que AI_PROVIDER vaut agent_ia",
                "AI_AGENT_URL est vide alors que AI_PROVIDER vaut agent_ia");

        assertThat(productionWithAi(AiSettings.agent("change-me", "change-me")).problems()).containsExactlyInAnyOrder(
                "AI_SERVICE_TOKEN porte une valeur d'exemple",
                "AI_SERVICE_TOKEN doit faire au moins 16 caractères",
                "AI_AGENT_URL porte une valeur d'exemple");
    }

    @Test
    void theBackendWaitsLongEnoughForTheMicroserviceToRetryOnce() {
        // 30 s par appel au modèle, deux appels possibles : 30 s d'attente couperaient toujours avant la fin.
        assertThat(productionWithAi(AiSettings.agent("http://agent_ia:8000", TOKEN).withTimeouts(30, 30)).problems())
                .containsExactly("AI_AGENT_TIMEOUT_SECONDS doit valoir au moins 2 × AI_TIMEOUT_SECONDS + 5 secondes");
        assertThat(productionWithAi(AiSettings.agent("http://agent_ia:8000", TOKEN).withTimeouts(30, 65)).problems()).isEmpty();
        assertThat(productionWithAi(AiSettings.agent("http://agent_ia:8000", TOKEN).withTimeouts(30, 70)).problems()).isEmpty();

        // Hors production, le délai mal dimensionné est signalé sans empêcher le démarrage.
        var outside = new ConfigurationCheck(false, "un-mot-de-passe-solide", SECRET, TOKEN, "http://localhost:3000",
                "Iv1.id", "secret", "https://lonkoo.example.org/api/auth/github/callback",
                AiSettings.agent("http://agent_ia:8000", TOKEN).withTimeouts(45, 30));
        assertThat(outside.problems()).containsExactly("AI_AGENT_TIMEOUT_SECONDS doit valoir au moins 2 × AI_TIMEOUT_SECONDS + 5 secondes");
        assertThatCode(outside::check).doesNotThrowAnyException();
    }

    @Test
    void withoutAProviderNothingAboutTheAiIsRequired() {
        // fake et off : ni clé, ni jeton, ni adresse. Les valeurs d'exemple qui traînent ne gênent personne.
        assertThat(productionWithAi(new AiSettings("fake", "change-me", "change-me", "change-me", "change-me", 30, 30)).problems())
                .isEmpty();
        assertThat(productionWithAi(AiSettings.off()).problems()).isEmpty();

        assertThat(productionWithAi(new AiSettings("change-me", "", "", "", "", 30, 70)).problems())
                .containsExactly("AI_PROVIDER ne désigne aucun fournisseur connu (off, fake, gemini, agent_ia)");
    }

    @Test
    void outsideProductionTheKeysOfTheAiAreOnlyTheirOwnBusiness() {
        var check = new ConfigurationCheck(false, "", SECRET, TOKEN, "http://localhost:3000",
                "change-me", "change-me", "http://localhost:3000/api/auth/github/callback",
                AiSettings.gemini("", ""));

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
