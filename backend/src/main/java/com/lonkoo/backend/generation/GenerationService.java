package com.lonkoo.backend.generation;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.lonkoo.backend.canvas.CanvasAccessService;
import com.lonkoo.backend.canvas.CanvasValidator;
import com.lonkoo.backend.canvas.CanvasVersionService;
import com.lonkoo.backend.canvas.InvalidCanvasException;
import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.realtime.RealtimeSnapshotClient;
import com.lonkoo.backend.support.AuditService;
import com.lonkoo.backend.support.UsageLimits;
import com.lonkoo.backend.web.BusyException;
import com.lonkoo.backend.web.ConflictException;
import com.lonkoo.backend.web.NotFoundException;

import tools.jackson.databind.JsonNode;

/**
 * Génération de projets depuis un canvas (lot R8). Lancer une génération fige l'instantané (une version nommée ou
 * l'état courant), le valide, puis rend la main : le travail se fait sur un exécuteur borné et l'état se lit par
 * {@code GET /generations/{id}}. Le projet généré est stocké avec la génération (chaque génération est un état
 * figé, ce que l'utilisateur a vu est ce qui part sur GitHub).
 */
@Service
public class GenerationService {

    private static final Logger log = LoggerFactory.getLogger(GenerationService.class);
    private static final FileTime ZIP_TIME = FileTime.from(Instant.parse("2026-01-01T00:00:00Z"));

    private final GenerationRepository repository;
    private final ProjectGenerator generator;
    private final CanvasValidator validator;
    private final CanvasAccessService canvasAccessService;
    private final CanvasVersionService versionService;
    private final RealtimeSnapshotClient realtimeSnapshotClient;
    private final UsageLimits usageLimits;
    private final AuditService auditService;
    private final TransactionTemplate transactions;
    private final JdbcClient jdbc;
    private final ExecutorService jobs;

    public GenerationService(GenerationRepository repository, ProjectGenerator generator, CanvasValidator validator,
            CanvasAccessService canvasAccessService, CanvasVersionService versionService,
            RealtimeSnapshotClient realtimeSnapshotClient, UsageLimits usageLimits, AuditService auditService,
            TransactionTemplate transactions, JdbcClient jdbc, ExecutorService jobExecutor) {
        this.repository = repository;
        this.generator = generator;
        this.validator = validator;
        this.canvasAccessService = canvasAccessService;
        this.versionService = versionService;
        this.realtimeSnapshotClient = realtimeSnapshotClient;
        this.usageLimits = usageLimits;
        this.auditService = auditService;
        this.transactions = transactions;
        this.jdbc = jdbc;
        this.jobs = jobExecutor;
    }

    /** Au démarrage aucun travail n'est en cours : ce qui l'était a été interrompu. */
    @EventListener(ApplicationReadyEvent.class)
    public void recoverInterruptedJobs() {
        int recovered = repository.recoverInterrupted();
        if (recovered > 0) {
            log.warn("{} génération(s) ou envoi(s) interrompu(s) par le redémarrage ont été marqués échoués", recovered);
        }
    }

    /**
     * Lance une génération.
     *
     * @param versionId version nommée à générer ; absente, l'état courant du canvas (demandé au serveur temps réel)
     */
    public UUID start(CurrentUser user, UUID canvasId, UUID versionId, String target, String projectName) {
        canvasAccessService.requireWrite(canvasId);
        String chosenTarget = target == null || target.isBlank() ? "spring-boot" : target;

        JsonNode snapshot = versionId != null
                ? versionService.getSnapshot(user, canvasId, versionId)
                : realtimeSnapshotClient.snapshot(canvasId);
        List<String> errors = validator.validate(snapshot);
        if (!errors.isEmpty()) {
            throw new InvalidCanvasException(errors);
        }
        String name = projectName != null && !projectName.isBlank() ? projectName.trim() : projectNameOf(canvasId);

        UUID id = transactions.execute(status -> {
            usageLimits.requireRoomForGeneration(canvasId);
            if (repository.hasActive(canvasId)) {
                throw new ConflictException("Une génération de ce canvas est déjà en cours.");
            }
            UUID created = repository.insert(canvasId, versionId, user.id(), chosenTarget, name, snapshot);
            auditService.record(user.id(), "generation.created", "canvas:" + canvasId, "{\"target\":\"" + chosenTarget + "\"}");
            return created;
        });
        try {
            jobs.execute(() -> run(id));
        } catch (RejectedExecutionException e) {
            repository.markFailed(id, "Le serveur est occupé : réessayez dans un instant.");
            throw new BusyException("Trop de générations en cours : réessayez dans un instant.");
        }
        return id;
    }

    private String projectNameOf(UUID canvasId) {
        return jdbc.sql("select p.name from projects p join canvases c on c.project_id = p.id where c.id = ?")
                .param(canvasId).query(String.class).optional().orElse("Projet LONKOO");
    }

