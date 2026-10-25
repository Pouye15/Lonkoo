package com.lonkoo.backend.ai;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.lonkoo.backend.canvas.CanvasAccessService;
import com.lonkoo.backend.canvas.CanvasValidator;
import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.realtime.RealtimeSnapshotClient;
import com.lonkoo.backend.support.AuditService;
import com.lonkoo.backend.web.BadRequestException;

import tools.jackson.databind.JsonNode;

/**
 * Tout ce qui entoure l'agent IA, et que le fournisseur n'a pas à refaire (voir {@link AiClient}) :
 * <ul>
 *   <li>le droit sur le canvas : esquisser et compléter demandent d'y pouvoir écrire, l'audit demande d'être membre (un
 *       visiteur d'un projet public ne déclenche pas d'appels payants) ; un étranger reçoit un 404 ;</li>
 *   <li>un 501 tant qu'aucun fournisseur n'est branché ({@code lonkoo.ai.provider}), <em>après</em> le contrôle d'accès ;</li>
 *   <li>le plafond du texte saisi ({@code AI_MAX_INPUT_CHARS}) et l'existence des blocs désignés ;</li>
 *   <li>le quota d'appels par jour, par personne et pour tout le service ({@link AiQuota}, 429), compté juste avant
 *       l'appel au fournisseur : une demande refusée plus tôt (droits, texte trop long, bloc inconnu) ne coûte rien ;</li>
 *   <li>la <strong>validation de toute proposition</strong> contre le contrat du canvas ; une réponse invalide n'est pas
 *       renvoyée (502) ;</li>
 *   <li>une ligne dans le journal d'audit par appel, sans jamais le texte saisi ni la réponse.</li>
 * </ul>
 * Rien n'est écrit dans le canvas : une proposition se renvoie à la personne, qui l'accepte ou non.
 */
@Service
public class AiService {

    private static final Logger log = LoggerFactory.getLogger(AiService.class);

    private final ObjectProvider<AiClient> clients;
    private final CanvasAccessService canvasAccessService;
    private final CanvasValidator validator;
    private final RealtimeSnapshotClient realtimeSnapshotClient;
    private final AuditService auditService;
    private final AiQuota quota;
    private final int maxInputChars;

    public AiService(
            ObjectProvider<AiClient> clients,
            CanvasAccessService canvasAccessService,
            CanvasValidator validator,
            RealtimeSnapshotClient realtimeSnapshotClient,
            AuditService auditService,
            AiQuota quota,
            @Value("${lonkoo.ai.max-input-chars:8000}") int maxInputChars) {
        this.clients = clients;
        this.canvasAccessService = canvasAccessService;
        this.validator = validator;
        this.realtimeSnapshotClient = realtimeSnapshotClient;
        this.auditService = auditService;
        this.quota = quota;
        this.maxInputChars = maxInputChars;
    }

    public AiProposalResponse sketch(CurrentUser user, UUID canvasId, String brief) {
        canvasAccessService.requireWrite(canvasId);
        AiClient ai = client();
        String text = withinLimit(brief, "Le cahier des charges");

        quota.consume(user);
        AiProposal proposal = ai.sketch(text);
        auditService.record(user.id(), "ai.sketch", "canvas:" + canvasId, null);
        return respond(ai, proposal);
    }

    public AiProposalResponse complete(CurrentUser user, UUID canvasId, List<String> nodeIds, String instruction) {
        canvasAccessService.requireWrite(canvasId);
        AiClient ai = client();
        String text = instruction == null ? "" : withinLimit(instruction, "La consigne");

        JsonNode snapshot = realtimeSnapshotClient.snapshot(canvasId);
        Set<String> existing = nodeIdsOf(snapshot);
        for (String id : nodeIds) {
            if (!existing.contains(id)) {
                throw new BadRequestException("Bloc inconnu dans ce canvas : " + id);
            }
        }

        quota.consume(user);
        AiProposal proposal = ai.complete(snapshot, List.copyOf(nodeIds), text);
        auditService.record(user.id(), "ai.complete", "canvas:" + canvasId, null);
        return respond(ai, proposal);
    }

    public AiAuditResponse audit(CurrentUser user, UUID canvasId) {
        canvasAccessService.requireMemberRead(canvasId);
        AiClient ai = client();

        JsonNode snapshot = realtimeSnapshotClient.snapshot(canvasId);
        Set<String> existing = nodeIdsOf(snapshot);
        quota.consume(user);
        List<AiFinding> all = ai.audit(snapshot);
        List<AiFinding> kept = (all == null ? List.<AiFinding>of() : all).stream()
                .filter(Objects::nonNull)
                .filter(finding -> finding.targetNodeId() != null && existing.contains(finding.targetNodeId()))
                .toList();
        int discarded = (all == null ? 0 : all.size()) - kept.size();
        if (discarded > 0) {
            log.warn("Audit IA du canvas {} : {} remarque(s) écartée(s), bloc visé absent du canvas", canvasId, discarded);
        }
        auditService.record(user.id(), "ai.audit", "canvas:" + canvasId, null);
        return new AiAuditResponse(kept, discarded, ai.demo());
    }

    /** Le fournisseur branché, ou 501 s'il n'y en a pas. */
    private AiClient client() {
        AiClient ai = clients.getIfAvailable();
        if (ai == null) {
            throw new AiNotImplementedException();
        }
        return ai;
    }

    private String withinLimit(String text, String what) {
        String stripped = text == null ? "" : text.strip();
        if (stripped.length() > maxInputChars) {
            throw new BadRequestException(what + " est trop long : " + maxInputChars + " caractères au plus.");
        }
        return stripped;
    }

    /** Toute proposition est validée contre le contrat du canvas avant d'être renvoyée. */
    private AiProposalResponse respond(AiClient ai, AiProposal proposal) {
        if (proposal == null || proposal.canvas() == null) {
            throw new AiOutputInvalidException(List.of("L'agent n'a renvoyé aucun canvas."));
        }
        List<String> errors = validator.validate(proposal.canvas());
        if (!errors.isEmpty()) {
            log.warn("Proposition IA refusée : {} erreur(s) de contrat", errors.size());
            throw new AiOutputInvalidException(errors);
        }
        return new AiProposalResponse(proposal.canvas(), proposal.summary() == null ? "" : proposal.summary(), ai.demo());
    }

    private static Set<String> nodeIdsOf(JsonNode snapshot) {
        Set<String> ids = new HashSet<>();
        JsonNode nodes = snapshot == null ? null : snapshot.get("nodes");
        if (nodes != null && nodes.isArray()) {
            for (JsonNode node : nodes) {
                ids.add(node.path("id").asText());
            }
        }
        return ids;
    }
}
