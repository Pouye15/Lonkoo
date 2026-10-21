package com.lonkoo.backend.project;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.lonkoo.backend.canvas.CanvasAccessService;
import com.lonkoo.backend.model.Canvas;
import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.model.Project;
import com.lonkoo.backend.model.Role;
import com.lonkoo.backend.realtime.RealtimeSnapshotClient;
import com.lonkoo.backend.support.AuditService;
import com.lonkoo.backend.web.BadRequestException;
import com.lonkoo.backend.web.CanvasResponse;
import com.lonkoo.backend.web.CreateProjectRequest;
import com.lonkoo.backend.web.ForbiddenException;
import com.lonkoo.backend.web.NotFoundException;
import com.lonkoo.backend.web.PatchProjectRequest;
import com.lonkoo.backend.web.ProjectResponse;

/**
 * Projets, canvas et contrôle d'appartenance. Les accès aux canvas sont par
 * ailleurs délégués à {@link CanvasAccessService} (service unique).
 */
@Service
public class ProjectService {

    private static final Logger log = LoggerFactory.getLogger(ProjectService.class);

    private static final RowMapper<Project> PROJECT_MAPPER = (rs, rowNum) -> new Project(
            rs.getObject("id", UUID.class),
            rs.getString("name"),
            rs.getString("description"),
            rs.getString("visibility"),
            rs.getObject("owner_id", UUID.class),
            rs.getObject("created_at", OffsetDateTime.class).toInstant(),
            rs.getObject("updated_at", OffsetDateTime.class).toInstant());

    private static final RowMapper<Canvas> CANVAS_MAPPER = (rs, rowNum) -> new Canvas(
            rs.getObject("id", UUID.class),
            rs.getObject("project_id", UUID.class),
            rs.getString("name"),
            rs.getObject("created_at", OffsetDateTime.class).toInstant());

    private final JdbcClient jdbcClient;
    private final CanvasAccessService canvasAccessService;
    private final AuditService auditService;
    private final RealtimeSnapshotClient realtimeSnapshotClient;
    private final TransactionTemplate transactions;

    public ProjectService(JdbcClient jdbcClient, CanvasAccessService canvasAccessService, AuditService auditService,
            RealtimeSnapshotClient realtimeSnapshotClient, TransactionTemplate transactions) {
        this.jdbcClient = jdbcClient;
        this.canvasAccessService = canvasAccessService;
        this.auditService = auditService;
        this.realtimeSnapshotClient = realtimeSnapshotClient;
        this.transactions = transactions;
    }

