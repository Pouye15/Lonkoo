package com.lonkoo.backend.project;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.web.BadRequestException;
import com.lonkoo.backend.web.MessageResponse;
import com.lonkoo.backend.web.NotFoundException;
import com.lonkoo.backend.web.TooManyRequestsException;

/**
 * Discussion d'un projet : un fil de messages en texte brut, lu et écrit par tous les membres, quel que soit leur rôle
 * (le rôle gouverne le canvas, pas la conversation). Un non-membre reçoit un 404, comme pour le reste du projet.
 *
 * <p>Garde-fous : 2 000 caractères par message, 20 messages par minute et par personne (429 avec {@code Retry-After}),
 * et les 1 000 derniers messages d'un projet seulement (les plus anciens sont élagués à l'envoi). Le texte est gardé
 * tel quel : c'est l'interface qui l'affiche sans l'interpréter.</p>
 */
@Service
public class DiscussionService {

    static final int DEFAULT_PAGE = 50;
    static final int MAX_PAGE = 100;
    static final int MAX_BODY_CHARS = 2000;
    private static final Duration RATE_WINDOW = Duration.ofMinutes(1);
    /** Début de l'identifiant des invités (voir GuestService). */
    private static final String GUEST_LOGIN_PREFIX = "invite-";

    private final JdbcClient jdbcClient;
    private final TransactionTemplate transactions;
    private final int messagesPerMinute;
    private final int messagesPerProject;

    public DiscussionService(
            JdbcClient jdbcClient,
            TransactionTemplate transactions,
            @Value("${lonkoo.limits.messages-per-minute:20}") int messagesPerMinute,
            @Value("${lonkoo.limits.messages-per-project:1000}") int messagesPerProject) {
        this.jdbcClient = jdbcClient;
        this.transactions = transactions;
        this.messagesPerMinute = messagesPerMinute;
        this.messagesPerProject = messagesPerProject;
    }

    /**
     * Les messages, du plus ancien au plus récent. Sans {@code after} : les {@code limit} derniers. Avec {@code after} :
     * ceux qui suivent cet identifiant (l'interface demande ainsi seulement ce qui est nouveau).
     */
    public List<MessageResponse> list(CurrentUser user, UUID projectId, Long after, Integer limit) {
        requireMember(user, projectId);
        int page = limit == null ? DEFAULT_PAGE : Math.min(Math.max(limit, 1), MAX_PAGE);
        if (after != null && after >= 0) {
            return jdbcClient.sql(SELECT + " where m.project_id = ? and m.id > ? order by m.id asc limit ?")
                    .param(user.id())
                    .param(projectId)
                    .param(after)
                    .param(page)
                    .query((rs, rowNum) -> toResponse(rs))
                    .list();
        }
        List<MessageResponse> latest = jdbcClient.sql(SELECT + " where m.project_id = ? order by m.id desc limit ?")
                .param(user.id())
                .param(projectId)
                .param(page)
                .query((rs, rowNum) -> toResponse(rs))
                .list();
        // Lus du plus récent au plus ancien pour garder les derniers ; rendus dans l'ordre de la conversation.
        List<MessageResponse> ordered = new ArrayList<>(latest);
        Collections.reverse(ordered);
        return ordered;
    }

    public MessageResponse post(CurrentUser user, UUID projectId, String body) {
        String text = body == null ? "" : body.strip();
        if (text.isEmpty()) {
            throw new BadRequestException("Le message est vide");
        }
        if (text.length() > MAX_BODY_CHARS) {
            throw new BadRequestException("Le message dépasse " + MAX_BODY_CHARS + " caractères");
        }
        return transactions.execute(status -> {
            requireMember(user, projectId);
            requireRoomToWrite(user);

            long id = jdbcClient.sql("""
                    insert into project_messages (project_id, user_id, author_name, body)
                    values (?, ?, ?, ?)
                    returning id
                    """)
                    .param(projectId)
                    .param(user.id())
                    .param(authorName(user))
                    .param(text)
                    .query(Long.class)
                    .single();
            prune(projectId);
            return jdbcClient.sql(SELECT + " where m.id = ?")
                    .param(user.id())
                    .param(id)
                    .query((rs, rowNum) -> toResponse(rs))
                    .single();
        });
    }