    /** Le travail d'une génération, sur l'exécuteur. Ne lève jamais : tout échec devient l'état FAILED. */
    void run(UUID id) {
        try {
            if (!repository.claimRunning(id)) {
                return;   // supprimée ou déjà prise en charge
            }
            GenerationRow row = repository.find(id).orElse(null);
            JsonNode snapshot = repository.snapshotOf(id).orElse(null);
            if (row == null || snapshot == null) {
                return;
            }
            GeneratedProject project = generator.generate(snapshot, row.projectName());
            if (project.totalBytes() > usageLimits.generatedMaxBytes()) {
                repository.markFailed(id, "Le projet généré pèse " + project.totalBytes() + " octets : au plus "
                        + usageLimits.generatedMaxBytes() + " sont autorisés.");
                return;
            }
            repository.markDone(id, project);
        } catch (InvalidCanvasException e) {
            repository.markFailed(id, "Le canvas ne respecte pas le contrat : " + String.join(" ; ", e.getErrors()));
        } catch (RuntimeException e) {
            log.error("Génération {} échouée", id, e);
            repository.markFailed(id, "La génération a échoué (erreur interne).");
        }
    }

    /* ------------------------------------------------------------------ */
    /* Lecture                                                              */
    /* ------------------------------------------------------------------ */

    /** La génération, lisible par quiconque voit son canvas (404 sinon). */
    GenerationRow row(UUID id) {
        GenerationRow row = repository.find(id).orElseThrow(() -> new NotFoundException("Génération introuvable"));
        canvasAccessService.requireRead(row.canvasId());
        return row;
    }

    /** Idem, pour une action qui modifie (rôle d'écriture sur le canvas). */
    GenerationRow rowForWrite(UUID id) {
        GenerationRow row = repository.find(id).orElseThrow(() -> new NotFoundException("Génération introuvable"));
        canvasAccessService.requireWrite(row.canvasId());
        return row;
    }

    public GenerationResponse get(UUID id) {
        GenerationRow row = row(id);
        List<GenerationResponse.FileInfo> files = null;
        if ("DONE".equals(row.status())) {
            files = new ArrayList<>();
            for (Map.Entry<String, String> file : repository.files(id).orElse(Map.of()).entrySet()) {
                files.add(new GenerationResponse.FileInfo(file.getKey(), file.getValue().getBytes(StandardCharsets.UTF_8).length));
            }
        }
        return GenerationResponse.of(row, files);
    }

    public List<GenerationResponse> list(UUID canvasId) {
        canvasAccessService.requireRead(canvasId);
        return repository.listByCanvas(canvasId, 20).stream().map(row -> GenerationResponse.of(row, null)).toList();
    }

    /** Le contenu d'un fichier du projet généré ; 404 si la génération n'est pas terminée ou le chemin inconnu. */
    public String file(UUID id, String path) {
        GenerationRow row = row(id);
        if (!"DONE".equals(row.status())) {
            throw new NotFoundException("Le projet n'est pas encore généré");
        }
        String content = repository.files(id).orElse(Map.of()).get(path);
        if (content == null) {
            throw new NotFoundException("Fichier introuvable");
        }
        return content;
    }

    /** Les fichiers de la génération (réservé aux traitements internes : envoi sur GitHub). */
    Map<String, String> filesOf(UUID id) {
        return repository.files(id).orElseThrow(() -> new NotFoundException("Projet généré introuvable"));
    }

    /** Le projet en archive ZIP : horodatage fixe, donc la même archive pour la même génération. */
    public byte[] zip(UUID id) {
        GenerationRow row = row(id);
        if (!"DONE".equals(row.status())) {
            throw new NotFoundException("Le projet n'est pas encore généré");
        }
        Map<String, String> files = repository.files(id).orElse(Map.of());
        try (ByteArrayOutputStream bytes = new ByteArrayOutputStream(); ZipOutputStream zip = new ZipOutputStream(bytes)) {
            for (Map.Entry<String, String> file : new java.util.TreeMap<>(files).entrySet()) {
                ZipEntry entry = new ZipEntry(row.slug() + "/" + file.getKey());
                entry.setLastModifiedTime(ZIP_TIME);
                zip.putNextEntry(entry);
                zip.write(file.getValue().getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
            zip.finish();
            return bytes.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Archive impossible", e);
        }
    }

    public void delete(CurrentUser user, UUID id) {
        GenerationRow row = rowForWrite(id);
        if ("PENDING".equals(row.status()) || "RUNNING".equals(row.status()) || "RUNNING".equals(row.pushStatus())) {
            throw new ConflictException("Cette génération est en cours : attendez qu'elle se termine.");
        }
        repository.delete(id);
        auditService.record(user.id(), "generation.deleted", "canvas:" + row.canvasId(), null);
    }
}
