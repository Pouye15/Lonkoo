package com.lonkoo.backend.generation;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Le projet généré : un fichier texte par chemin (triés, donc le même canvas donne toujours le même projet), les
 * avertissements du générateur et le nom de dépôt suggéré.
 */
public record GeneratedProject(String name, String slug, Map<String, String> files, List<String> warnings) {

    public GeneratedProject {
        files = java.util.Collections.unmodifiableMap(new TreeMap<>(files));
        warnings = List.copyOf(warnings);
    }

    public int fileCount() {
        return files.size();
    }

    /** Taille cumulée des fichiers, en octets (UTF-8). */
    public long totalBytes() {
        long total = 0;
        for (String content : files.values()) {
            total += content.getBytes(StandardCharsets.UTF_8).length;
        }
        return total;
    }

    /** Les fichiers de workflow GitHub Actions : GitHub ne les accepte que d'un jeton autorisé à les écrire. */
    public List<String> workflowPaths() {
        return files.keySet().stream().filter(path -> path.startsWith(".github/workflows/")).toList();
    }
}
