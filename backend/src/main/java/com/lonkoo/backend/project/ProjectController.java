package com.lonkoo.backend.project;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.web.CanvasResponse;
import com.lonkoo.backend.web.CreateProjectRequest;
import com.lonkoo.backend.web.ForbiddenException;
import com.lonkoo.backend.web.PatchProjectRequest;
import com.lonkoo.backend.web.ProjectResponse;

import jakarta.validation.Valid;

/**
 * Routes projets et canvas (WP5).
 */
@RestController
@RequestMapping("/api")
public class ProjectController {

    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @GetMapping("/projects")
    List<ProjectResponse> list(Authentication authentication) {
        return projectService.listProjects(currentUser(authentication));
    }

    @PostMapping("/projects")
    ResponseEntity<ProjectResponse> create(Authentication authentication, @Valid @RequestBody CreateProjectRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(projectService.createProject(currentUser(authentication), request));
    }

    @GetMapping("/projects/{projectId}")
    ProjectResponse get(Authentication authentication, @PathVariable UUID projectId) {
        return projectService.getProject(currentUser(authentication), projectId);
    }

    @PatchMapping("/projects/{projectId}")
    ProjectResponse patch(Authentication authentication, @PathVariable UUID projectId,
            @Valid @RequestBody PatchProjectRequest request) {
        return projectService.patchProject(currentUser(authentication), projectId, request);
    }

    @DeleteMapping("/projects/{projectId}")
    ResponseEntity<Void> delete(Authentication authentication, @PathVariable UUID projectId) {
        projectService.deleteProject(currentUser(authentication), projectId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/projects/{projectId}/canvases")
    List<CanvasResponse> canvasList(Authentication authentication, @PathVariable UUID projectId) {
        return projectService.listCanvases(currentUser(authentication), projectId);
    }

    @PostMapping("/projects/{projectId}/canvases")
    ResponseEntity<CanvasResponse> canvasCreate(Authentication authentication, @PathVariable UUID projectId,
            @RequestBody CreateCanvasRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(projectService.createCanvas(currentUser(authentication), projectId, request.name()));
    }

    @GetMapping("/canvases/{canvasId}")
    CanvasResponse canvasGet(Authentication authentication, @PathVariable UUID canvasId) {
        return projectService.getCanvas(currentUser(authentication), canvasId);
    }

    private CurrentUser currentUser(Authentication authentication) {
        if (authentication != null && authentication.getPrincipal() instanceof CurrentUser user) {
            return user;
        }
        throw new ForbiddenException("Non authentifié");
    }

    /** Corps minimal pour la création d'un canvas. */
    record CreateCanvasRequest(@jakarta.validation.constraints.NotBlank
            @jakarta.validation.constraints.Size(max = 80) String name) {
    }
}