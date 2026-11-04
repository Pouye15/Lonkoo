package com.lonkoo.backend.generation;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.lonkoo.backend.github.GithubPushException;
import com.lonkoo.backend.github.GithubRepoClient;
import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.support.AuditService;
import com.lonkoo.backend.support.UsageLimits;
import com.lonkoo.backend.web.BadRequestException;
import com.lonkoo.backend.web.BusyException;
import com.lonkoo.backend.web.ConflictException;
import com.lonkoo.backend.web.GithubRequiredException;
import com.lonkoo.backend.web.NotFoundException;

/**
 * Déploiement d'un projet généré (lot R8). Le projet est déjà dans un dépôt GitHub avec son workflow
 * {@code deploy-systalink.yml} : LONKOO le lance avec {@code workflow_dispatch} (méthode {@code WORKFLOW}) et suit
 * l'exécution à la lecture de l'état. Quand il ne peut pas le lancer (workflow absent du dépôt, autorisation
 * insuffisante), le déploiement passe en {@code MANUAL} avec les étapes à suivre soi-même.
 *
 * <p>Le serveur ne se connecte jamais lui-même à une machine de déploiement, et il n'appelle jamais l'adresse
 * publique donnée par l'utilisateur (elle n'est qu'affichée) : pas de clé SSH ici, pas de requête vers une adresse
 * choisie par un tiers.</p>
 */
@Service
public class DeploymentService {

    private static final Logger log = LoggerFactory.getLogger(DeploymentService.class);
    static final String WORKFLOW_FILE = "deploy-systalink.yml";
    private static final List<String> SECRETS = List.of("SYSTALINK_SSH_HOST", "SYSTALINK_SSH_USER",
            "SYSTALINK_SSH_PRIVATE_KEY", "SYSTALINK_SSH_KNOWN_HOSTS");
    private static final Pattern CONCLUSION = Pattern.compile("[a-z_]{1,30}");
    private static final int RUN_LOOKUP_ATTEMPTS = 8;

    private final GenerationService generations;
    private final DeploymentRepository repository;
    private final GithubRepoClient github;
    private final UsageLimits usageLimits;
    private final AuditService auditService;
    private final TransactionTemplate transactions;
    private final ExecutorService jobs;
    private final long retryDelayMillis;
    private final Duration refreshEvery;
    private final Map<UUID, Instant> lastRefresh = new ConcurrentHashMap<>();

