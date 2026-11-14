package com.lonkoo.backend.support;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

/**
 * Contrôle de la configuration au démarrage. En profil {@code prod}, une valeur d'exemple
 * ({@code change-me}), un secret trop court, un mot de passe de base vide ou une adresse publique qui
 * n'est pas en {@code https} empêchent le démarrage ; ailleurs, les valeurs d'exemple sont seulement
 * signalées dans les journaux. Les messages nomment les variables, jamais leurs valeurs.
 *
 * <p>Les contrôles de l'IA dépendent du fournisseur ({@code AI_PROVIDER}) : chaque fournisseur a ses variables, et
 * lui seul. Avec {@code gemini} le backend appelle le modèle, donc il lui faut une clé et un modèle ; avec
 * {@code agent_ia} la clé vit dans le microservice et le backend n'a besoin que de son adresse et du jeton de service.
 * Exiger une variable qu'un fournisseur n'utilise pas ferait refuser une configuration pourtant correcte.</p>
 */
@Component
public class ConfigurationCheck {

    private static final Logger log = LoggerFactory.getLogger(ConfigurationCheck.class);
    private static final int MIN_SERVICE_TOKEN_LENGTH = 16;

    /**
     * Les réglages de l'agent IA regardés au démarrage.
     *
     * @param provider            {@code off}, {@code fake}, {@code gemini} ou {@code agent_ia}
     * @param apiKey              clé du modèle, utilisée par le backend seulement avec {@code gemini}
     * @param model               nom du modèle, idem
     * @param agentUrl            adresse du microservice {@code agent_ia}
     * @param serviceToken        jeton partagé avec le microservice ({@code X-Service-Token})
     * @param timeoutSeconds      délai d'<em>un</em> appel au modèle
     * @param agentTimeoutSeconds délai d'attente du backend sur le microservice : il doit couvrir deux appels au
     *                            modèle (la reprise) plus une marge
     */
    public record AiSettings(String provider, String apiKey, String model, String agentUrl, String serviceToken,
            int timeoutSeconds, int agentTimeoutSeconds) {

        /** Aucun fournisseur branché : rien à vérifier. */
        public static AiSettings off() {
            return new AiSettings("off", "", "", "", "", 30, 70);
        }

        /** Gemini appelé en direct par le backend. */
        public static AiSettings gemini(String apiKey, String model) {
            return new AiSettings("gemini", apiKey, model, "", "", 30, 70);
        }

        /** Le microservice {@code agent_ia} : ni clé ni modèle côté backend. */
        public static AiSettings agent(String agentUrl, String serviceToken) {
            return new AiSettings("agent_ia", "", "", agentUrl, serviceToken, 30, 70);
        }

        /** Le même microservice, avec les deux délais à vérifier. */
        public AiSettings withTimeouts(int timeoutSeconds, int agentTimeoutSeconds) {
            return new AiSettings(provider, apiKey, model, agentUrl, serviceToken, timeoutSeconds, agentTimeoutSeconds);
        }
    }

    private final boolean production;
    private final String databasePassword;
    private final String ticketSecret;
    private final String serviceToken;
    private final String publicUrl;
    private final String githubClientId;
    private final String githubClientSecret;
    private final String githubRedirectUri;
    private final AiSettings ai;

