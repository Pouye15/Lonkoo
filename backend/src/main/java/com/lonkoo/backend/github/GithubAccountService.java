package com.lonkoo.backend.github;

import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.model.GithubUser;
import com.lonkoo.backend.support.AuditService;

/**
 * Compte local d'un utilisateur GitHub : création ou mise à jour par {@code github_id}, et
 * rattachement de l'invité qui se connecte (ses projets, ses appartenances et ses versions passent
 * au compte GitHub, puis la ligne d'invité disparaît). Tout se fait dans une seule transaction, sans
 * aucun appel réseau.
 */
@Service
public class GithubAccountService {

    /** Du rôle le plus élevé au plus faible, comme {@code Role} ; la position sert à comparer. */
    private static final String ROLES = "array['OWNER','MAINTAINER','WRITE','TRIAGE','READ']";

    private final JdbcClient jdbcClient;
    private final AuditService auditService;

    public GithubAccountService(JdbcClient jdbcClient, AuditService auditService) {
        this.jdbcClient = jdbcClient;
        this.auditService = auditService;
    }

    /**
     * @param sessionUserId utilisateur de la session en cours avant la connexion (un invité à rattacher,
     *                      ou un autre compte, auquel cas rien n'est fusionné)
     */
    @Transactional
    public CurrentUser signIn(GithubUser github, Optional<UUID> sessionUserId) {
        // Écriture atomique : deux premières connexions simultanées du même compte ne se heurtent pas.
        UUID userId = jdbcClient.sql("""
                insert into users (id, github_id, login, display_name, avatar_url, is_guest)
                values (?, ?, ?, ?, ?, false)
                on conflict (github_id) do update
                set login = excluded.login, display_name = excluded.display_name, avatar_url = excluded.avatar_url
                returning id
                """)
                .param(UUID.randomUUID())
                .param(github.id())
                .param(github.login())
                .param(github.displayName())
                .param(github.avatarUrl())
                .query(UUID.class)
                .single();

        sessionUserId.filter(id -> !id.equals(userId)).ifPresent(guestId -> mergeGuest(guestId, userId));

        return new CurrentUser(userId, github.login(), github.displayName(), github.avatarUrl(), false, null);
    }

    private void mergeGuest(UUID guestId, UUID userId) {
        // Seul un invité est fusionné : un autre compte GitHub déjà connecté reste intact.
        int guests = jdbcClient.sql("select count(*) from users where id = ? and is_guest")
                .param(guestId).query(Integer.class).single();
        if (guests == 0) {
            return;
        }

        // Projets où les deux sont membres : le compte GitHub garde le rôle le plus élevé.
        jdbcClient.sql("update project_members gh set role = (" + ROLES + ")[least("
                + "array_position(" + ROLES + ", g.role::text), array_position(" + ROLES + ", gh.role::text))] "
                + "from project_members g where gh.user_id = ? and g.user_id = ? and gh.project_id = g.project_id")
                .param(userId).param(guestId).update();
        jdbcClient.sql("delete from project_members where user_id = ? "
                + "and project_id in (select project_id from project_members where user_id = ?)")
                .param(guestId).param(userId).update();

        jdbcClient.sql("update project_members set user_id = ? where user_id = ?").param(userId).param(guestId).update();
        jdbcClient.sql("update projects set owner_id = ? where owner_id = ?").param(userId).param(guestId).update();
        jdbcClient.sql("update canvas_versions set author_id = ? where author_id = ?").param(userId).param(guestId).update();
        jdbcClient.sql("update share_links set created_by = ? where created_by = ?").param(userId).param(guestId).update();
        // Qui a lancé une génération ou un déploiement : sans cela, la suppression de l'invité efface cette trace.
        jdbcClient.sql("update generations set requested_by = ? where requested_by = ?").param(userId).param(guestId).update();
        jdbcClient.sql("update deployments set requested_by = ? where requested_by = ?").param(userId).param(guestId).update();
        jdbcClient.sql("delete from users where id = ?").param(guestId).update();

        auditService.record(userId, "guest.merged", "user:" + guestId, null);
    }
}
