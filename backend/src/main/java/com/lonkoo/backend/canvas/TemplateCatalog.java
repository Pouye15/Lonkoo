package com.lonkoo.backend.canvas;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.Collator;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import jakarta.annotation.PostConstruct;

/**
 * Modèles de départ : les canvas complets que l'on choisit en créant un projet (marketplace, clinique, école, tontine,
 * livraison de colis). Ce sont les fichiers {@code seed/*.canvas.json} du backend, copies de {@code docs/exemples/} ;
 * l'identifiant d'un modèle est le début de son nom de fichier, son titre et sa description sont le {@code meta} du canvas.
 *
 * <p>Chaque modèle est validé au démarrage contre le contrat du canvas (schéma et règles métier) : un modèle invalide
 * empêche le démarrage, comme le seed d'un invité, plutôt que de livrer à un utilisateur un canvas que le générateur
 * refuserait.</p>
 */
@Component
public class TemplateCatalog {

    private static final Logger log = LoggerFactory.getLogger(TemplateCatalog.class);
    private static final String SUFFIX = ".canvas.json";
    private static final Pattern ID = Pattern.compile("^[a-z0-9-]{1,40}$");

    /** Un modèle : son identifiant, ce qu'on en affiche, et son contenu JSON tel qu'il est enregistré dans le canvas. */
    public record Template(String id, String name, String description, int blocks, int links, String json) {
    }

    private final CanvasValidator validator;
    private List<Template> templates = List.of();

    public TemplateCatalog(CanvasValidator validator) {
        this.validator = validator;
    }

    @PostConstruct
    void load() {
        List<Template> loaded;
        try {
            Resource[] resources = new PathMatchingResourcePatternResolver().getResources("classpath:seed/*" + SUFFIX);
            loaded = new java.util.ArrayList<>();
            for (Resource resource : resources) {
                loaded.add(read(resource));
            }
        } catch (IOException e) {
            throw new IllegalStateException("Impossible de lire les modèles de départ", e);
        }
        if (loaded.isEmpty()) {
            throw new IllegalStateException("Aucun modèle de départ trouvé dans seed/*" + SUFFIX);
        }
        // Ordre stable et lisible : par titre, à la française (« École » se range avec les E).
        Collator french = Collator.getInstance(Locale.FRENCH);
        loaded.sort(Comparator.comparing(Template::name, french));
        templates = List.copyOf(loaded);
        log.info("{} modèles de départ validés : {}", templates.size(), templates.stream().map(Template::id).toList());
    }

    private Template read(Resource resource) throws IOException {
        String filename = resource.getFilename();
        String id = filename.substring(0, filename.length() - SUFFIX.length());
        if (!ID.matcher(id).matches()) {
            throw new IllegalStateException("Identifiant de modèle invalide (minuscules, chiffres et tirets) : " + filename);
        }
        String json = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        JsonNode tree = JsonMapper.shared().readTree(json);
        List<String> errors = validator.validate(tree);
        if (!errors.isEmpty()) {
            throw new IllegalStateException("Le modèle « " + id + " » est invalide : " + errors);
        }
        String name = tree.path("meta").path("name").asText("");
        String description = tree.path("meta").path("description").asText("");
        if (name.isBlank() || description.isBlank()) {
            throw new IllegalStateException("Le modèle « " + id + " » doit avoir un meta.name et un meta.description");
        }
        return new Template(id, name, description, tree.path("nodes").size(), tree.path("edges").size(), json);
    }

    public List<Template> list() {
        return templates;
    }

    public Optional<Template> find(String id) {
        return templates.stream().filter(template -> template.id().equals(id)).findFirst();
    }
}
