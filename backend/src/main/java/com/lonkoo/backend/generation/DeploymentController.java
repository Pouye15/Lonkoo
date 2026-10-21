package com.lonkoo.backend.generation;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lonkoo.backend.security.GithubSession;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Déploiement d'un projet généré (lot R8) : {@code POST /generations/{id}/deploy} (202),
 * {@code GET /generations/{id}/deployments}, {@code GET /deployments/{id}} (rafraîchi depuis GitHub tant qu'il est en cours).
 */
@RestController
@RequestMapping("/api")
class DeploymentController {

    /** Corps facultatif : {@code auto} (LONKOO lance le workflow, par défaut) ou {@code manual} (étapes à suivre soi-même). */
    record DeployRequest(
            @Pattern(regexp = "auto|manual", message = "doit valoir auto ou manual") String mode,
            @Size(max = 200) String publicUrl) {
    }

    private final DeploymentService service;
    private final GithubSession githubSession;

    DeploymentController(DeploymentService service, GithubSession githubSession) {
        this.service = service;
        this.githubSession = githubSession;
    }

    @PostMapping("/generations/{generationId}/deploy")
    ResponseEntity<DeploymentResponse> deploy(Authentication auth, @PathVariable UUID generationId,
            @Valid @RequestBody(required = false) DeployRequest request) {
        DeployRequest body = request == null ? new DeployRequest(null, null) : request;
        DeploymentResponse deployment = service.deploy(GenerationController.currentUser(auth), generationId,
                "manual".equals(body.mode()), body.publicUrl(), githubSession.token());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(deployment);
    }

    @GetMapping("/generations/{generationId}/deployments")
    List<DeploymentResponse> list(@PathVariable UUID generationId) {
        return service.list(generationId);
    }

    @GetMapping("/deployments/{deploymentId}")
    DeploymentResponse get(@PathVariable UUID deploymentId) {
        return service.get(deploymentId, githubSession.token());
    }
}