    public DeploymentService(GenerationService generations, DeploymentRepository repository, GithubRepoClient github,
            UsageLimits usageLimits, AuditService auditService, TransactionTemplate transactions, ExecutorService jobExecutor,
            @Value("${github.api.retry-delay-millis:700}") long retryDelayMillis,
            @Value("${lonkoo.deployments.refresh-millis:3000}") long refreshMillis) {
        this.generations = generations;
        this.repository = repository;
        this.github = github;
        this.usageLimits = usageLimits;
        this.auditService = auditService;
        this.transactions = transactions;
        this.jobs = jobExecutor;
        this.retryDelayMillis = retryDelayMillis;
        this.refreshEvery = Duration.ofMillis(refreshMillis);
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recoverInterruptedJobs() {
        int recovered = repository.recoverInterrupted();
        if (recovered > 0) {
            log.warn("{} lancement(s) de déploiement interrompu(s) par le redémarrage ont été marqués échoués", recovered);
        }
    }

    /**
     * Demande un déploiement.
     *
     * @param manual    vrai pour ne pas lancer le workflow : on enregistre seulement la demande et on donne les étapes
     * @param publicUrl adresse où le site sera visible, facultative, affichée telle quelle (jamais appelée)
     * @param token     jeton GitHub de la session ; requis pour que LONKOO lance le workflow
     */
    public DeploymentResponse deploy(CurrentUser user, UUID generationId, boolean manual, String publicUrl, Optional<String> token) {
        GenerationRow generation = generations.rowForWrite(generationId);
        if (!"DONE".equals(generation.pushStatus()) || generation.repoFullName() == null) {
            throw new ConflictException("Envoyez d'abord le projet sur GitHub : le déploiement part du dépôt.");
        }
        String url = validPublicUrl(publicUrl);
        String accessToken = null;
        if (!manual) {
            accessToken = token.orElseThrow(() -> new GithubRequiredException(
                    "Connectez-vous avec GitHub pour que LONKOO lance le déploiement, ou choisissez de déployer vous-même."));
        }
        boolean launch = !manual && generation.workflowSent();
        String method = launch ? "WORKFLOW" : "MANUAL";
        String detail = manual ? "Déploiement à faire vous-même : suivez les étapes ci-dessous."
                : launch ? "En attente du lancement sur GitHub Actions."
                : "Le fichier de workflow n'est pas dans le dépôt (autorisation « workflow » manquante lors de l'envoi) : "
                        + "suivez les étapes ci-dessous.";

        UUID id = transactions.execute(status -> {
            usageLimits.requireRoomForDeployment(generationId);
            if (repository.hasActive(generationId)) {
                throw new ConflictException("Un déploiement de ce projet est déjà en cours.");
            }
            UUID created = repository.insert(generationId, user.id(), method, launch ? "PENDING" : "MANUAL", url, detail);
            auditService.record(user.id(), "deployment.requested", "generation:" + generationId, "{\"method\":\"" + method + "\"}");
            return created;
        });
        if (launch) {
            String repoName = generation.repoFullName();
            String bearer = accessToken;
            try {
                jobs.execute(() -> runDispatch(id, repoName, bearer));
            } catch (RejectedExecutionException e) {
                repository.finish(id, "FAILED", "Le serveur est occupé : réessayez dans un instant.");
                throw new BusyException("Trop de travaux en cours : réessayez dans un instant.");
            }
        }
        return response(repository.find(id).orElseThrow(), generation);
    }

    /** Lancement du workflow, sur l'exécuteur. Ne lève jamais : tout échec devient un état, jamais une exception perdue. */
    void runDispatch(UUID id, String fullName, String token) {
        try {
            Instant before = Instant.now().minusSeconds(60);
            GithubRepoClient.Repo repo = github.findRepository(token, fullName);
            OptionalLong runId = github.dispatchWorkflow(token, fullName, WORKFLOW_FILE, repo.defaultBranch());
            Optional<GithubRepoClient.Run> run = runId.isPresent()
                    ? Optional.of(github.run(token, fullName, runId.getAsLong()))
                    : findRun(token, fullName, repo.defaultBranch(), before);
            if (run.isPresent()) {
                repository.running(id, run.get().id(), run.get().htmlUrl(), describe(run.get()));
            } else {
                repository.running(id, null, null, "Workflow lancé : l'exécution n'est pas encore visible sur GitHub.");
            }
        } catch (GithubPushException e) {
            switch (e.kind()) {
                case NOT_ALLOWED, WORKFLOW_SCOPE -> repository.manual(id, "GitHub n'autorise pas LONKOO à lancer le workflow avec votre "
                        + "connexion actuelle (les autorisations « repo » et « workflow » sont nécessaires) : suivez les étapes "
                        + "ci-dessous, ou autorisez le déploiement depuis LONKOO.");
                default -> repository.finish(id, "FAILED", e.getMessage());
            }
        } catch (RuntimeException e) {
            log.error("Lancement du déploiement {} échoué", id, e);
            repository.finish(id, "FAILED", "Le lancement a échoué (erreur interne).");
        } catch (Error e) {
            log.error("Lancement du déploiement {} interrompu par une erreur grave", id, e);
            JobGuard.markFailedQuietly(log, "le déploiement " + id, () -> repository.finish(id, "FAILED", "Le lancement a échoué (erreur grave du serveur)."));
            throw e;
        }
    }

    private Optional<GithubRepoClient.Run> findRun(String token, String fullName, String branch, Instant notBefore) {
        for (int attempt = 1; attempt <= RUN_LOOKUP_ATTEMPTS; attempt++) {
            Optional<GithubRepoClient.Run> run = github.latestRun(token, fullName, WORKFLOW_FILE, branch, notBefore);
            if (run.isPresent()) {
                return run;
            }
            try {
                Thread.sleep(retryDelayMillis);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return Optional.empty();
            }
        }
        return Optional.empty();
    }

    // ------------------------------------------------------------------ Lecture

    /**
     * L'état d'un déploiement. Tant qu'il est en cours, il est rafraîchi depuis GitHub avec le jeton de l'appelant (au
     * plus toutes les 3 secondes) ; sans jeton, ou si GitHub ne répond pas, l'état enregistré est rendu tel quel.
     */
    public DeploymentResponse get(UUID id, Optional<String> token) {
        DeploymentRow row = repository.find(id).orElseThrow(() -> new NotFoundException("Déploiement introuvable"));
        GenerationRow generation = generations.row(row.generationId());
        if (("PENDING".equals(row.status()) || "RUNNING".equals(row.status())) && "WORKFLOW".equals(row.method()) && token.isPresent()) {
            refresh(row, generation, token.get());
            row = repository.find(id).orElse(row);
        }
        return response(row, generation);
    }

    public List<DeploymentResponse> list(UUID generationId) {
        GenerationRow generation = generations.row(generationId);
        return repository.listByGeneration(generationId, 10).stream().map(row -> response(row, generation)).toList();
    }

    private void refresh(DeploymentRow row, GenerationRow generation, String token) {
        Instant now = Instant.now();
        if (lastRefresh.size() > 1000) {
            lastRefresh.clear();   // la mémoire de ces horodatages reste bornée
        }
        // L'horodatage ne change que lorsqu'on interroge vraiment GitHub : un suivi plus fréquent que l'intervalle
        // n'a pas le droit de repousser indéfiniment le prochain rafraîchissement.
        Instant last = lastRefresh.get(row.id());
        if (last != null && Duration.between(last, now).compareTo(refreshEvery) < 0) {
            return;
        }
        lastRefresh.put(row.id(), now);
        if (generation.repoFullName() == null) {
            return;
        }
        try {
            if (row.runId() == null) {
                if ("RUNNING".equals(row.status())) {
                    Optional<GithubRepoClient.Run> run = github.latestRun(token, generation.repoFullName(), WORKFLOW_FILE,
                            github.findRepository(token, generation.repoFullName()).defaultBranch(), row.createdAt().minusSeconds(60));
                    run.ifPresent(r -> repository.running(row.id(), r.id(), r.htmlUrl(), describe(r)));
                }
                return;
            }
            GithubRepoClient.Run run = github.run(token, generation.repoFullName(), row.runId());
            if ("completed".equals(run.status())) {
                if ("success".equals(run.conclusion())) {
                    repository.finish(row.id(), "DEPLOYED", "Déploiement terminé avec succès.");
                } else {
                    String conclusion = run.conclusion() != null && CONCLUSION.matcher(run.conclusion()).matches() ? run.conclusion() : "inconnu";
                    repository.finish(row.id(), "FAILED", "Le workflow s'est terminé sans succès (" + conclusion
                            + ") : consultez ses journaux sur GitHub. Les secrets SYSTALINK_* sont-ils créés ?");
                }
                lastRefresh.remove(row.id());
            } else {
                repository.detail(row.id(), describe(run));
            }
        } catch (GithubPushException e) {
            log.warn("Suivi du déploiement {} : {}", row.id(), e.kind());   // l'état enregistré reste valable
        } catch (RuntimeException e) {
            log.warn("Suivi du déploiement {} impossible", row.id(), e);
        }
    }

    private static String describe(GithubRepoClient.Run run) {
        return switch (run.status()) {
            case "in_progress" -> "Le workflow s'exécute sur GitHub Actions.";
            case "queued", "waiting", "requested", "pending" -> "Le workflow est en file d'attente sur GitHub Actions.";
            default -> "Le workflow est lancé sur GitHub Actions.";
        };
    }

    // ------------------------------------------------------------------ Aides

    private DeploymentResponse response(DeploymentRow row, GenerationRow generation) {
        return DeploymentResponse.of(row, manualSteps(generation));
    }

    /** Les étapes pour déployer soi-même, construites avec le dépôt réellement créé. */
    static DeploymentResponse.Manual manualSteps(GenerationRow generation) {
        String url = generation.repoUrl();
        String full = generation.repoFullName();
        if (url == null || full == null) {
            return null;
        }
        String folder = full.substring(full.indexOf('/') + 1);
        return new DeploymentResponse.Manual(
                url + "/actions/workflows/" + WORKFLOW_FILE,
                url + "/settings/secrets/actions",
                SECRETS,
                List.of("git clone " + url + ".git", "cd " + folder, "cp .env.example .env", "docker compose up -d --build"));
    }

    /** Adresse publique facultative : http(s) seulement, sans identifiants, 200 caractères au plus. */
    static String validPublicUrl(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String text = value.trim();
        try {
            URI uri = new URI(text);
            boolean web = "http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme());
            if (!web || uri.getHost() == null || uri.getUserInfo() != null || text.length() > 200 || !text.chars().allMatch(c -> c > 32 && c < 127)) {
                throw new BadRequestException("Adresse publique invalide : une adresse http(s) de 200 caractères au plus, sans identifiants.");
            }
            return text;
        } catch (URISyntaxException e) {
            throw new BadRequestException("Adresse publique invalide : une adresse http(s) de 200 caractères au plus, sans identifiants.");
        }
    }
}
