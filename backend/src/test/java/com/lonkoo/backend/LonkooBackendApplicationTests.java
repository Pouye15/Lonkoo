package com.lonkoo.backend;

import org.junit.jupiter.api.Test;

/**
 * Vérifie que le contexte Spring Boot démarre, avec la configuration réelle
 * (profil « test »), sur une base PostgreSQL embarquée native
 * (io.zonky.test:embedded-postgres), sans Docker ni Testcontainers.
 */
class LonkooBackendApplicationTests extends AbstractPostgresIntegrationTest {

    @Test
    void contextLoads() {
    }
}
