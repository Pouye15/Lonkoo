package com.lonkoo.backend.generation;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.lonkoo.backend.github.GithubPushException;
import com.lonkoo.backend.github.GithubPushException.Kind;
import com.lonkoo.backend.github.GithubRepoClient;
import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.support.AuditService;
import com.lonkoo.backend.web.BadRequestException;
import com.lonkoo.backend.web.BusyException;
import com.lonkoo.backend.web.ConflictException;
import com.lonkoo.backend.web.GithubRequiredException;

/**
 * Envoi d'un projet généré sur le compte GitHub de l'utilisateur (lot R8) : création du dépôt puis un seul commit.
 * Le jeton GitHub est pris dans la session au moment de la demande et passé tel quel au travail asynchrone : il
 * n'est ni écrit en base, ni journalisé, ni repris dans une erreur. L'état de l'envoi est porté par la génération.
 */
@Service
public class PublicationService {

    private static final Logger log = LoggerFactory.getLogger(PublicationService.class);
    private static final Pattern REPO_NAME = Pattern.compile("[A-Za-z0-9._-]{1,100}");
    private static final String COMMIT_MESSAGE = "Projet généré par LONKOO";
    private static final String WORKFLOWS_DIRECTORY = ".github/workflows/";

    private final GenerationService generations;
    private final GenerationRepository repository;
    private final GithubRepoClient github;
    private final AuditService auditService;
    private final ExecutorService jobs;

    public PublicationService(GenerationService generations, GenerationRepository repository, GithubRepoClient github,
            AuditService auditService, ExecutorService jobExecutor) {
        this.generations = generations;
        this.repository = repository;
        this.github = github;
        this.auditService = auditService;
        this.jobs = jobExecutor;
    }

    /**
     * Lance l'envoi. Les contrôles d'accès passent avant tout (404 pour un étranger, 403 sans rôle d'écriture) :
     * on ne dit rien de GitHub à qui n'a pas accès à la génération.
     *
     * @param repoName nom du dépôt ; absent, le nom de dossier du projet généré
     * @param token    jeton GitHub de la session, vide pour un invité ou une session sans connexion GitHub
     */
    public GenerationResponse push(CurrentUser user, UUID id, String repoName, boolean isPrivate, Optional<String> token) {
        GenerationRow row = generations.rowForWrite(id);
        String accessToken = token.orElseThrow(() -> new GithubRequiredException(
                "Connectez-vous avec GitHub pour envoyer le projet sur votre compte."));
        if (!"DONE".equals(row.status())) {
            throw new ConflictException("Le projet n'est pas encore généré.");
        }
        String name = repoName == null || repoName.isBlank() ? row.slug() : repoName.trim();
        requireValidRepoName(name);

        if (!repository.claimPush(id)) {
            GenerationRow current = repository.find(id).orElse(row);
            throw new ConflictException("RUNNING".equals(current.pushStatus())
                    ? "Un envoi est déjà en cours pour ce projet."
                    : "Ce projet est déjà envoyé sur GitHub" + (current.repoFullName() == null ? "." : " (" + current.repoFullName() + ")."));
        }
        try {
            auditService.record(user.id(), "push.github", "generation:" + id,
                    "{\"repo\":\"" + name + "\",\"visibility\":\"" + (isPrivate ? "private" : "public") + "\"}");
            jobs.execute(() -> runPush(id, name, isPrivate, accessToken));
        } catch (RejectedExecutionException e) {
            repository.pushFailed(id, "Le serveur est occupé : réessayez dans un instant.", List.of());
            throw new BusyException("Trop de travaux en cours : réessayez dans un instant.");
        } catch (RuntimeException e) {
            // L'envoi est déjà réservé : sans cela (journal d'audit en panne, par exemple), il resterait « en cours ».
            repository.pushFailed(id, "L'envoi n'a pas pu démarrer (erreur interne).", List.of());
            throw e;
        }
        return generations.get(id);
    }

    static void requireValidRepoName(String name) {
        if (name == null || !REPO_NAME.matcher(name).matches() || name.equals(".") || name.equals("..")
                || name.toLowerCase(java.util.Locale.ROOT).endsWith(".git")) {
            throw new BadRequestException("Nom de dépôt invalide : lettres, chiffres, point, tiret et tiret bas, "
                    + "100 caractères au plus, sans « .git » à la fin.");
        }
    }

