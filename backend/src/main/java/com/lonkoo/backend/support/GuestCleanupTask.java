package com.lonkoo.backend.support;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Supprime quotidiennement les invités expirés et les liens de partage
 * périmés. La suppression en cascade (clés étrangères des projets, membres,
 * canvas) est gérée par la base.
 */
@Component
public class GuestCleanupTask {

    private static final Logger log = LoggerFactory.getLogger(GuestCleanupTask.class);

    private final JdbcClient jdbcClient;

    public GuestCleanupTask(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    @Scheduled(cron = "${lonkoo.guest-cleanup-cron:0 15 3 * * *}")
    public void purgeExpired() {
        int guests = jdbcClient.sql(
                "delete from users where is_guest and expires_at is not null and expires_at < now()")
                .update();
        int links = jdbcClient.sql("delete from share_links where expires_at < now()").update();
        if (guests > 0 || links > 0) {
            log.info("Purge : {} invités expirés, {} liens de partage périmés", guests, links);
        }
    }
}
