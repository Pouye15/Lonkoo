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

    /**
     * Contrôle l'accès en lecture (tous les rôles). Un projet public se lit en lecture seule (rôle READ) pour toute
     * personne connectée qui n'en est pas membre : un membre garde son propre rôle, même plus haut.
     */
    public CanvasAccess requireRead(UUID canvasId) {
        return accessOf(canvasId, true);
    }

    /**
     * Contrôle l'accès en lecture réservé aux membres : ce que la publication d'un projet ne rend pas public (projets
     * générés, dépôt GitHub et déploiements, dont les noms ne doivent pas fuir d'un projet « public »).
     */
    public CanvasAccess requireMemberRead(UUID canvasId) {
        return accessOf(canvasId, false);
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
     * Lit le rôle de l'utilisateur courant sur le canvas, ou lève un 404. Avec {@code publicRead}, un projet public
     * donne le rôle READ à qui n'en est pas membre.
     */
    private CanvasAccess accessOf(UUID canvasId, boolean publicRead) {
        CurrentUser user = currentUser();
        String roleName = jdbcClient.sql("""
                select coalesce(pm.role, case when ? and p.visibility = 'public' then 'READ' end)
                from canvases c
                join projects p on p.id = c.project_id
                left join project_members pm on pm.project_id = c.project_id and pm.user_id = ?
                where c.id = ?
                """)
                .param(publicRead)
                .param(user.id())
                .param(canvasId)
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