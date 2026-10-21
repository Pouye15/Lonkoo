package com.lonkoo.backend.generation;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Noms du code généré, tirés des identifiants du contrat ({@code ^[a-z][a-z0-9_]{0,30}$}) : classes, champs,
 * méthodes. Aucun nom ne doit entrer en collision avec le JDK, les bibliothèques importées par le code généré
 * ou les classes que le générateur écrit lui-même (une table nommée « string » ne doit pas masquer
 * {@code java.lang.String}).
 */
final class Naming {

    /** Mots-clés et littéraux réservés de Java 21 (un champ nommé ainsi ne compilerait pas). */
    private static final Set<String> JAVA_KEYWORDS = Set.of(
            "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
            "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float",
            "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native",
            "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
            "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
            "volatile", "while", "true", "false", "null", "record", "var", "yield", "sealed", "permits",
            "non", "when", "with", "module", "open", "exports", "requires", "to", "uses", "provides");

    /** Noms simples déjà pris : classes de java.lang, types et annotations importés par le code généré. */
    private static final Set<String> TAKEN_CLASS_NAMES = Set.of(
            // java.lang
            "Object", "Class", "String", "StringBuilder", "StringBuffer", "Math", "System", "Thread", "Runnable",
            "Record", "Enum", "Number", "Void", "Character", "Byte", "Short", "Integer", "Long", "Float",
            "Double", "Boolean", "Exception", "Error", "Throwable", "RuntimeException", "Override", "Deprecated",
            "Iterable", "Comparable", "Process", "Package", "Module", "Runtime", "Readable", "Appendable",
            "AutoCloseable", "CharSequence", "Cloneable", "SafeVarargs", "SuppressWarnings", "FunctionalInterface",
            // java.util et java.time, java.math
            "List", "Map", "Set", "Optional", "UUID", "BigDecimal", "BigInteger", "LocalDate", "Instant",
            "Collection", "Arrays", "Objects", "Collections",
            // Jakarta Persistence, Hibernate, Spring
            "Entity", "Table", "Id", "Column", "GeneratedValue", "GenerationType", "JdbcTypeCode", "SqlTypes",
            "JpaRepository", "SpringApplication", "SpringBootApplication", "RestController", "RequestMapping",
            "GetMapping", "PostMapping", "PutMapping", "PatchMapping", "DeleteMapping", "PathVariable",
            "RequestBody", "ResponseEntity", "ResponseStatus", "HttpStatus", "ResponseStatusException",
            "Repository", "Component", "Service", "Controller", "Configuration", "Bean",
            // classes écrites par le générateur
            "Application", "Entities", "ApiErrorHandler");

    private Naming() {
    }

    static boolean isJavaKeyword(String word) {
        return JAVA_KEYWORDS.contains(word);
    }

    /** Vrai si ce nom simple est déjà pris : par {@code taken} ou par une classe du JDK, de Spring ou du générateur. */
    static boolean isTaken(String className, Set<String> taken) {
        return taken.contains(className) || TAKEN_CLASS_NAMES.contains(className);
    }

    /** {@code api_marketplace} devient {@code ApiMarketplace}. */
    static String pascal(String ident) {
        StringBuilder out = new StringBuilder();
        for (String part : ident.split("_")) {
            if (part.isEmpty()) {
                continue;
            }
            out.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
        }
        return out.isEmpty() ? "X" : out.toString();
    }

    /** {@code cree_le} devient {@code creeLe} ; un mot-clé Java reçoit le suffixe {@code Value}. */
    static String camel(String ident) {
        String pascal = pascal(ident);
        String camel = Character.toLowerCase(pascal.charAt(0)) + pascal.substring(1);
        return JAVA_KEYWORDS.contains(camel) ? camel + "Value" : camel;
    }

    /**
     * Nom de classe libre, dérivé de l'identifiant : le nom tel quel s'il est disponible, sinon avec le suffixe
     * {@code suffix}, puis numéroté. Le nom retenu est ajouté à {@code taken}.
     */
    static String className(String ident, String suffix, Set<String> taken) {
        String base = pascal(ident);
        String candidate = base;
        if (taken.contains(candidate) || TAKEN_CLASS_NAMES.contains(candidate)) {
            candidate = base + suffix;
        }
        for (int n = 2; taken.contains(candidate) || TAKEN_CLASS_NAMES.contains(candidate); n++) {
            candidate = base + suffix + n;
        }
        taken.add(candidate);
        return candidate;
    }

    /** Nom unique parmi {@code taken} : {@code base}, puis {@code base2}, {@code base3}… ; il est ajouté à {@code taken}. */
    static String unique(String base, Set<String> taken) {
        String candidate = base;
        for (int n = 2; !taken.add(candidate); n++) {
            candidate = base + n;
        }
        return candidate;
    }

    /** Nom d'un paramètre ou d'une méthode à partir de segments quelconques de chemin : lettres et chiffres seulement. */
    static String camelFromSegments(String text) {
        StringBuilder out = new StringBuilder();
        boolean upper = false;
        for (char c : text.toLowerCase(Locale.ROOT).toCharArray()) {
            if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
                out.append(upper ? Character.toUpperCase(c) : c);
                upper = false;
            } else {
                upper = out.length() > 0;
            }
        }
        if (out.isEmpty() || Character.isDigit(out.charAt(0))) {
            out.insert(0, 'p');
        }
        String name = out.toString();
        return JAVA_KEYWORDS.contains(name) ? name + "Value" : name;
    }

    /** Variante d'un ensemble pour les besoins d'un seul fichier. */
    static Set<String> newSet() {
        return new HashSet<>();
    }
}