    private static final String SELECT = """
            select m.id, m.user_id, m.author_name, u.avatar_url, m.body, m.created_at, (m.user_id = ?) as mine
            from project_messages m
            left join users u on u.id = m.user_id
            """;

    private static MessageResponse toResponse(java.sql.ResultSet rs) throws java.sql.SQLException {
        Timestamp createdAt = rs.getTimestamp("created_at");
        return new MessageResponse(
                rs.getLong("id"),
                rs.getObject("user_id", UUID.class),
                rs.getString("author_name"),
                rs.getString("avatar_url"),
                rs.getString("body"),
                createdAt.toInstant(),
                rs.getBoolean("mine"));
    }

    private void requireMember(CurrentUser user, UUID projectId) {
        boolean member = jdbcClient.sql("select exists (select 1 from project_members where project_id = ? and user_id = ?)")
                .param(projectId)
                .param(user.id())
                .query(Boolean.class)
                .single();
        if (!member) {
            throw new NotFoundException("Projet introuvable ou non visible");
        }
    }

    /** Limite de débit par personne, sur toute la plateforme : au plus {@code messagesPerMinute} messages par minute. */
    private void requireRoomToWrite(CurrentUser user) {
        if (messagesPerMinute <= 0) {
            return;
        }
        Timestamp oldest = jdbcClient.sql("""
                select min(created_at) from (
                    select created_at from project_messages
                    where user_id = ? and created_at > now() - make_interval(secs => ?)
                    order by created_at desc limit ?
                ) recent
                having count(*) >= ?
                """)
                .param(user.id())
                .param((double) RATE_WINDOW.toSeconds())
                .param(messagesPerMinute)
                .param(messagesPerMinute)
                .query(Timestamp.class)
                .optional()
                .orElse(null);
        if (oldest != null) {
            Duration wait = Duration.between(Instant.now(), oldest.toInstant().plus(RATE_WINDOW));
            throw new TooManyRequestsException(
                    "Trop de messages en peu de temps : " + messagesPerMinute + " par minute au plus.", wait);
        }
    }

    /** Ne garde que les {@code messagesPerProject} derniers messages du projet. */
    private void prune(UUID projectId) {
        if (messagesPerProject <= 0) {
            return;
        }
        jdbcClient.sql("""
                delete from project_messages
                where project_id = :project
                  and id < (select id from project_messages where project_id = :project
                            order by id desc offset :keep limit 1)
                """)
                .param("project", projectId)
                .param("keep", messagesPerProject - 1)
                .update();
    }

    /**
     * Le nom sous lequel la personne parle. Les invités portent tous le même nom affiché (« Invité ») : dans une
     * conversation à plusieurs, on ne saurait pas qui écrit. On ajoute donc les quatre premiers caractères de leur
     * identifiant (« Invité 40ab »), les mêmes que ceux de leur identifiant dans la liste de l'équipe. Le nom est gardé
     * avec le message : il survit à la purge de l'invité.
     */
    public static String authorName(CurrentUser user) {
        String name = user.displayName() == null || user.displayName().isBlank() ? user.login() : user.displayName().strip();
        String login = user.login() == null ? "" : user.login();
        if (user.isGuest() && login.startsWith(GUEST_LOGIN_PREFIX) && login.length() >= GUEST_LOGIN_PREFIX.length() + 4) {
            name = name + " " + login.substring(GUEST_LOGIN_PREFIX.length(), GUEST_LOGIN_PREFIX.length() + 4);
        }
        return name.length() > 120 ? name.substring(0, 120) : name;
    }
}
