package com.lonkoo.backend.canvas;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Locale;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

/**
 * Les modèles de départ : le catalogue contient ceux qu'on annonce, chacun est un canvas valide du contrat avec un titre et
 * une description à afficher, et aucun ne nomme une marque (les blocs de paiement et de messagerie restent génériques).
 */
class TemplateCatalogTest {

    private static TemplateCatalog catalog() {
        TemplateCatalog catalog = new TemplateCatalog(new CanvasValidator(new CanvasJsonValidator()));
        catalog.load();
        return catalog;
    }

    @Test
    void theCatalogListsTheFiveTemplatesInFrenchAlphabeticalOrderOfTheirTitle() {
        assertThat(catalog().list()).extracting(TemplateCatalog.Template::id).containsExactly(
                "clinique-rendez-vous", "ecole-inscriptions", "livraison-colis", "marketplace-mobile", "tontine-numerique");
    }

    @Test
    void everyTemplateHasATitleADescriptionAndARealArchitecture() {
        for (TemplateCatalog.Template template : catalog().list()) {
            assertThat(template.name()).as(template.id()).isNotBlank().hasSizeLessThanOrEqualTo(80);
            assertThat(template.description()).as(template.id()).isNotBlank().hasSizeLessThanOrEqualTo(500);
            assertThat(template.blocks()).as("blocs de " + template.id()).isGreaterThanOrEqualTo(7);
            assertThat(template.links()).as("liens de " + template.id()).isGreaterThanOrEqualTo(6);
        }
    }

    @Test
    void everyTemplateUsesMostBlockTypesSoThatTheyShowWhatTheStudioCanDo() {
        for (TemplateCatalog.Template template : catalog().list()) {
            var types = new java.util.TreeSet<String>();
            JsonMapper.shared().readTree(template.json()).path("nodes").forEach(node -> types.add(node.path("type").asText()));
            assertThat(types).as("types de blocs de " + template.id()).contains("webapp", "service", "database", "auth");
            assertThat(types.size()).as("variété des blocs de " + template.id()).isGreaterThanOrEqualTo(6);
        }
    }

    @Test
    void noTemplateNamesABrand() {
        // Règle du dépôt : paiement mobile et messagerie sont génériques, sans marque ni intégration réelle.
        List<String> brands = List.of("orange money", "wave", "mtn", "moov", "m-pesa", "mpesa", "free money", "flutterwave",
                "paystack", "cinetpay", "twilio", "africa's talking", "stripe", "paypal");
        for (TemplateCatalog.Template template : catalog().list()) {
            String text = template.json().toLowerCase(Locale.ROOT);
            for (String brand : brands) {
                assertThat(text).as("« %s » dans %s", brand, template.id()).doesNotContainPattern("\\b" + java.util.regex.Pattern.quote(brand) + "\\b");
            }
        }
    }

    @Test
    void findReturnsATemplateByIdAndNothingForAnUnknownOne() {
        TemplateCatalog catalog = catalog();

        assertThat(catalog.find("tontine-numerique")).isPresent().get().extracting(TemplateCatalog.Template::name)
                .asString().startsWith("Tontine");
        assertThat(catalog.find("inconnu")).isEmpty();
        assertThat(catalog.find("../etc/passwd")).as("jamais un chemin").isEmpty();
    }
}
