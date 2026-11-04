package com.lonkoo.backend.canvas;

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

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.realtime.RealtimeSnapshotClient;
import com.lonkoo.backend.web.CanvasVersionResponse;
import com.lonkoo.backend.web.CreateVersionRequest;
import com.lonkoo.backend.web.ForbiddenException;

import jakarta.validation.Valid;
import tools.jackson.databind.JsonNode;

/**
 * Versions nommées d'un canvas (WP7) : listage, création, détail, restauration
 * et instantané courant (export / générateur / IA).
 */
@RestController
@RequestMapping("/api")
public class CanvasVersionController {

    private final CanvasVersionService versionService;
    private final CanvasAccessService canvasAccessService;
    private final RealtimeSnapshotClient realtimeSnapshotClient;

    public CanvasVersionController(CanvasVersionService versionService, CanvasAccessService canvasAccessService,
            RealtimeSnapshotClient realtimeSnapshotClient) {
        this.versionService = versionService;
        this.canvasAccessService = canvasAccessService;
        this.realtimeSnapshotClient = realtimeSnapshotClient;
    }

    @GetMapping("/canvases/{canvasId}/versions")
    List<CanvasVersionListResponse> list(Authentication auth, @PathVariable UUID canvasId) {
        return versionService.list(currentUser(auth), canvasId).stream()
                .map(CanvasVersionListResponse::from)
                .toList();
    }

    @PostMapping("/canvases/{canvasId}/versions")
    ResponseEntity<CanvasVersionListResponse> create(
            Authentication auth,
            @PathVariable UUID canvasId,
            @Valid @RequestBody CreateVersionRequest request) {
        var version = versionService.create(currentUser(auth), canvasId, request.name(), request.message());
        return ResponseEntity.status(HttpStatus.CREATED).body(CanvasVersionListResponse.from(version));
    }

    @GetMapping("/canvases/{canvasId}/versions/{versionId}")
    CanvasVersionResponse detail(Authentication auth, @PathVariable UUID canvasId, @PathVariable UUID versionId) {
        var detail = versionService.detail(currentUser(auth), canvasId, versionId);
        var v = detail.version();
        return new CanvasVersionResponse(v.id(), v.canvasId(), v.name(), v.message(),
                v.schemaVersion(), v.authorId(), v.createdAt(), detail.snapshot());
    }

    @PostMapping("/canvases/{canvasId}/versions/{versionId}/restore")
    ResponseEntity<Void> restore(Authentication auth, @PathVariable UUID canvasId, @PathVariable UUID versionId) {
        versionService.restore(currentUser(auth), canvasId, versionId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/canvases/{canvasId}/snapshot")
    ResponseEntity<JsonNode> snapshot(Authentication auth, @PathVariable UUID canvasId) {
        // Contrôle d'accès unique (404 si non visible, pas 403).
        canvasAccessService.requireRead(canvasId);
        return ResponseEntity.ok(realtimeSnapshotClient.snapshot(canvasId));
    }

    private CurrentUser currentUser(Authentication auth) {
        if (auth != null && auth.getPrincipal() instanceof CurrentUser user) {
            return user;
        }
        throw new ForbiddenException("Non authentifié");
    }

    /** Vue liste d'une version (sans instantané). */
    record CanvasVersionListResponse(
            UUID id,
            String name,
            String message,
            int schemaVersion,
            UUID authorId,
            java.time.Instant createdAt) {

        static CanvasVersionListResponse from(CanvasVersion v) {
            return new CanvasVersionListResponse(v.id(), v.name(), v.message(), v.schemaVersion(), v.authorId(), v.createdAt());
        }
    }
}