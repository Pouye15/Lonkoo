package com.lonkoo.backend.generation;

import java.util.List;
import java.util.UUID;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.web.ForbiddenException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Génération de projets (lot R8) :
 * {@code POST /canvases/{id}/generate} (202), {@code GET /canvases/{id}/generations},
 * {@code GET /generations/{id}}, {@code …/files?path=}, {@code …/download} (ZIP), {@code DELETE /generations/{id}}.
 * L'envoi sur GitHub et le déploiement sont dans {@link PublicationController}.
 */
@RestController
@RequestMapping("/api")
class GenerationController {

    /** Corps facultatif de {@code POST /canvases/{id}/generate}. */
    record GenerateRequest(
            UUID versionId,
            @Pattern(regexp = "spring-boot", message = "doit valoir spring-boot") String target,
            @Size(max = 80) String projectName) {
    }

    record Started(UUID generationId) {
    }

    private final GenerationService service;

    GenerationController(GenerationService service) {
        this.service = service;
    }

    @PostMapping("/canvases/{canvasId}/generate")
    ResponseEntity<Started> generate(Authentication auth, @PathVariable UUID canvasId,
            @Valid @RequestBody(required = false) GenerateRequest request) {
        GenerateRequest body = request == null ? new GenerateRequest(null, null, null) : request;
        UUID id = service.start(currentUser(auth), canvasId, body.versionId(), body.target(), body.projectName());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(new Started(id));
    }

    @GetMapping("/canvases/{canvasId}/generations")
    List<GenerationResponse> list(@PathVariable UUID canvasId) {
        return service.list(canvasId);
    }

    @GetMapping("/generations/{generationId}")
    GenerationResponse get(@PathVariable UUID generationId) {
        return service.get(generationId);
    }

    @GetMapping(value = "/generations/{generationId}/files", produces = MediaType.TEXT_PLAIN_VALUE)
    ResponseEntity<String> file(@PathVariable UUID generationId, @RequestParam String path) {
        return ResponseEntity.ok().contentType(new MediaType("text", "plain", java.nio.charset.StandardCharsets.UTF_8))
                .header("X-Content-Type-Options", "nosniff")
                .body(service.file(generationId, path));
    }

    @GetMapping("/generations/{generationId}/download")
    ResponseEntity<byte[]> download(@PathVariable UUID generationId) {
        GenerationResponse generation = service.get(generationId);
        byte[] zip = service.zip(generationId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/zip"))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(generation.slug() + ".zip").build().toString())
                .contentLength(zip.length)
                .body(zip);
    }

    @DeleteMapping("/generations/{generationId}")
    ResponseEntity<Void> delete(Authentication auth, @PathVariable UUID generationId) {
        service.delete(currentUser(auth), generationId);
        return ResponseEntity.noContent().build();
    }

    static CurrentUser currentUser(Authentication auth) {
        if (auth != null && auth.getPrincipal() instanceof CurrentUser user) {
            return user;
        }
        throw new ForbiddenException("Non authentifié");
    }
}
