package com.lonkoo.backend.support;

import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Supprime quotidiennement les invités expirés et les liens de partage périmés. La suppression en cascade
 * (clés étrangères des projets, membres, canvas) est gérée par la base.
 *
 * <p>Un projet que l'invité avait partagé ne disparaît pas avec lui : avant la suppression, il passe au membre
 * restant qui n'expire pas lui-même (un compte GitHub avant un autre invité, puis le rôle le plus élevé, puis le
 * plus ancien), qui en devient propriétaire. Sans cela, un jury qui essaie Lonkoo en invité et partage son canvas à
 * un collègue lui retirerait le projet vingt-quatre heures plus tard. Un projet sans autre membre est supprimé.</p>
 */
@Component
public class GuestCleanupTask {

    private static final Logger log = LoggerFactory.getLogger(GuestCleanupTask.class);

    /**
     * Pour chaque projet dont le propriétaire expire : l'héritier est le membre restant (qui n'expire pas) en tête
     * de l'ordre « compte durable d'abord, rôle le plus élevé, plus ancien membre ». Il devient OWNER du projet.
     */
    private static final String TRANSFER = """
            with expiring as (
                select id from users where is_guest and expires_at is not null and expires_at < now()
            ), heirs as (
                select distinct on (p.id) p.id as project_id, pm.user_id
                from projects p
                join project_members pm on pm.project_id = p.id
                join users u on u.id = pm.user_id
                where p.owner_id in (select id from expiring)
                  and pm.user_id not in (select id from expiring)
                order by p.id, u.is_guest,
                         array_position(array['OWNER','MAINTAINER','WRITE','TRIAGE','READ'], pm.role::text),
                         pm.created_at, pm.user_id
            ), promoted as (
                update project_members m set role = 'OWNER'
                from heirs h
                where m.project_id = h.project_id and m.user_id = h.user_id
                returning m.project_id
            )
            update projects p set owner_id = h.user_id, updated_at = now()
            from heirs h
            where p.id = h.project_id
            returning p.id as project_id, h.user_id as new_owner
            """;

    private record Transfer(UUID projectId, UUID newOwner) {
    }

    private final JdbcClient jdbcClient;
    private final TransactionTemplate transactions;
    private final AuditService auditService;

    public GuestCleanupTask(JdbcClient jdbcClient, TransactionTemplate transactions, AuditService auditService) {
        this.jdbcClient = jdbcClient;
        this.transactions = transactions;
        this.auditService = auditService;
    }

    @Scheduled(cron = "${lonkoo.guest-cleanup-cron:0 15 3 * * *}")
    public void purgeExpired() {
        // Une seule transaction : un projet n'est jamais « transmis » sans que la suppression suive, ni l'inverse.
        int[] counts = transactions.execute(status -> {
            List<Transfer> transfers = jdbcClient.sql(TRANSFER)
                    .query((rs, rowNum) -> new Transfer(rs.getObject("project_id", UUID.class), rs.getObject("new_owner", UUID.class)))
                    .list();
            for (Transfer transfer : transfers) {
                auditService.record(null, "project.ownership_transferred", "project:" + transfer.projectId(),
                        "{\"reason\":\"guest_expired\",\"newOwner\":\"" + transfer.newOwner() + "\"}");
            }
            int guests = jdbcClient.sql(
                    "delete from users where is_guest and expires_at is not null and expires_at < now()")
                    .update();
            int links = jdbcClient.sql("delete from share_links where expires_at < now()").update();
            return new int[] { guests, links, transfers.size() };
        });
        if (counts != null && (counts[0] > 0 || counts[1] > 0)) {
            log.info("Purge : {} invités expirés ({} projets transmis à un autre membre), {} liens de partage périmés",
                    counts[0], counts[2], counts[1]);
        }
    }
}
