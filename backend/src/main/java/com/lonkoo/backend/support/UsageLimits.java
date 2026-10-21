package com.lonkoo.backend.support;

import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.web.LimitExceededException;

/**
 * Plafonds d'usage : projets par utilisateur (plus bas pour un invité), canvas par projet, versions et
 * liens de partage actifs par canvas, taille d'un instantané. Chaque dépassement donne un 409
 * « Limite atteinte ».
 *
 * <p>Les contrôles de nombre doivent s'exécuter <strong>dans la transaction qui insère</strong> : ils
 * verrouillent la ligne parente ({@code for no key update}, qui ne gêne pas les clés étrangères des autres écritures), si bien que deux créations simultanées passent
 * l'une après l'autre au lieu de dépasser le plafond ensemble.</p>
 */
@Component
public class UsageLimits {

    private final JdbcClient jdbcClient;
    private final int guestProjects;
    private final int accountProjects;
    private final int canvasesPerProject;
    private final int versionsPerCanvas;
    private final int shareLinksPerCanvas;
    private final int snapshotMaxBytes;
    private final int generationsPerCanvas;
    private final long generatedMaxBytes;
    private final int deploymentsPerGeneration;

    public UsageLimits(
            JdbcClient jdbcClient,
            @Value("${lonkoo.limits.guest-projects:20}") int guestProjects,
            @Value("${lonkoo.limits.account-projects:100}") int accountProjects,
            @Value("${lonkoo.limits.canvases-per-project:10}") int canvasesPerProject,
            @Value("${lonkoo.limits.versions-per-canvas:50}") int versionsPerCanvas,
            @Value("${lonkoo.limits.share-links-per-canvas:20}") int shareLinksPerCanvas,
            @Value("${lonkoo.limits.snapshot-max-bytes:1048576}") int snapshotMaxBytes,
            @Value("${lonkoo.limits.generations-per-canvas:20}") int generationsPerCanvas,
            @Value("${lonkoo.limits.generated-max-bytes:8388608}") long generatedMaxBytes,
            @Value("${lonkoo.limits.deployments-per-generation:20}") int deploymentsPerGeneration) {
        this.jdbcClient = jdbcClient;
        this.guestProjects = guestProjects;
        this.accountProjects = accountProjects;
        this.canvasesPerProject = canvasesPerProject;
        this.versionsPerCanvas = versionsPerCanvas;
        this.shareLinksPerCanvas = shareLinksPerCanvas;
        this.snapshotMaxBytes = snapshotMaxBytes;
        this.generationsPerCanvas = generationsPerCanvas;
        this.generatedMaxBytes = generatedMaxBytes;
        this.deploymentsPerGeneration = deploymentsPerGeneration;
    }

    /** Projets dont l'utilisateur est le créateur (ceux où il a seulement été invité ne comptent pas). */
    public void requireRoomForProject(CurrentUser user) {
        lock("users", user.id());
        int max = user.isGuest() ? guestProjects : accountProjects;
        if (count("select count(*) from projects where owner_id = ?", user.id()) >= max) {
            throw new LimitExceededException(user.isGuest()
                    ? "Limite atteinte : " + max + " projets au maximum pour un invité. Connectez-vous avec GitHub pour en créer davantage."
                    : "Limite atteinte : " + max + " projets au maximum par compte.");
        }
    }

    public void requireRoomForCanvas(UUID projectId) {
        lock("projects", projectId);
        if (count("select count(*) from canvases where project_id = ?", projectId) >= canvasesPerProject) {
            throw new LimitExceededException("Limite atteinte : " + canvasesPerProject + " canvas au maximum par projet.");
        }
    }

    public void requireRoomForVersion(UUID canvasId) {
        lock("canvases", canvasId);
        if (count("select count(*) from canvas_versions where canvas_id = ?", canvasId) >= versionsPerCanvas) {
            throw new LimitExceededException("Limite atteinte : " + versionsPerCanvas + " versions au maximum par canvas.");
        }
    }

    /** Seuls les liens non expirés comptent : un lien périmé (72 h au plus) libère sa place. */
    public void requireRoomForShareLink(UUID canvasId) {
        lock("canvases", canvasId);
        if (count("select count(*) from share_links where canvas_id = ? and expires_at > now()", canvasId) >= shareLinksPerCanvas) {
            throw new LimitExceededException("Limite atteinte : " + shareLinksPerCanvas
                    + " liens de partage actifs au maximum par canvas. Attendez l'expiration d'un lien.");
        }
    }

    /** Les générations déjà faites (réussies ou non) comptent : le projet généré est stocké dans la base. */
    public void requireRoomForGeneration(UUID canvasId) {
        lock("canvases", canvasId);
        if (count("select count(*) from generations where canvas_id = ?", canvasId) >= generationsPerCanvas) {
            throw new LimitExceededException("Limite atteinte : " + generationsPerCanvas
                    + " générations au maximum par canvas. Supprimez-en une pour en lancer une nouvelle.");
        }
    }

    /** Les demandes de déploiement d'une génération (abouties ou non) comptent : chacune peut lancer un workflow GitHub. */
    public void requireRoomForDeployment(UUID generationId) {
        lock("generations", generationId);
        if (count("select count(*) from deployments where generation_id = ?", generationId) >= deploymentsPerGeneration) {
            throw new LimitExceededException("Limite atteinte : " + deploymentsPerGeneration
                    + " déploiements au maximum par projet généré. Lancez une nouvelle génération.");
        }
    }

    /** Taille cumulée maximale des fichiers d'un projet généré, en octets. */
    public long generatedMaxBytes() {
        return generatedMaxBytes;
    }

    public void requireSnapshotSize(int bytes) {
        if (bytes > snapshotMaxBytes) {
            throw new LimitExceededException("Limite atteinte : l'instantané pèse " + bytes + " octets, au plus " + snapshotMaxBytes
                    + " sont enregistrés par version.");
        }
    }

    /** Verrouille la ligne parente jusqu'à la fin de la transaction (la table vient d'une liste fermée). */
    private void lock(String table, UUID id) {
        jdbcClient.sql("select 1 from " + table + " where id = ? for no key update").param(id).query(Integer.class).optional();
    }

    private int count(String sql, UUID id) {
        return jdbcClient.sql(sql).param(id).query(Integer.class).single();
    }
}
