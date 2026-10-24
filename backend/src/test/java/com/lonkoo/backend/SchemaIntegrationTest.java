package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Schéma de la base après les migrations Flyway : version courante et index des recherches fréquentes.
 */
class SchemaIntegrationTest extends AbstractPostgresIntegrationTest {

    @Autowired
    private JdbcClient jdbc;

    @Test
    void allMigrationsAreApplied() {
        List<String> versions = jdbc.sql("select version from flyway_schema_history where success order by installed_rank")
                .query(String.class).list();
        assertThat(versions).containsExactly("1", "2", "3", "10", "11", "12");
    }

    @Test
    void frequentLookupsAreIndexed() {
        List<String> indexes = jdbc.sql("select indexname from pg_indexes where schemaname = 'public'")
                .query(String.class).list();
        assertThat(indexes).contains(
                "project_members_par_utilisateur",
                "canvases_par_projet",
                "share_links_par_canvas",
                "share_links_identifiant",
                "audit_log_par_cible",
                "canvas_versions_par_canvas",
                "generations_par_canvas",
                "deployments_par_generation");
    }

    @Test
    void theIndexesCoverTheColumnsOfTheCommonQueries() {
        assertThat(columnsOf("project_members_par_utilisateur")).containsExactly("user_id");
        assertThat(columnsOf("canvases_par_projet")).containsExactly("project_id");
        assertThat(columnsOf("share_links_par_canvas")).containsExactly("canvas_id");
        assertThat(columnsOf("audit_log_par_cible")).containsExactly("target");
        assertThat(columnsOf("generations_par_canvas")).containsExactly("canvas_id", "created_at");
        assertThat(columnsOf("deployments_par_generation")).containsExactly("generation_id", "created_at");
    }

    private List<String> columnsOf(String index) {
        return jdbc.sql("""
                select a.attname
                from pg_index i
                join pg_class c on c.oid = i.indexrelid
                join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
                where c.relname = ?
                order by a.attnum
                """)
                .param(index).query(String.class).list();
    }
}
