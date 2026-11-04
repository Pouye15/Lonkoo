package com.lonkoo.backend.generation;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Accès à la table {@code deployments} (JDBC, sans ORM). Les changements d'état ne touchent jamais un état final. */
@Repository
class DeploymentRepository {

    private static final String COLUMNS = "id, generation_id, requested_by, method, status, public_url, run_id, run_url, detail, created_at, updated_at";

    private final JdbcClient jdbc;

    DeploymentRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private DeploymentRow map(ResultSet rs, int rowNum) throws SQLException {
        return new DeploymentRow(
                rs.getObject("id", UUID.class),
                rs.getObject("generation_id", UUID.class),
                rs.getObject("requested_by", UUID.class),
                rs.getString("method"),
                rs.getString("status"),
                rs.getString("public_url"),
                (Long) rs.getObject("run_id"),
                rs.getString("run_url"),
                rs.getString("detail"),
                rs.getObject("created_at", OffsetDateTime.class).toInstant(),
                rs.getObject("updated_at", OffsetDateTime.class).toInstant());
    }

    UUID insert(UUID generationId, UUID requestedBy, String method, String status, String publicUrl, String detail) {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                insert into deployments (id, generation_id, requested_by, method, status, public_url, detail)
                values (?, ?, ?, ?, ?, ?, ?)
                """)
                .param(id).param(generationId).param(requestedBy).param(method).param(status).param(publicUrl)
                .param(GenerationRepository.truncate(detail))
                .update();
        return id;
    }

    Optional<DeploymentRow> find(UUID id) {
        return jdbc.sql("select " + COLUMNS + " from deployments where id = ?").param(id).query(this::map).optional();
    }

    List<DeploymentRow> listByGeneration(UUID generationId, int limit) {
        return jdbc.sql("select " + COLUMNS + " from deployments where generation_id = ? order by created_at desc limit ?")
                .param(generationId).param(limit).query(this::map).list();
    }

    boolean hasActive(UUID generationId) {
        return jdbc.sql("select count(*) from deployments where generation_id = ? and status in ('PENDING', 'RUNNING')")
                .param(generationId).query(Integer.class).single() > 0;
    }

    /** Le workflow est lancé ; l'exécution est encore inconnue tant que {@code runId} est nul. */
    void running(UUID id, Long runId, String runUrl, String detail) {
        jdbc.sql("""
                update deployments set status = 'RUNNING', run_id = ?, run_url = ?, detail = ?, updated_at = now()
                where id = ? and status in ('PENDING', 'RUNNING')
                """)
                .param(runId).param(runUrl).param(GenerationRepository.truncate(detail)).param(id).update();
    }

    /** État final (ou suivi) lu sur GitHub. */
    void finish(UUID id, String status, String detail) {
        jdbc.sql("update deployments set status = ?, detail = ?, updated_at = now() where id = ? and status in ('PENDING', 'RUNNING')")
                .param(status).param(GenerationRepository.truncate(detail)).param(id).update();
    }

    /** Le lancement depuis LONKOO n'est pas possible : l'utilisateur déploie lui-même, avec les étapes données. */
    void manual(UUID id, String detail) {
        jdbc.sql("update deployments set method = 'MANUAL', status = 'MANUAL', detail = ?, updated_at = now() where id = ? and status in ('PENDING', 'RUNNING')")
                .param(GenerationRepository.truncate(detail)).param(id).update();
    }

    void detail(UUID id, String detail) {
        jdbc.sql("update deployments set detail = ?, updated_at = now() where id = ? and status in ('PENDING', 'RUNNING')")
                .param(GenerationRepository.truncate(detail)).param(id).update();
    }

    /**
     * Ce qui ne peut pas se résoudre seul au-delà du délai : un lancement jamais parti (travail perdu), ou une exécution
     * qui n'est jamais apparue sur GitHub. Un déploiement dont l'exécution est connue n'est pas touché : sa lecture le
     * ramène à l'état réel.
     */
    int failStale(int minutes) {
        return jdbc.sql("""
                update deployments
                set status = 'FAILED', updated_at = now(),
                    detail = case status
                        when 'PENDING' then 'Le lancement n''a pas abouti (travail perdu) : relancez le déploiement.'
                        else 'L''exécution n''est jamais apparue sur GitHub : vérifiez l''onglet Actions du dépôt, puis relancez le déploiement.'
                    end
                where updated_at < now() - make_interval(mins => ?)
                  and (status = 'PENDING' or (status = 'RUNNING' and run_id is null))
                """).param(minutes).update();
    }

    /** Au démarrage, un lancement resté en attente (le workflow n'avait pas encore été déclenché) est perdu. */
    int recoverInterrupted() {
        return jdbc.sql("""
                update deployments set status = 'FAILED', detail = 'Lancement interrompu par un redémarrage du serveur.', updated_at = now()
                where status = 'PENDING'
                """).update();
    }
}
