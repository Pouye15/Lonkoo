package com.lonkoo.backend.support;

import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Journal d'audit (table {@code audit_log}, en ajout seul). Ne journalise
 * jamais de jeton ni de contenu sensible.
 */
@Service
public class AuditService {

    private final JdbcClient jdbcClient;

    public AuditService(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public void record(UUID actorId, String action, String target, String detail) {
        if (detail == null) {
            jdbcClient.sql("insert into audit_log (actor_id, action, target) values (?, ?, ?)")
                    .param(actorId)
                    .param(action)
                    .param(target)
                    .update();
        } else {
            jdbcClient.sql("insert into audit_log (actor_id, action, target, detail) values (?, ?, ?, ?::jsonb)")
                    .param(actorId)
                    .param(action)
                    .param(target)
                    .param(detail)
                    .update();
        }
    }
}