package com.lonkoo.backend.realtime;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.lonkoo.backend.web.BadRequestException;
import com.lonkoo.backend.web.NotFoundException;

import tools.jackson.databind.json.JsonMapper;

/**
 * API interne serveur temps réel &harr; backend (non routée par Caddy).
 * L'accès exige le jeton de service {@code REALTIME_SERVICE_TOKEN}, comparé en
 * temps constant.
 *
 * <p>Contrat (§ 7.2) :</p>
 * <ul>
 *   <li>{@code GET /internal/canvases/{id}/state} &rarr; {@code {state: base64|null, seed: {...}|null}}</li>
 *   <li>{@code PUT /internal/canvases/{id}/state} &rarr; {@code {state: base64}} &rarr; {@code 204}</li>
 * </ul>
 */
@RestController
@RequestMapping("/internal")
public class InternalStateController {

    private final JdbcClient jdbcClient;
    private final byte[] serviceToken;
    private final JsonMapper jsonMapper = JsonMapper.shared();

    public InternalStateController(
            JdbcClient jdbcClient,
            @Value("${realtime.service-token}") String serviceToken) {
        // Un jeton vide laisserait passer « Authorization: Bearer » sans rien derrière.
        if (serviceToken == null || serviceToken.isBlank()) {
            throw new IllegalStateException("realtime.service-token (REALTIME_SERVICE_TOKEN) ne doit pas être vide");
        }
        this.jdbcClient = jdbcClient;
        this.serviceToken = serviceToken.getBytes(StandardCharsets.UTF_8);
    }

    @GetMapping("/canvases/{canvasId}/state")
    ResponseEntity<Map<String, Object>> getState(
            @PathVariable UUID canvasId,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        requireServiceToken(authorization);

        var row = jdbcClient.sql("""
                select c.seed_snapshot, s.state
                from canvases c
                left join canvas_states s on s.canvas_id = c.id
                where c.id = ?
                """)
                .param(canvasId)
                .query((rs, rowNum) -> new StateRow(rs.getString("seed_snapshot"), rs.getBytes("state")))
                .optional()
                .orElseThrow(() -> new NotFoundException("Canvas introuvable"));

        // Un canvas neuf n'a ni état ni (selon sa création) seed : les deux peuvent être null.
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("state", row.state() == null ? null : Base64.getEncoder().encodeToString(row.state()));
        // seed_snapshot est du jsonb : on le renvoie comme objet JSON, pas comme chaîne.
        payload.put("seed", row.seed() == null ? null : jsonMapper.readTree(row.seed()));

        return ResponseEntity.ok(payload);
    }

    @PutMapping("/canvases/{canvasId}/state")
    ResponseEntity<Void> putState(
            @PathVariable UUID canvasId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, String> body) {
        requireServiceToken(authorization);

        String base64State = body.get("state");
        if (base64State == null || base64State.isBlank()) {
            throw new BadRequestException("Champ « state » manquant");
        }
        byte[] state;
        try {
            state = Base64.getDecoder().decode(base64State);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Le champ « state » n'est pas du Base64 valide");
        }

        // Un seul ordre SQL : aucune ligne n'est écrite si le canvas n'existe pas.
        int written = jdbcClient.sql("""
                insert into canvas_states (canvas_id, state, updated_at)
                select c.id, ?, now() from canvases c where c.id = ?
                on conflict (canvas_id) do update
                set state = excluded.state, updated_at = now()
                """)
                .param(state)
                .param(canvasId)
                .update();
        if (written == 0) {
            throw new NotFoundException("Canvas introuvable");
        }

        return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
    }

    private void requireServiceToken(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Jeton de service manquant");
        }
        byte[] provided = authorization.substring("Bearer ".length()).getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(provided, serviceToken)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Jeton de service invalide");
        }
    }

    private record StateRow(String seed, byte[] state) {
    }
}
