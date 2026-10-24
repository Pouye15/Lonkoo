package com.lonkoo.backend.generation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;

import org.junit.jupiter.api.Test;

import com.lonkoo.backend.github.GithubRepoClient;
import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.support.AuditService;

import tools.jackson.databind.json.JsonMapper;

/**
 * Une erreur grave (mémoire épuisée, pile débordée) n'est pas une {@code RuntimeException} : sans garde-fou elle
 * abandonnait la ligne en base à « en cours », ce qui bloquait toute nouvelle demande sur le canvas (409 « déjà en
 * cours ») jusqu'au prochain redémarrage. Les trois travaux en arrière-plan (génération, envoi sur GitHub, lancement de
 * déploiement) marquent désormais l'échec puis relancent l'erreur, et une panne de la base à cet instant ne la masque pas.
 */
class JobFailureHandlingTest {

    private final UUID id = UUID.randomUUID();

    private GenerationRow row(String status, String pushStatus) {
        return new GenerationRow(id, UUID.randomUUID(), null, null, "spring-boot", status, "Démo", "demo", 3, 100L, List.of(), null,
                Instant.now(), null, pushStatus, null, null, null, false, List.of(), null, null);
    }

    // ------------------------------------------------------------------ Génération

    private GenerationService generationService(GenerationRepository repository, ProjectGenerator generator) {
        return new GenerationService(repository, generator, null, null, null, null, null, null, null, null, mock(ExecutorService.class));
    }

    private GenerationRepository runningGeneration() {
        GenerationRepository repository = mock(GenerationRepository.class);
        when(repository.claimRunning(id)).thenReturn(true);
        when(repository.find(id)).thenReturn(Optional.of(row("RUNNING", null)));
        when(repository.snapshotOf(id)).thenReturn(Optional.of(JsonMapper.shared().readTree("{}")));
        return repository;
    }

    @Test
    void aSevereErrorDuringGenerationMarksItFailedAndIsRethrown() {
        GenerationRepository repository = runningGeneration();
        ProjectGenerator generator = mock(ProjectGenerator.class);
        when(generator.generate(org.mockito.ArgumentMatchers.any(), anyString())).thenThrow(new StackOverflowError("test"));

        assertThatThrownBy(() -> generationService(repository, generator).run(id)).isInstanceOf(StackOverflowError.class);

        verify(repository).markFailed(eq(id), contains("erreur grave"));
    }

    @Test
    void aDatabaseFailureWhileMarkingDoesNotHideTheOriginalError() {
        GenerationRepository repository = runningGeneration();
        doThrow(new IllegalStateException("base indisponible")).when(repository).markFailed(eq(id), anyString());
        ProjectGenerator generator = mock(ProjectGenerator.class);
        when(generator.generate(org.mockito.ArgumentMatchers.any(), anyString())).thenThrow(new OutOfMemoryError("test"));

        assertThatThrownBy(() -> generationService(repository, generator).run(id)).isInstanceOf(OutOfMemoryError.class);
    }

    @Test
    void anOrdinaryExceptionStillMarksTheGenerationFailedWithoutRethrowing() {
        GenerationRepository repository = runningGeneration();
        ProjectGenerator generator = mock(ProjectGenerator.class);
        when(generator.generate(org.mockito.ArgumentMatchers.any(), anyString())).thenThrow(new IllegalStateException("bug"));

        generationService(repository, generator).run(id);

        verify(repository).markFailed(eq(id), contains("erreur interne"));
    }

    // ------------------------------------------------------------------ Envoi sur GitHub

    private PublicationService publicationService(GenerationService generations, GenerationRepository repository, GithubRepoClient github,
            AuditService audit) {
        return new PublicationService(generations, repository, github, audit, mock(ExecutorService.class));
    }

    @Test
    void aSevereErrorDuringAPushMarksItFailedAndIsRethrown() {
        GenerationRepository repository = mock(GenerationRepository.class);
        when(repository.find(id)).thenReturn(Optional.of(row("DONE", "RUNNING")));
        when(repository.files(id)).thenReturn(Optional.of(Map.of("README.md", "x")));
        GithubRepoClient github = mock(GithubRepoClient.class);
        when(github.account(anyString())).thenThrow(new StackOverflowError("test"));

        assertThatThrownBy(() -> publicationService(null, repository, github, null).runPush(id, "demo", false, "jeton"))
                .isInstanceOf(StackOverflowError.class);

        verify(repository).pushFailed(eq(id), contains("erreur grave"), anyList());
    }

    @Test
    void aFailureStartingAPushLeavesItFailedNotRunningForever() {
        GenerationService generations = mock(GenerationService.class);
        GenerationRepository repository = mock(GenerationRepository.class);
        when(generations.rowForWrite(id)).thenReturn(row("DONE", null));
        when(repository.claimPush(id)).thenReturn(true);
        AuditService audit = mock(AuditService.class);
        doThrow(new IllegalStateException("journal d'audit en panne")).when(audit).record(org.mockito.ArgumentMatchers.any(), anyString(), anyString(), anyString());
        CurrentUser user = new CurrentUser(UUID.randomUUID(), "octocat", "Octo", null, false, null);

        assertThatThrownBy(() -> publicationService(generations, repository, mock(GithubRepoClient.class), audit)
                .push(user, id, "demo", false, Optional.of("jeton")))
                .isInstanceOf(IllegalStateException.class);

        verify(repository).pushFailed(eq(id), contains("n'a pas pu démarrer"), anyList());
    }

    // ------------------------------------------------------------------ Lancement d'un déploiement

    private DeploymentService deploymentService(DeploymentRepository repository, GithubRepoClient github) {
        return new DeploymentService(mock(GenerationService.class), repository, github, null, null, null, mock(ExecutorService.class), 1, 0);
    }

    @Test
    void aSevereErrorLaunchingADeploymentMarksItFailedAndIsRethrown() {
        DeploymentRepository repository = mock(DeploymentRepository.class);
        GithubRepoClient github = mock(GithubRepoClient.class);
        when(github.findRepository(anyString(), anyString())).thenThrow(new StackOverflowError("test"));

        assertThatThrownBy(() -> deploymentService(repository, github).runDispatch(id, "octocat/demo", "jeton"))
                .isInstanceOf(StackOverflowError.class);

        verify(repository).finish(eq(id), eq("FAILED"), contains("erreur grave"));
        verify(repository, never()).running(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), anyString());
    }

    @Test
    void theOriginalErrorIsTheOneThatIsThrown() {
        DeploymentRepository repository = mock(DeploymentRepository.class);
        doThrow(new IllegalStateException("base indisponible")).when(repository).finish(eq(id), eq("FAILED"), anyString());
        GithubRepoClient github = mock(GithubRepoClient.class);
        when(github.findRepository(anyString(), anyString())).thenThrow(new OutOfMemoryError("test"));

        Throwable thrown = org.assertj.core.api.Assertions.catchThrowable(() -> deploymentService(repository, github).runDispatch(id, "octocat/demo", "jeton"));

        assertThat(thrown).isInstanceOf(OutOfMemoryError.class);
    }
}
