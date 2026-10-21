package com.lonkoo.backend.generation;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Accès à la table {@code generations} (JDBC, sans ORM). Aucun jeton GitHub n'y passe. */
@Repository
class GenerationRepository {

    private static final String COLUMNS = """
            id, canvas_id, version_id, requested_by, target, status, project_name, slug, file_count, total_bytes,
            warnings::text as warnings, error, created_at, finished_at, push_status, repo_full_name, repo_url,
            commit_sha, workflow_sent, push_warnings::text as push_warnings, push_error, pushed_at
            """;

    private final JdbcClient jdbc;
    private final JsonMapper json = JsonMapper.shared();

    GenerationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private List<String> strings(String jsonText) {
        try {
            return jsonText == null ? List.of() : json.readValue(jsonText, new TypeReference<List<String>>() { });
        } catch (JacksonException e) {
            return List.of();
        }
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JacksonException e) {
            throw new IllegalStateException("Valeur non sérialisable", e);
        }
    }

    private GenerationRow map(ResultSet rs, int rowNum) throws SQLException {
        return new GenerationRow(
                rs.getObject("id", UUID.class),
                rs.getObject("canvas_id", UUID.class),
                rs.getObject("version_id", UUID.class),
                rs.getObject("requested_by", UUID.class),
                rs.getString("target"),
                rs.getString("status"),
                rs.getString("project_name"),
                rs.getString("slug"),
                (Integer) rs.getObject("file_count"),
                (Long) rs.getObject("total_bytes"),
                strings(rs.getString("warnings")),
                rs.getString("error"),
                rs.getObject("created_at", OffsetDateTime.class).toInstant(),
                rs.getObject("finished_at", OffsetDateTime.class) == null ? null : rs.getObject("finished_at", OffsetDateTime.class).toInstant(),
                rs.getString("push_status"),
                rs.getString("repo_full_name"),
                rs.getString("repo_url"),
                rs.getString("commit_sha"),
                rs.getBoolean("workflow_sent"),
                strings(rs.getString("push_warnings")),
                rs.getString("push_error"),
                rs.getObject("pushed_at", OffsetDateTime.class) == null ? null : rs.getObject("pushed_at", OffsetDateTime.class).toInstant());
    }

    UUID insert(UUID canvasId, UUID versionId, UUID requestedBy, String target, String projectName, JsonNode snapshot) {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                insert into generations (id, canvas_id, version_id, requested_by, target, status, project_name, snapshot)
                values (?, ?, ?, ?, ?, 'PENDING', ?, ?::jsonb)
                """)
                .param(id).param(canvasId).param(versionId).param(requestedBy).param(target).param(projectName)
                .param(write(snapshot))
                .update();
        return id;
    }

    Optional<GenerationRow> find(UUID id) {
        return jdbc.sql("select " + COLUMNS + " from generations where id = ?").param(id).query(this::map).optional();
    }

    List<GenerationRow> listByCanvas(UUID canvasId, int limit) {
        return jdbc.sql("select " + COLUMNS + " from generations where canvas_id = ? order by created_at desc limit ?")
                .param(canvasId).param(limit).query(this::map).list();
    }

    boolean hasActive(UUID canvasId) {
        return jdbc.sql("select count(*) from generations where canvas_id = ? and status in ('PENDING', 'RUNNING')")
                .param(canvasId).query(Integer.class).single() > 0;
    }

    Optional<JsonNode> snapshotOf(UUID id) {
        return jdbc.sql("select snapshot::text from generations where id = ?").param(id).query(String.class).optional()
                .map(text -> json.readTree(text));
    }

    Optional<Map<String, String>> files(UUID id) {
        return jdbc.sql("select files::text from generations where id = ?").param(id).query(String.class).optional()
                .map(text -> {
                    try {
                        return json.readValue(text, new TypeReference<LinkedHashMap<String, String>>() { });
                    } catch (JacksonException e) {
                        throw new IllegalStateException("Fichiers générés illisibles en base", e);
                    }
                });
    }

    boolean claimRunning(UUID id) {
        return jdbc.sql("update generations set status = 'RUNNING' where id = ? and status = 'PENDING'").param(id).update() == 1;
    }

    void markDone(UUID id, GeneratedProject project) {
        jdbc.sql("""
                update generations
                set status = 'DONE', slug = ?, files = ?::jsonb, file_count = ?, total_bytes = ?, warnings = ?::jsonb,
                    error = null, finished_at = now()
                where id = ? and status = 'RUNNING'
                """)
                .param(project.slug()).param(write(project.files())).param(project.fileCount()).param(project.totalBytes())
                .param(write(project.warnings())).param(id)
                .update();
    }

    void markFailed(UUID id, String error) {
        jdbc.sql("update generations set status = 'FAILED', error = ?, finished_at = now() where id = ? and status in ('PENDING', 'RUNNING')")
                .param(truncate(error)).param(id).update();
    }

    /** Au démarrage aucun travail n'est en cours : ce qui l'était a été interrompu avec l'ancien processus. */
    int recoverInterrupted() {
        int generations = jdbc.sql("""
                update generations set status = 'FAILED', error = 'Génération interrompue par un redémarrage du serveur.', finished_at = now()
                where status in ('PENDING', 'RUNNING')
                """).update();
        int pushes = jdbc.sql("""
                update generations set push_status = 'FAILED', push_error = 'Envoi interrompu par un redémarrage du serveur.'
                where push_status = 'RUNNING'
                """).update();
        return generations + pushes;
    }

    boolean delete(UUID id) {
        return jdbc.sql("delete from generations where id = ?").param(id).update() == 1;
    }

    /** Réserve l'envoi sur GitHub : un seul à la fois, et plus de nouvel envoi une fois réussi. */
    boolean claimPush(UUID id) {
        return jdbc.sql("""
                update generations set push_status = 'RUNNING', push_error = null, push_warnings = '[]'::jsonb
                where id = ? and status = 'DONE' and (push_status is null or push_status = 'FAILED')
                """).param(id).update() == 1;
    }

    void pushDone(UUID id, String repoFullName, String repoUrl, String commitSha, boolean workflowSent, List<String> warnings) {
        jdbc.sql("""
                update generations
                set push_status = 'DONE', repo_full_name = ?, repo_url = ?, commit_sha = ?, workflow_sent = ?,
                    push_warnings = ?::jsonb, push_error = null, pushed_at = now()
                where id = ?
                """)
                .param(repoFullName).param(repoUrl).param(commitSha).param(workflowSent).param(write(warnings)).param(id).update();
    }

    void pushFailed(UUID id, String error, List<String> warnings) {
        jdbc.sql("update generations set push_status = 'FAILED', push_error = ?, push_warnings = ?::jsonb where id = ?")
                .param(truncate(error)).param(write(warnings)).param(id).update();
    }

    static String truncate(String text) {
        if (text == null) {
            return null;
        }
        return text.length() <= 500 ? text : text.substring(0, 499) + "…";
    }
}