    /** Le travail d'un envoi, sur l'exécuteur. Ne lève jamais : tout échec devient l'état FAILED avec sa raison. */
    void runPush(UUID id, String name, boolean isPrivate, String token) {
        List<String> warnings = new ArrayList<>();
        try {
            GenerationRow row = repository.find(id).orElse(null);
            Map<String, String> files = repository.files(id).orElse(null);
            if (row == null || files == null) {
                return;   // supprimée entre-temps
            }
            GithubRepoClient.Account account = github.account(token);
            if (isPrivate && account.scopesKnown() && !account.has("repo")) {
                throw new GithubPushException(Kind.NOT_ALLOWED,
                        "Un dépôt privé demande l'autorisation « repo » de GitHub, que votre connexion n'a pas : choisissez un dépôt public.");
            }
            GithubRepoClient.Repo repo = openRepository(id, row, account, name, isPrivate, token);

            Map<String, String> toSend = new LinkedHashMap<>(files);
            boolean hasWorkflow = files.keySet().stream().anyMatch(path -> path.startsWith(WORKFLOWS_DIRECTORY));
            if (hasWorkflow && account.scopesKnown() && !account.has("workflow")) {
                toSend.keySet().removeIf(path -> path.startsWith(WORKFLOWS_DIRECTORY));
                warnings.add(workflowWarning());
                hasWorkflow = false;
            }
            String sha;
            try {
                sha = github.push(token, repo, toSend, COMMIT_MESSAGE);
            } catch (GithubPushException e) {
                if (e.kind() != Kind.WORKFLOW_SCOPE || !hasWorkflow) {
                    throw e;
                }
                toSend.keySet().removeIf(path -> path.startsWith(WORKFLOWS_DIRECTORY));
                warnings.add(workflowWarning());
                hasWorkflow = false;
                sha = github.push(token, repo, toSend, COMMIT_MESSAGE);
            }
            repository.pushDone(id, repo.fullName(), repo.htmlUrl(), sha, hasWorkflow, warnings);
        } catch (GithubPushException e) {
            repository.pushFailed(id, e.getMessage(), warnings);
        } catch (RuntimeException e) {
            log.error("Envoi {} échoué", id, e);
            repository.pushFailed(id, "L'envoi a échoué (erreur interne).", warnings);
        } catch (Error e) {
            log.error("Envoi {} interrompu par une erreur grave", id, e);
            JobGuard.markFailedQuietly(log, "l'envoi " + id, () -> repository.pushFailed(id, "L'envoi a échoué (erreur grave du serveur).", warnings));
            throw e;
        }
    }

    /**
     * Crée le dépôt. Si l'envoi précédent l'avait créé puis avait échoué, il est repris plutôt que refusé : un nouvel
     * essai avec le même nom aboutit sans que l'utilisateur doive supprimer quoi que ce soit.
     */
    private GithubRepoClient.Repo openRepository(UUID id, GenerationRow row, GithubRepoClient.Account account, String name,
            boolean isPrivate, String token) {
        try {
            GithubRepoClient.Repo repo = github.createRepository(token, name, description(row.projectName()), isPrivate);
            repository.pushRepoCreated(id, repo.fullName(), repo.htmlUrl());
            return repo;
        } catch (GithubPushException e) {
            boolean ours = row.repoFullName() != null && row.repoFullName().equalsIgnoreCase(account.login() + "/" + name);
            if (e.kind() == Kind.NAME_TAKEN && ours) {
                return github.findRepository(token, row.repoFullName());
            }
            throw e;
        }
    }

    private static String description(String projectName) {
        String clean = projectName.replaceAll("\\p{Cntrl}", " ").trim();
        String text = "Projet généré par LONKOO : " + clean;
        return text.length() <= 300 ? text : text.substring(0, 299) + "…";
    }

    private static String workflowWarning() {
        return "Le fichier de workflow (" + WORKFLOWS_DIRECTORY + "…) n'a pas été envoyé : votre connexion GitHub n'a pas "
                + "l'autorisation « workflow ». Ajoutez-le depuis l'archive du projet pour activer le déploiement automatique.";
    }
}
