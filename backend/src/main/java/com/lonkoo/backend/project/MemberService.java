package com.lonkoo.backend.project;

import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.model.Role;
import com.lonkoo.backend.realtime.RealtimeSnapshotClient;
import com.lonkoo.backend.support.AuditService;
import com.lonkoo.backend.web.ConflictException;
import com.lonkoo.backend.web.ForbiddenException;
import com.lonkoo.backend.web.MemberResponse;
import com.lonkoo.backend.web.NotFoundException;

/**
 * Membres d'un projet : liste, retrait d'un membre par un rôle plus élevé, départ volontaire.
 *
 * <p>Règles : tout membre voit la liste ; il faut être MAINTAINER ou plus pour retirer quelqu'un, et seulement
 * quelqu'un de strictement moins haut placé (un MAINTAINER ne retire ni un autre MAINTAINER ni le propriétaire) ;
 * tout membre sauf le propriétaire peut partir. Un non-membre reçoit un 404, comme pour le reste du projet.</p>
 */
@Service
public class MemberService {

    private static final Logger log = LoggerFactory.getLogger(MemberService.class);

    private final JdbcClient jdbcClient;
    private final AuditService auditService;
    private final RealtimeSnapshotClient realtimeSnapshotClient;
    private final TransactionTemplate transactions;

    public MemberService(JdbcClient jdbcClient, AuditService auditService,
            RealtimeSnapshotClient realtimeSnapshotClient, TransactionTemplate transactions) {
        this.jdbcClient = jdbcClient;
        this.auditService = auditService;
        this.realtimeSnapshotClient = realtimeSnapshotClient;
        this.transactions = transactions;
    }

    public List<MemberResponse> list(CurrentUser user, UUID projectId) {
        Role mine = roleOf(user.id(), projectId)
                .orElseThrow(() -> new NotFoundException("Projet introuvable ou non visible"));
        return jdbcClient.sql("""
                select u.id, u.display_name, u.login, u.avatar_url, u.is_guest, pm.role, pm.created_at
                from project_members pm
                join users u on u.id = pm.user_id
                where pm.project_id = ?
                """)
                .param(projectId)
                .query((rs, rowNum) -> {
                    UUID id = rs.getObject("id", UUID.class);
                    Role role = Role.valueOf(rs.getString("role"));
                    boolean you = id.equals(user.id());
                    return new MemberResponse(id, rs.getString("display_name"), rs.getString("login"),
                            rs.getString("avatar_url"), rs.getBoolean("is_guest"), role.name(),
                            rs.getObject("created_at", OffsetDateTime.class).toInstant(), you,
                            canRemove(mine, role, you));
                })
                .list()
                .stream()
                .sorted(Comparator.comparing((MemberResponse m) -> Role.valueOf(m.role()))
                        .thenComparing(MemberResponse::joinedAt))
                .toList();
    }

    /**
     * Retire {@code memberId} du projet ; si c'est l'appelant lui-même, il quitte le projet. La règle est relue
     * dans la transaction, sur les lignes verrouillées, pour qu'un changement de rôle simultané ne la contourne pas.
     */
    public void remove(CurrentUser user, UUID projectId, UUID memberId) {
        boolean self = memberId.equals(user.id());
        transactions.executeWithoutResult(status -> {
            Role mine = lockRole(user.id(), projectId)
                    .orElseThrow(() -> new NotFoundException("Projet introuvable ou non visible"));
            if (!self && !mine.atLeast(Role.MAINTAINER)) {
                throw new ForbiddenException("Rôle insuffisant : " + mine);
            }
            if (self && mine == Role.OWNER) {
                throw new ConflictException("Le propriétaire ne peut pas quitter son projet : supprimez-le à la place.");
            }
            Role target = self ? mine
                    : lockRole(memberId, projectId).orElseThrow(() -> new NotFoundException("Membre introuvable"));
            if (!canRemove(mine, target, self)) {
                throw new ForbiddenException("Un " + mine + " ne peut pas retirer un " + target);
            }

            int deleted = jdbcClient.sql("delete from project_members where project_id = ? and user_id = ?")
                    .param(projectId)
                    .param(memberId)
                    .update();
            if (deleted == 0) {
                throw new NotFoundException("Membre introuvable");
            }
            auditService.record(user.id(), self ? "member.left" : "member.removed", "project:" + projectId,
                    "{\"userId\":\"" + memberId + "\",\"role\":\"" + target + "\"}");
        });

        closeConnections(projectId, memberId);
    }

    private static boolean canRemove(Role mine, Role target, boolean self) {
        if (self) {
            return target != Role.OWNER;
        }
        return mine.atLeast(Role.MAINTAINER) && mine.isAbove(target);
    }

    private Optional<Role> roleOf(UUID userId, UUID projectId) {
        return jdbcClient.sql("select role from project_members where project_id = ? and user_id = ?")
                .param(projectId)
                .param(userId)
                .query(String.class)
                .optional()
                .map(Role::valueOf);
    }

    private Optional<Role> lockRole(UUID userId, UUID projectId) {
        return jdbcClient.sql("select role from project_members where project_id = ? and user_id = ? for update")
                .param(projectId)
                .param(userId)
                .query(String.class)
                .optional()
                .map(Role::valueOf);
    }

    /**
     * Le retrait est déjà fait en base (un nouveau ticket de connexion est refusé dès maintenant) ; ceci coupe les
     * connexions déjà ouvertes de cette personne, et fait refuser par le serveur temps réel les tickets qu'elle
     * détient encore (5 minutes de validité). Les autres membres ne sont pas touchés.
     * Une panne du temps réel ne défait pas le retrait : le journal le signale, et le serveur temps réel revérifie de
     * lui-même les accès de toutes les connexions ouvertes (toutes les 30 secondes) et coupe celle-ci à la prochaine
     * vérification. Un ticket encore valable ne rouvre alors un accès que le temps d'une vérification.
     */
    private void closeConnections(UUID projectId, UUID memberId) {
        List<UUID> canvasIds = jdbcClient.sql("select id from canvases where project_id = ?")
                .param(projectId)
                .query(UUID.class)
                .list();
        for (UUID canvasId : canvasIds) {
            try {
                realtimeSnapshotClient.closeConnections(canvasId, memberId);
            } catch (RuntimeException e) {
                log.warn("Membre retiré, mais ses connexions au canvas {} n'ont pas pu être fermées : {}",
                        canvasId, e.getMessage());
            }
        }
    }
}
