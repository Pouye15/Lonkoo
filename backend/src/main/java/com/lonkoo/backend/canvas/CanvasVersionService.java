package com.lonkoo.backend.canvas;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
    private final JsonMapper jsonMapper = JsonMapper.shared();

    public CanvasVersionService(
            JdbcClient jdbcClient,
            CanvasAccessService canvasAccessService,
            CanvasValidator canvasValidator,
            RealtimeSnapshotClient realtimeSnapshotClient,
            AuditService auditService) {
        this.jdbcClient = jdbcClient;
        this.canvasAccessService = canvasAccessService;
        this.canvasValidator = canvasValidator;
        this.realtimeSnapshotClient = realtimeSnapshotClient;
        this.auditService = auditService;
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

    @Transactional
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
        return requireVersion(versionId);
    }

    public JsonNode getSnapshot(CurrentUser user, UUID canvasId, UUID versionId) {
        canvasAccessService.requireRead(canvasId);
        return jdbcClient.sql("select snapshot from canvas_versions where id = ? and canvas_id = ?")
                .param(versionId)
                .param(canvasId)
                .query((rs, rowNum) -> readJson(rs.getString("snapshot")))
                .optional()
                .orElseThrow(() -> new NotFoundException("Version introuvable"));
    }

    @Transactional
    public void restore(CurrentUser user, UUID canvasId, UUID versionId) {
        canvasAccessService.requireWrite(canvasId);
        JsonNode snapshot = getSnapshot(user, canvasId, versionId);

        // Applique l'instantané dans la transaction Yjs du serveur temps réel.
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