package com.lonkoo.backend.generation;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Échappements du texte libre du canvas (titres, résumés, nom du projet) pour chaque format de sortie.
 *
 * <p>Règle du générateur : seuls les identifiants validés par le contrat ({@code ident}) entrent dans le code,
 * les noms de fichiers et le SQL. Le texte libre ne va que dans des commentaires, de l'OpenAPI, du Markdown, du
 * Mermaid, du JSON ou du XML, et chaque destination a ici son échappement. Un texte hostile reste du texte.</p>
 */
final class Texts {

    private static final JsonMapper JSON = JsonMapper.shared();

    private Texts() {
    }

    /** Retire les caractères de contrôle et les séparateurs de ligne Unicode, réduit les blancs. */
    static String plain(String text, int maxLength) {
        if (text == null) {
            return "";
        }
        String cleaned = text
                .replaceAll("[\\p{Cntrl}\\u2028\\u2029\\u0085\\uFFFE\\uFFFF]+", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return cleaned.length() <= maxLength ? cleaned : cleaned.substring(0, maxLength).trim();
    }

    /**
     * Texte sûr dans un commentaire Java. Le backslash est supprimé : Java interprète {@code \}{@code u000a}
     * (retour à la ligne) <em>dans les commentaires aussi</em>, ce qui permettrait de sortir du commentaire.
     * Les ouvertures et fermetures de commentaire sont retirées.
     */
    static String javaComment(String text, int maxLength) {
        return plain(text, maxLength).replace("\\", "").replace("*/", "* /").replace("/*", "/ *");
    }

    /** Littéral de chaîne Java (guillemets compris) ; les caractères non ASCII et les backslashs sont écrits en échappements. */
    static String javaString(String text) {
        StringBuilder out = new StringBuilder("\"");
        for (char c : text.toCharArray()) {
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20 || c > 0x7E) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        return out.append('"').toString();
    }

    /**
     * Chaîne YAML entre guillemets. Une chaîne JSON est un scalaire YAML valide ; les séparateurs de ligne que
     * YAML 1.1 reconnaît en plus de JSON sont écrits en échappements.
     */
    static String yaml(String text) {
        return jsonString(text).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029").replace("\u0085", "\\u0085");
    }

    /**
     * Chaîne JSON entre guillemets, sûre aussi dans du JavaScript : une balise de fermeture {@code </} y est
     * neutralisée. Cet échappement est valable en JSON et en JavaScript, mais pas en YAML 1.1 (voir {@link #yaml}).
     */
    static String json(String text) {
        return jsonString(text).replace("</", "<\\/");
    }

    private static String jsonString(String text) {
        try {
            return JSON.writeValueAsString(text);
        } catch (JacksonException e) {
            throw new IllegalStateException("Texte non sérialisable", e);
        }
    }

    /** Texte Markdown inerte : pas de mise en forme, de lien, de balise HTML, de tableau ni de titre. */
    static String markdown(String text, int maxLength) {
        String plain = plain(text, maxLength);
        StringBuilder out = new StringBuilder();
        for (char c : plain.toCharArray()) {
            if ("\\`*_{}[]()<>#+!|&~".indexOf(c) >= 0) {
                out.append('\\');
            }
            out.append(c);
        }
        return out.toString();
    }

    /** Texte d'un élément XML (le {@code pom.xml}). */
    static String xml(String text, int maxLength) {
        return plain(text, maxLength)
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }

    /** Étiquette Mermaid : même règle que l'export du front (voir {@code canvas-export.ts}). */
    static String mermaid(String text) {
        return plain(text, 200)
                .replace("#", "#35;")
                .replace("`", "#96;")
                .replace("&", "#amp;")
                .replace("\"", "#quot;")
                .replace("<", "#lt;")
                .replace(">", "#gt;");
    }
}
