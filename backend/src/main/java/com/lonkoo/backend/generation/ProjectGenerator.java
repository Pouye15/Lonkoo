package com.lonkoo.backend.generation;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.springframework.stereotype.Component;

import com.lonkoo.backend.canvas.CanvasValidator;
import com.lonkoo.backend.canvas.InvalidCanvasException;

import tools.jackson.databind.JsonNode;

/**
 * Génère un projet (API Spring Boot, interfaces Next.js, documentation, OpenAPI, Docker, workflow de déploiement)
 * à partir d'un instantané du canvas. Le générateur est une fonction pure : même instantané et même nom, même
 * projet, octet pour octet ; aucune entrée-sortie.
 *
 * <p>L'instantané est revalidé ici (schéma et règles du contrat) : le générateur ne se fie jamais à son appelant,
 * car seuls des identifiants validés ont le droit d'entrer dans le code, les chemins de fichiers et le SQL.</p>
 */
@Component
public class ProjectGenerator {

    private final CanvasValidator validator;

    public ProjectGenerator(CanvasValidator validator) {
        this.validator = validator;
    }

    /**
     * @param snapshot    instantané du canvas (contrat, version 1)
     * @param projectName nom du projet, texte libre (titres, documentation) ; sert aussi à nommer le dépôt
     * @throws InvalidCanvasException si l'instantané ne respecte pas le contrat
     */
    public GeneratedProject generate(JsonNode snapshot, String projectName) {
        List<String> errors = validator.validate(snapshot);
        if (!errors.isEmpty()) {
            throw new InvalidCanvasException(errors);
        }
        BlueprintModel model = BlueprintModel.of(snapshot, projectName);
        Map<String, String> files = new TreeMap<>();
        List<String> warnings = new ArrayList<>();

        SpringBackendWriter backend = new SpringBackendWriter(model, files, warnings);
        backend.write();
        FrontendWriter frontends = new FrontendWriter(model, files);
        frontends.write();
        new OpenApiWriter(model, files, backend).write();
        new InfraWriter(model, files, backend, frontends).write();
        new DocsWriter(model, files, backend, frontends).write();

        return new GeneratedProject(model.displayName, model.slug, files, warnings);
    }
}