    @Autowired
    public ConfigurationCheck(
            Environment environment,
            @Value("${spring.datasource.password:}") String databasePassword,
            @Value("${realtime.ticket-secret}") String ticketSecret,
            @Value("${realtime.service-token}") String serviceToken,
            @Value("${app.public-url}") String publicUrl,
            @Value("${github.oauth.client-id}") String githubClientId,
            @Value("${github.oauth.client-secret}") String githubClientSecret,
            @Value("${github.oauth.redirect-uri}") String githubRedirectUri,
            @Value("${lonkoo.ai.provider:off}") String aiProvider,
            @Value("${lonkoo.ai.api-key:}") String aiApiKey,
            @Value("${lonkoo.ai.model:}") String aiModel,
            @Value("${lonkoo.ai.agent-url:}") String aiAgentUrl,
            @Value("${lonkoo.ai.service-token:}") String aiServiceToken,
            @Value("${lonkoo.ai.timeout-seconds:30}") int aiTimeoutSeconds,
            @Value("${lonkoo.ai.agent-timeout-seconds:70}") int aiAgentTimeoutSeconds) {
        this(environment.acceptsProfiles(Profiles.of("prod")), databasePassword, ticketSecret, serviceToken, publicUrl,
                githubClientId, githubClientSecret, githubRedirectUri,
                new AiSettings(aiProvider, aiApiKey, aiModel, aiAgentUrl, aiServiceToken, aiTimeoutSeconds, aiAgentTimeoutSeconds));
    }

    /** Constructeur de test : des valeurs GitHub neutres empêchent les contrôles OAuth d'interférer. */
    public ConfigurationCheck(boolean production, String databasePassword, String ticketSecret, String serviceToken,
            String publicUrl) {
        this(production, databasePassword, ticketSecret, serviceToken, publicUrl,
                "test-client-id", "test-client-secret", "https://lonkoo.example.org/api/auth/github/callback",
                AiSettings.off());
    }

    public ConfigurationCheck(boolean production, String databasePassword, String ticketSecret, String serviceToken,
            String publicUrl, String githubClientId, String githubClientSecret, String githubRedirectUri) {
        this(production, databasePassword, ticketSecret, serviceToken, publicUrl,
                githubClientId, githubClientSecret, githubRedirectUri, AiSettings.off());
    }

    public ConfigurationCheck(boolean production, String databasePassword, String ticketSecret, String serviceToken,
            String publicUrl, String githubClientId, String githubClientSecret, String githubRedirectUri,
            AiSettings ai) {
        this.production = production;
        this.databasePassword = databasePassword;
        this.ticketSecret = ticketSecret;
        this.serviceToken = serviceToken;
        this.publicUrl = publicUrl;
        this.githubClientId = githubClientId;
        this.githubClientSecret = githubClientSecret;
        this.githubRedirectUri = githubRedirectUri;
        this.ai = ai;
    }

    @PostConstruct
    public void check() {
        List<String> problems = problems();
        if (problems.isEmpty()) {
            return;
        }
        if (production) {
            throw new IllegalStateException("Configuration de production refusée : " + String.join(" ; ", problems));
        }
        log.warn("Configuration à corriger avant la production : {}", String.join(" ; ", problems));
    }

    /** Problèmes relevés, sans aucune valeur secrète dans les messages. */
    public List<String> problems() {
        List<String> problems = new ArrayList<>();

        if (isPlaceholder(databasePassword)) {
            problems.add("POSTGRES_PASSWORD porte une valeur d'exemple");
        }
        if (isPlaceholder(ticketSecret)) {
            problems.add("REALTIME_TICKET_SECRET porte une valeur d'exemple");
        }
        if (isPlaceholder(serviceToken)) {
            problems.add("REALTIME_SERVICE_TOKEN porte une valeur d'exemple");
        }
        if (ticketSecret != null && ticketSecret.equals(serviceToken)) {
            problems.add("REALTIME_TICKET_SECRET et REALTIME_SERVICE_TOKEN doivent être différents");
        }

        if (production) {
            if (databasePassword == null || databasePassword.isBlank()) {
                problems.add("POSTGRES_PASSWORD est vide");
            }
            if (serviceToken != null && serviceToken.length() < MIN_SERVICE_TOKEN_LENGTH) {
                problems.add("REALTIME_SERVICE_TOKEN doit faire au moins " + MIN_SERVICE_TOKEN_LENGTH + " caractères");
            }
            if (publicUrl == null || !publicUrl.startsWith("https://")) {
                problems.add("APP_PUBLIC_URL doit commencer par https:// en production");
            } else if (publicUrl.contains("localhost") || publicUrl.contains("127.0.0.1")) {
                problems.add("APP_PUBLIC_URL ne doit pas désigner la machine locale en production");
            }
            if (isPlaceholder(githubClientId)) {
                problems.add("GITHUB_OAUTH_CLIENT_ID porte une valeur d'exemple");
            }
            if (isPlaceholder(githubClientSecret)) {
                problems.add("GITHUB_OAUTH_CLIENT_SECRET porte une valeur d'exemple");
            }
            if (isPlaceholder(githubRedirectUri) || (githubRedirectUri != null && !githubRedirectUri.startsWith("https://"))) {
                problems.add("GITHUB_OAUTH_REDIRECT_URI doit être une adresse https et sans valeur d'exemple");
            }
        }
        problems.addAll(aiProblems());
        return problems;
    }

