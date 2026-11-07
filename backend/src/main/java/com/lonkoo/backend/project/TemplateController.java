package com.lonkoo.backend.project;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lonkoo.backend.canvas.TemplateCatalog;
import com.lonkoo.backend.web.TemplateResponse;

/**
 * Modèles de départ proposés à la création d'un projet. Réservé aux personnes connectées (comme le reste de l'API).
 */
@RestController
@RequestMapping("/api")
public class TemplateController {

    private final TemplateCatalog catalog;

    public TemplateController(TemplateCatalog catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/templates")
    List<TemplateResponse> list() {
        return catalog.list().stream()
                .map(template -> new TemplateResponse(
                        template.id(), template.name(), template.description(), template.blocks(), template.links()))
                .toList();
    }
}
