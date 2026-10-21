package com.lonkoo.backend.canvas;

import java.util.Set;

/**
 * Mots qu'un identifiant technique (`name` d'un bloc, d'une entité ou d'un champ, page, topic, gabarit)
 * ne peut pas porter : ils finiraient tels quels dans du code Java, une table SQL ou un fichier YAML
 * générés. Les identifiants du contrat sont en minuscules ({@code ^[a-z][a-z0-9_]{0,30}$}) : la liste l'est aussi.
 */
final class ReservedWords {

    /** Mots-clés, littéraux et identifiants restreints de Java 21. */
    private static final Set<String> JAVA = Set.of(
            "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
            "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float",
            "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native",
            "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
            "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
            "volatile", "while", "true", "false", "null", "record", "var", "yield", "sealed", "permits");

    /** Mots réservés courants de SQL (PostgreSQL et SQL standard). */
    private static final Set<String> SQL = Set.of(
            "all", "alter", "analyse", "analyze", "and", "any", "array", "as", "asc", "begin", "between",
            "by", "cast", "check", "collate", "column", "commit", "constraint", "create", "cross",
            "current_date", "current_time", "current_timestamp", "current_user", "database", "delete",
            "desc", "distinct", "drop", "else", "end", "except", "exists", "false", "fetch", "for",
            "foreign", "from", "full", "grant", "group", "having", "in", "index", "inner", "insert",
            "intersect", "into", "is", "join", "key", "left", "like", "limit", "natural", "not", "null",
            "offset", "on", "or", "order", "outer", "primary", "references", "right", "rollback", "schema",
            "select", "session_user", "set", "some", "table", "then", "to", "trigger", "true", "union",
            "unique", "update", "user", "using", "values", "view", "when", "where", "with");

    /** Valeurs que YAML 1.1 lit comme des booléens ou le néant lorsqu'elles ne sont pas entre guillemets. */
    private static final Set<String> YAML = Set.of(
            "true", "false", "null", "yes", "no", "on", "off", "y", "n");

    private ReservedWords() {
    }

    static boolean isReserved(String identifier) {
        return JAVA.contains(identifier) || SQL.contains(identifier) || YAML.contains(identifier);
    }
}
