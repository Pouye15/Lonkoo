package com.lonkoo.backend.generation;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lonkoo.backend.security.GithubSession;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;

/**
 * Publication d'un projet généré (lot R8) : {@code POST /generations/{id}/push-github} (202). Le jeton GitHub est lu
 * dans la session de la requête et passé au travail asynchrone ; il ne quitte jamais la mémoire du serveur.
 */
@RestController
@RequestMapping("/api")
class PublicationController {

    /** Corps facultatif : nom du dépôt (par défaut le nom de dossier du projet) et visibilité (publique par défaut). */
    record PushRequest(
            @Pattern(regexp = "[A-Za-z0-9._-]{1,100}", message = "lettres, chiffres, point, tiret et tiret bas, 100 caractères au plus") String repoName,
            @Pattern(regexp = "public|private", message = "doit valoir public ou private") String visibility) {
    }

    private final PublicationService service;
    private final GithubSession githubSession;

    PublicationController(PublicationService service, GithubSession githubSession) {
        this.service = service;
        this.githubSession = githubSession;
    }

    @PostMapping("/generations/{generationId}/push-github")
    ResponseEntity<GenerationResponse> push(Authentication auth, @PathVariable UUID generationId,
            @Valid @RequestBody(required = false) PushRequest request) {
        PushRequest body = request == null ? new PushRequest(null, null) : request;
        GenerationResponse state = service.push(GenerationController.currentUser(auth), generationId, body.repoName(),
                "private".equals(body.visibility()), githubSession.token());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(state);
    }
}
