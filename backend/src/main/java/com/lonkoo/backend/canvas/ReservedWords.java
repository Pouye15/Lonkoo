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

    /** Mots réservés de PostgreSQL et courants de SQL standard (un identifiant ainsi nommé casserait la table générée). */
    private static final Set<String> SQL = Set.of(
            "all", "alter", "analyse", "analyze", "and", "any", "array", "as", "asc", "asymmetric",
            "authorization", "begin", "between", "binary", "both", "by", "cast", "check", "collate",
            "collation", "column", "commit", "concurrently", "constraint", "create", "cross",
            "current_catalog", "current_date", "current_role", "current_schema", "current_time",
            "current_timestamp", "current_user", "database", "deferrable", "delete", "desc", "distinct",
            "do", "drop", "else", "end", "except", "exists", "false", "fetch", "for", "foreign", "freeze",
            "from", "full", "grant", "group", "having", "ilike", "in", "index", "initially", "inner",
            "insert", "intersect", "into", "is", "isnull", "join", "key", "lateral", "leading", "left",
            "like", "limit", "localtime", "localtimestamp", "natural", "not", "notnull", "null", "offset",
            "on", "only", "or", "order", "outer", "overlaps", "placing", "primary", "references",
            "returning", "right", "rollback", "schema", "select", "session_user", "set", "similar", "some",
            "symmetric", "system_user", "table", "tablesample", "then", "to", "trailing", "trigger", "true",
            "union", "unique", "update", "user", "using", "values", "variadic", "verbose", "view", "when",
            "where", "window", "with");

    /** Valeurs que YAML 1.1 lit comme des booléens ou le néant lorsqu'elles ne sont pas entre guillemets. */
    private static final Set<String> YAML = Set.of(
            "true", "false", "null", "yes", "no", "on", "off", "y", "n");

    private ReservedWords() {
    }

    static boolean isReserved(String identifier) {
        return JAVA.contains(identifier) || SQL.contains(identifier) || YAML.contains(identifier);
    }
}
