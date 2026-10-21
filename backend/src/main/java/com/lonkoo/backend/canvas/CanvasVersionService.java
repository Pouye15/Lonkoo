package com.lonkoo.backend.canvas;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.realtime.RealtimeSnapshotClient;
import com.lonkoo.backend.support.AuditService;
import com.lonkoo.backend.web.NotFoundException;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Versions nommées d'un canvas : enregistrement (après validation), listage,
 * lecture et restauration (en transaction Yjs côté serveur temps réel).
 */
@Service
public class CanvasVersionService {

    private final JdbcClient jdbcClient;
    private final CanvasAccessService canvasAccessService;
    private final CanvasValidator canvasValidator;
    private final RealtimeSnapshotClient realtimeSnapshotClient;
    private final AuditService auditService;
    private final TransactionTemplate transactions;
    private final JsonMapper jsonMapper = JsonMapper.shared();

    public CanvasVersionService(
            JdbcClient jdbcClient,
            CanvasAccessService canvasAccessService,
            CanvasValidator canvasValidator,
            RealtimeSnapshotClient realtimeSnapshotClient,
            AuditService auditService,
            TransactionTemplate transactions) {
        this.jdbcClient = jdbcClient;
        this.canvasAccessService = canvasAccessService;
        this.canvasValidator = canvasValidator;
        this.realtimeSnapshotClient = realtimeSnapshotClient;
        this.auditService = auditService;
        this.transactions = transactions;
    }

    public List<CanvasVersion> list(CurrentUser user, UUID canvasId) {
        canvasAccessService.requireRead(canvasId);
        return jdbcClient.sql("""
                select id, canvas_id, name, message, schema_version, author_id, created_at
                from canvas_versions
                where canvas_id = ?
                order by created_at desc
                """)
                .param(canvasId)
                .query((rs, rowNum) -> new CanvasVersion(
                        rs.getObject("id", UUID.class),
                        rs.getObject("canvas_id", UUID.class),
                        rs.getString("name"),
                        rs.getString("message"),
                        rs.getInt("schema_version"),
                        rs.getObject("author_id", UUID.class),
                        rs.getObject("created_at", OffsetDateTime.class).toInstant()))
                .list();
    }

    /**
     * Enregistre une version. L'appel au serveur temps réel se fait avant d'ouvrir une transaction : une
     * connexion à la base ne reste pas prise pendant l'attente du réseau.
     */
    public CanvasVersion create(CurrentUser user, UUID canvasId, String name, String message) {
        canvasAccessService.requireWrite(canvasId);

        // D1 du roadmap : le serveur temps réel produit l'instantané JSON.
        JsonNode snapshot = realtimeSnapshotClient.snapshot(canvasId);
        List<String> errors = canvasValidator.validate(snapshot);
        if (!errors.isEmpty()) {
            throw new InvalidCanvasException(errors);
        }

        UUID versionId = UUID.randomUUID();
        String snapshotJson;
        try {
            snapshotJson = jsonMapper.writeValueAsString(snapshot);
        } catch (JacksonException e) {
            throw new IllegalStateException("Impossible de sérialiser l'instantané", e);
        }

        // La version et son entrée de journal sont écrites ensemble, ou pas du tout.
        transactions.executeWithoutResult(status -> {
            jdbcClient.sql("""
                    insert into canvas_versions (id, canvas_id, name, message, schema_version, snapshot, author_id)
                    values (?, ?, ?, ?, 1, ?::jsonb, ?)
                    """)
                    .param(versionId)
                    .param(canvasId)
                    .param(name)
                    .param(message)
                    .param(snapshotJson)
                    .param(user.id())
                    .update();
            auditService.record(user.id(), "version.created", "canvas:" + canvasId, null);
        });
        return requireVersion(versionId);
    }

    /** Détail d'une version, lu en une seule requête. */
    public CanvasVersionDetail detail(CurrentUser user, UUID canvasId, UUID versionId) {
        canvasAccessService.requireRead(canvasId);
        return jdbcClient.sql("""
                select id, canvas_id, name, message, schema_version, author_id, created_at, snapshot
                from canvas_versions
                where id = ? and canvas_id = ?
                """)
                .param(versionId)
                .param(canvasId)
                .query((rs, rowNum) -> new CanvasVersionDetail(
                        new CanvasVersion(
                                rs.getObject("id", UUID.class),
                                rs.getObject("canvas_id", UUID.class),
                                rs.getString("name"),
                                rs.getString("message"),
                                rs.getInt("schema_version"),
                                rs.getObject("author_id", UUID.class),
                                rs.getObject("created_at", OffsetDateTime.class).toInstant()),
                        readJson(rs.getString("snapshot"))))
                .optional()
                .orElseThrow(() -> new NotFoundException("Version introuvable"));
    }

    public JsonNode getSnapshot(CurrentUser user, UUID canvasId, UUID versionId) {
        return detail(user, canvasId, versionId).snapshot();
    }

    /**
     * Restaure une version dans le document en direct. L'instantané enregistré est revalidé : les règles
     * du contrat ont pu se durcir depuis son enregistrement, et un canvas invalide ne doit pas revenir
     * dans le document partagé.
     */
    public void restore(CurrentUser user, UUID canvasId, UUID versionId) {
        canvasAccessService.requireWrite(canvasId);
        JsonNode snapshot = getSnapshot(user, canvasId, versionId);

        List<String> errors = canvasValidator.validate(snapshot);
        if (!errors.isEmpty()) {
            throw new InvalidCanvasException(errors);
        }

        // Applique l'instantané dans la transaction Yjs du serveur temps réel (aucune transaction SQL ouverte).
        realtimeSnapshotClient.restore(canvasId, snapshot);

        auditService.record(user.id(), "version.restored", "canvas:" + canvasId, null);
    }

    private CanvasVersion requireVersion(UUID versionId) {
        return jdbcClient.sql("""
                select id, canvas_id, name, message, schema_version, author_id, created_at
                from canvas_versions where id = ?
                """)
                .param(versionId)
                .query((rs, rowNum) -> new CanvasVersion(
                        rs.getObject("id", UUID.class),
                        rs.getObject("canvas_id", UUID.class),
                        rs.getString("name"),
                        rs.getString("message"),
                        rs.getInt("schema_version"),
                        rs.getObject("author_id", UUID.class),
                        rs.getObject("created_at", OffsetDateTime.class).toInstant()))
                .optional()
                .orElseThrow(() -> new NotFoundException("Version introuvable"));
    }

    private JsonNode readJson(String json) {
        try {
            return jsonMapper.readTree(json);
        } catch (JacksonException e) {
            throw new IllegalStateException("Instantané corrompu en base", e);
        }
    }
}