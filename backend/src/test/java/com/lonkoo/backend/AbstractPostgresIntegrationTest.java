package com.lonkoo.backend;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import tools.jackson.databind.ObjectMapper;

/**
 * Base des tests d'intégration : un seul PostgreSQL embarqué et un seul
 * contexte Spring partagés par toutes les sous-classes (démarrage unique).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
abstract class AbstractPostgresIntegrationTest {

    protected static final ObjectMapper JSON = new ObjectMapper();

    private static final EmbeddedPostgres POSTGRES = startPostgres();

    private static EmbeddedPostgres startPostgres() {
        try {
            EmbeddedPostgres pg = EmbeddedPostgres.start();
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                try {
                    pg.close();
                } catch (Exception ignored) {
                    // Arrêt.
                }
            }));
            return pg;
        } catch (Exception e) {
            throw new IllegalStateException("Impossible de démarrer PostgreSQL embarqué", e);
        }
    }

    /** Adresse JDBC de la base partagée, pour un test qui démarre l'application lui-même. */
    static String jdbcUrl() {
        return POSTGRES.getJdbcUrl("postgres", "postgres");
    }

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> POSTGRES.getJdbcUrl("postgres", "postgres"));
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "");
    }

    @Autowired
    protected MockMvc mockMvc;
}
