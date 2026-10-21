package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

/**
 * Le backend embarque une copie du schéma du canvas et du modèle d'exemple
 * (le Dockerfile ne voit que backend/). Les copies doivent rester identiques
 * aux fichiers de référence de docs/ : la CI échoue sinon.
 */
class SeedDriftTest {

    @Test
    void embeddedSchemaMatchesDocs() throws IOException {
        assertSameAsDocs("seed/canvas.schema.json", "../docs/canvas.schema.json");
    }

    @Test
    void embeddedSeedMatchesDocsExample() throws IOException {
        assertSameAsDocs("seed/marketplace-mobile.canvas.json", "../docs/exemples/marketplace-mobile.canvas.json");
    }

    private void assertSameAsDocs(String classpathCopy, String docsPath) throws IOException {
        Path reference = Path.of(docsPath);
        // Hors du monorepo (archive des sources seules), il n'y a rien à comparer.
        assumeTrue(Files.exists(reference), docsPath + " absent");

        String embedded = new String(new ClassPathResource(classpathCopy).getInputStream().readAllBytes(),
                StandardCharsets.UTF_8);
        String original = Files.readString(reference, StandardCharsets.UTF_8);

        assertThat(normalize(embedded))
                .as("%s doit rester identique à %s (copier le fichier de docs/)", classpathCopy, docsPath)
                .isEqualTo(normalize(original));
    }

    /** Fins de ligne et espaces de fin de fichier ne comptent pas (autocrlf sous Windows). */
    private String normalize(String text) {
        return text.replace("\r\n", "\n").stripTrailing();
    }
}