    public List<ProjectResponse> listProjects(CurrentUser user) {
        return jdbcClient.sql("""
                select p.*
                from projects p
                join project_members pm on pm.project_id = p.id
                where pm.user_id = ?
                order by p.updated_at desc
                """)
                .param(user.id())
                .query(PROJECT_MAPPER)
                .list()
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public ProjectResponse createProject(CurrentUser user, CreateProjectRequest request) {
        UUID projectId = UUID.randomUUID();
        UUID canvasId = UUID.randomUUID();
        String visibility = normalizeVisibility(request.visibility());

        jdbcClient.sql("""
                insert into projects (id, name, description, visibility, owner_id)
                values (?, ?, ?, ?, ?)
                """)
                .param(projectId)
                .param(request.name())
                .param(request.description())
                .param(visibility)
                .param(user.id())
                .update();

        jdbcClient.sql("""
                insert into project_members (project_id, user_id, role)
                values (?, ?, 'OWNER')
                """)
                .param(projectId)
                .param(user.id())
                .update();

        jdbcClient.sql("""
                insert into canvases (id, project_id, name)
                values (?, ?, 'Architecture')
                """)
                .param(canvasId)
                .param(projectId)
                .update();

        auditService.record(user.id(), "project.created", "project:" + projectId, null);

        return toResponse(requireProject(projectId));
    }

    public ProjectResponse getProject(CurrentUser user, UUID projectId) {
        requireMember(user.id(), projectId);
        return toResponse(requireProject(projectId));
    }

    @Transactional
    public ProjectResponse patchProject(CurrentUser user, UUID projectId, PatchProjectRequest request) {
        requireManager(user.id(), projectId);

        // Champ absent (null) = inchangé.
        String name = request.name();
        String description = request.description();
        String visibility = request.visibility() != null ? normalizeVisibility(request.visibility()) : null;

        jdbcClient.sql("""
                update projects
                set name = coalesce(?, name),
                    description = coalesce(?, description),
                    visibility = coalesce(?, visibility),
                    updated_at = now()
                where id = ?
                """)
                .param(name)
                .param(description)
                .param(visibility)
                .param(projectId)
                .update();

        // Une ligne de journal par nature de changement (valeurs de l'énumération, jamais de texte libre).
        if (visibility != null) {
            auditService.record(user.id(), "project.visibility", "project:" + projectId,
                    "{\"visibility\":\"" + visibility + "\"}");
        }
        if (name != null || description != null) {
            auditService.record(user.id(), "project.updated", "project:" + projectId, null);
        }
        return toResponse(requireProject(projectId));
    }

    /**
     * Supprime le projet, puis déconnecte ceux qui éditaient encore ses canvas. La suppression est
     * transactionnelle ; l'appel au serveur temps réel vient après, hors transaction, et ne fait jamais
     * échouer la suppression (les connexions restantes ne pourront de toute façon plus rien enregistrer).
     */
    public void deleteProject(CurrentUser user, UUID projectId) {
        requireOwner(user.id(), projectId);
        List<UUID> canvasIds = jdbcClient.sql("select id from canvases where project_id = ?")
                .param(projectId)
                .query(UUID.class)
                .list();

        transactions.executeWithoutResult(status -> {
            jdbcClient.sql("delete from projects where id = ?")
                    .param(projectId)
                    .update();
            auditService.record(user.id(), "project.deleted", "project:" + projectId, null);
        });

        for (UUID canvasId : canvasIds) {
            try {
                realtimeSnapshotClient.closeConnections(canvasId);
            } catch (RuntimeException e) {
                log.warn("Projet supprimé, mais les connexions du canvas {} n'ont pas pu être fermées : {}",
                        canvasId, e.getMessage());
            }
        }
    }

    public List<CanvasResponse> listCanvases(CurrentUser user, UUID projectId) {
        Role role = requireMember(user.id(), projectId);
        return jdbcClient.sql("select * from canvases where project_id = ? order by created_at")
                .param(projectId)
                .query(CANVAS_MAPPER)
                .list()
                .stream()
                .map(c -> new CanvasResponse(c.id(), c.projectId(), c.name(), c.createdAt(), role.name()))
                .toList();
    }

    @Transactional
    public CanvasResponse createCanvas(CurrentUser user, UUID projectId, String name) {
        requireWriter(user.id(), projectId);
        UUID canvasId = UUID.randomUUID();

        jdbcClient.sql("""
                insert into canvases (id, project_id, name)
                values (?, ?, ?)
                """)
                .param(canvasId)
                .param(projectId)
                .param(name)
                .update();

        Canvas canvas = jdbcClient.sql("select * from canvases where id = ?")
                .param(canvasId)
                .query(CANVAS_MAPPER)
                .single();

        Role role = requireMember(user.id(), projectId);
        return new CanvasResponse(canvas.id(), canvas.projectId(), canvas.name(), canvas.createdAt(), role.name());
    }

    public CanvasResponse getCanvas(CurrentUser user, UUID canvasId) {
        var access = canvasAccessService.requireRead(canvasId);
        Canvas canvas = jdbcClient.sql("select * from canvases where id = ?")
                .param(canvasId)
                .query(CANVAS_MAPPER)
                .optional()
                .orElseThrow(() -> new NotFoundException("Canvas introuvable"));
        return new CanvasResponse(canvas.id(), canvas.projectId(), canvas.name(), canvas.createdAt(), access.role().name());
    }

    private Project requireProject(UUID projectId) {
        return jdbcClient.sql("select * from projects where id = ?")
                .param(projectId)
                .query(PROJECT_MAPPER)
                .optional()
                .orElseThrow(() -> new NotFoundException("Projet introuvable"));
    }

    private Role requireMember(UUID userId, UUID projectId) {
        return jdbcClient.sql("select role from project_members where project_id = ? and user_id = ?")
                .param(projectId)
                .param(userId)
                .query(String.class)
                .optional()
                .map(Role::valueOf)
                .orElseThrow(() -> new NotFoundException("Projet introuvable ou non visible"));
    }

    private Role requireWriter(UUID userId, UUID projectId) {
        Role role = requireMember(userId, projectId);
        if (!role.atLeast(Role.WRITE)) {
            throw new ForbiddenException("Écriture refusée : rôle " + role);
        }
        return role;
    }

    private Role requireManager(UUID userId, UUID projectId) {
        Role role = requireMember(userId, projectId);
        if (!role.atLeast(Role.MAINTAINER)) {
            throw new ForbiddenException("Gestion refusée : rôle " + role);
        }
        return role;
    }

    private Role requireOwner(UUID userId, UUID projectId) {
        Role role = requireMember(userId, projectId);
        if (role != Role.OWNER) {
            throw new ForbiddenException("Suppression refusée : rôle " + role);
        }
        return role;
    }

    private String normalizeVisibility(String visibility) {
        if (visibility == null || visibility.isBlank()) {
            return "private";
        }
        if (!visibility.equals("private") && !visibility.equals("public")) {
            throw new BadRequestException("Visibilité invalide : " + visibility);
        }
        return visibility;
    }

    private ProjectResponse toResponse(Project p) {
        return new ProjectResponse(p.id(), p.name(), p.description(), p.visibility(),
                p.ownerId(), p.createdAt(), p.updatedAt());
    }
}