    /**
     * Les contrôles de l'agent IA, par fournisseur. Les variables d'un fournisseur qui n'est pas celui choisi ne sont
     * pas regardées : avec {@code AI_PROVIDER=agent_ia}, c'est le microservice qui porte la clé du modèle.
     */
    private List<String> aiProblems() {
        List<String> problems = new ArrayList<>();
        String provider = ai == null || ai.provider() == null ? "" : ai.provider().strip().toLowerCase(Locale.ROOT);
        boolean gemini = provider.equals("gemini");
        boolean agent = provider.equals("agent_ia");

        if (production && gemini) {
            if (isMissing(ai.apiKey())) {
                problems.add("AI_API_KEY est vide alors que AI_PROVIDER vaut gemini");
            } else if (isPlaceholder(ai.apiKey())) {
                problems.add("AI_API_KEY porte une valeur d'exemple");
            }
            if (isMissing(ai.model())) {
                problems.add("AI_MODEL est vide alors que AI_PROVIDER vaut gemini");
            } else if (isPlaceholder(ai.model())) {
                problems.add("AI_MODEL porte une valeur d'exemple");
            }
        }
        if (production && agent) {
            if (isMissing(ai.serviceToken())) {
                problems.add("AI_SERVICE_TOKEN est vide alors que AI_PROVIDER vaut agent_ia");
            } else {
                if (isPlaceholder(ai.serviceToken())) {
                    problems.add("AI_SERVICE_TOKEN porte une valeur d'exemple");
                }
                if (ai.serviceToken().length() < MIN_SERVICE_TOKEN_LENGTH) {
                    problems.add("AI_SERVICE_TOKEN doit faire au moins " + MIN_SERVICE_TOKEN_LENGTH + " caractères");
                }
            }
            if (isMissing(ai.agentUrl())) {
                problems.add("AI_AGENT_URL est vide alors que AI_PROVIDER vaut agent_ia");
            } else if (isPlaceholder(ai.agentUrl())) {
                problems.add("AI_AGENT_URL porte une valeur d'exemple");
            }
        }
        if (production && !gemini && !agent && !provider.isBlank()
                && !provider.equals("off") && !provider.equals("fake")) {
            problems.add("AI_PROVIDER ne désigne aucun fournisseur connu (off, fake, gemini, agent_ia)");
        }
        // Le backend doit laisser au microservice le temps de deux appels au modèle (la reprise d'une sortie
        // invalide) plus une marge : sinon il coupe toujours avant, et l'appel au modèle est payé puis jeté.
        if (agent && ai.agentTimeoutSeconds() < 2 * ai.timeoutSeconds() + 5) {
            problems.add("AI_AGENT_TIMEOUT_SECONDS doit valoir au moins 2 × AI_TIMEOUT_SECONDS + 5 secondes");
        }
        return problems;
    }

    private static boolean isMissing(String value) {
        return value == null || value.isBlank();
    }

    private static boolean isPlaceholder(String value) {
        if (value == null) {
            return false;
        }
        String lower = value.toLowerCase(Locale.ROOT);
        return lower.contains("change-me") || lower.contains("changeme") || lower.contains("change_me");
    }
}
