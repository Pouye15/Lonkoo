package com.lonkoo.backend.canvas;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
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

    // --- Ce que la relecture des modèles (docs/MODELES-DE-DEPART.md) a établi, et que ces tests empêchent de perdre ---

    /**
     * Jeu GSM 7 bits de base (GSM 03.38) utile en français. Un seul caractère hors de ce jeu (ê, â, ô, û, î, ï, ë, œ,
     * l'apostrophe typographique, les guillemets « ») fait passer tout le SMS en UCS-2 : 70 caractères au lieu de 160.
     */
    private static final String GSM_7 =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 \n.,:;!?'\"()/-+=<>%&*@#$_éèàùÉÇ";

    private static List<JsonNode> blocksOfType(TemplateCatalog.Template template, String type) {
        List<JsonNode> found = new ArrayList<>();
        JsonMapper.shared().readTree(template.json()).path("nodes").forEach(node -> {
            if (node.path("type").asText().equals(type)) {
                found.add(node);
            }
        });
        return found;
    }

    @Test
    void everySmsFitsInOneMessageAndEveryUssdScreenInOneScreen() {
        for (TemplateCatalog.Template template : catalog().list()) {
            for (JsonNode block : blocksOfType(template, "messaging")) {
                String channel = block.path("data").path("channel").asText();
                for (JsonNode model : block.path("data").path("templates")) {
                    String text = model.path("text").asText();
                    String where = template.id() + " / " + model.path("name").asText();
                    if (channel.equals("sms") || channel.equals("ussd")) {
                        assertThat(text.length()).as("longueur de %s (un SMS ou un écran USSD : 160 caractères)", where)
                                .isLessThanOrEqualTo(160);
                    }
                    if (channel.equals("sms")) {
                        List<String> outside = text.chars().filter(c -> GSM_7.indexOf(c) < 0)
                                .mapToObj(c -> String.valueOf((char) c)).distinct().toList();
                        assertThat(outside).as("caractères hors GSM 7 bits dans %s", where).isEmpty();
                    }
                }
            }
        }
    }

    @Test
    void everyTemplateWithAMobilePaymentKeepsAUniquePaymentReference() {
        // Un opérateur peut rappeler deux fois pour le même paiement : la référence unique fait refuser (409) le doublon.
        for (TemplateCatalog.Template template : catalog().list()) {
            if (blocksOfType(template, "mobile-payment").isEmpty()) {
                continue;
            }
            boolean hasReference = false;
            for (JsonNode database : blocksOfType(template, "database")) {
                for (JsonNode entity : database.path("data").path("entities")) {
                    for (JsonNode field : entity.path("fields")) {
                        hasReference |= field.path("name").asText().startsWith("reference") && field.path("unique").asBoolean(false);
                    }
                }
            }
            assertThat(hasReference).as("référence de paiement unique dans %s", template.id()).isTrue();
        }
    }

    @Test
    void everyEntityDesignatedByAnIdFieldCanBeCreatedThroughTheApi() {
        // Sans « POST /medecins », le champ medecin_id d'un rendez-vous n'aurait jamais de valeur.
        for (TemplateCatalog.Template template : catalog().list()) {
            Set<String> entities = new LinkedHashSet<>();
            for (JsonNode database : blocksOfType(template, "database")) {
                database.path("data").path("entities").forEach(entity -> entities.add(entity.path("name").asText()));
            }
            Set<String> creatable = new LinkedHashSet<>();
            for (JsonNode service : blocksOfType(template, "service")) {
                for (JsonNode endpoint : service.path("data").path("endpoints")) {
                    String target = entityOf(endpoint.path("path").asText(), entities);
                    if (target != null && endpoint.path("method").asText().equals("POST")) {
                        creatable.add(target);
                    }
                }
            }
            for (JsonNode database : blocksOfType(template, "database")) {
                for (JsonNode entity : database.path("data").path("entities")) {
                    for (JsonNode field : entity.path("fields")) {
                        String name = field.path("name").asText();
                        if (field.path("type").asText().equals("uuid") && name.endsWith("_id")) {
                            String target = name.substring(0, name.length() - "_id".length());
                            if (entities.contains(target)) {
                                assertThat(creatable).as("%s.%s désigne « %s » (%s)", entity.path("name").asText(), name, target, template.id())
                                        .contains(target);
                            }
                        }
                    }
                }
            }
        }
    }

    /** Même règle que le générateur : « /commandes » désigne l'entité « commande » (s, es ou x retirés), « /rendez-vous » l'entité « rendez_vous ». */
    private static String entityOf(String path, Set<String> entities) {
        String[] segments = java.util.Arrays.stream(path.split("/")).filter(part -> !part.isEmpty()).toArray(String[]::new);
        if (segments.length != 1) {
            return null;
        }
        String segment = segments[0].replace('-', '_');
        for (String suffix : List.of("", "s", "es", "x")) {
            String candidate = !suffix.isEmpty() && segment.endsWith(suffix) && segment.length() > suffix.length()
                    ? segment.substring(0, segment.length() - suffix.length()) : segment;
            if (entities.contains(candidate)) {
                return candidate;
            }
        }
        return null;
    }
}
