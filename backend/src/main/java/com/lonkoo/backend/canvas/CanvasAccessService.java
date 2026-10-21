package com.lonkoo.backend.canvas;

import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.model.Role;
import com.lonkoo.backend.web.ForbiddenException;
import com.lonkoo.backend.web.NotFoundException;

/**
 * Service unique de contrôle d'accès aux canvas. Toute route, tout ticket
 * temps réel et tout futur appel IA passe par ici (décision d'architecture).
 * Un utilisateur sans accès reçoit un 404, pas un 403, pour ne pas révéler
 * l'existence du canvas.
 */
@Service
public class CanvasAccessService {

    private final JdbcClient jdbcClient;

    public CanvasAccessService(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    /** Contrôle l'accès en lecture (tous les rôles). */
    public CanvasAccess requireRead(UUID canvasId) {
        CanvasAccess access = accessOf(canvasId);
        return access;
    }

    /** Contrôle l'accès en écriture (WRITE et plus). */
    public CanvasAccess requireWrite(UUID canvasId) {
        CanvasAccess access = requireRead(canvasId);
        if (!access.canWrite()) {
            throw new ForbiddenException("Lecture seule : rôle " + access.role());
        }
        return access;
    }

    /** Contrôle la gestion des membres (MAINTAINER et plus). */
    public CanvasAccess requireManageMembers(UUID canvasId) {
        CanvasAccess access = requireRead(canvasId);
        if (!access.canManageMembers()) {
            throw new ForbiddenException("Rôle insuffisant : " + access.role());
        }
        return access;
    }

    /**
     * Lit le rôle de l'utilisateur courant sur le canvas, ou lève un 404.
     */
    private CanvasAccess accessOf(UUID canvasId) {
        CurrentUser user = currentUser();
        String roleName = jdbcClient.sql("""
                select pm.role
                from canvases c
                join project_members pm on pm.project_id = c.project_id
                where c.id = ? and pm.user_id = ?
                """)
                .param(canvasId)
                .param(user.id())
                .query(String.class)
                .optional()
                .orElseThrow(() -> new NotFoundException("Canvas introuvable ou non visible"));

        return new CanvasAccess(canvasId, Role.valueOf(roleName));
    }

    private CurrentUser currentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof CurrentUser user) {
            return user;
        }
        throw new ForbiddenException("Non authentifié");
    }
}