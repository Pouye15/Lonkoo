package com.lonkoo.backend.canvas;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

/**
 * Modèle d'exemple (seed) livré avec le backend et validé au démarrage contre
 * le schéma du canvas. Copie de {@code docs/exemples/marketplace-mobile.canvas.json}.
 */
@Component
public class SeedContent {

    private static final Logger log = LoggerFactory.getLogger(SeedContent.class);

    private final CanvasJsonValidator validator;
    private final String seedJson;

    public SeedContent(CanvasJsonValidator validator) {
        this.validator = validator;
        this.seedJson = load();
    }

    private String load() {
        try (InputStream in = new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Impossible de charger le seed du canvas", e);
        }
    }

    @PostConstruct
    void validateAtStartup() {
        List<String> errors = validator.validate(seedJson);
        if (!errors.isEmpty()) {
            log.error("Le seed du canvas est invalide : {}", errors);
            throw new IllegalStateException("Le seed du canvas est invalide : " + errors);
        }
        log.info("Seed du canvas validé ({} caractères)", seedJson.length());
    }

    public String json() {
        return seedJson;
    }
}