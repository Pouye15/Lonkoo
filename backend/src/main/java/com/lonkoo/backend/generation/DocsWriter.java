package com.lonkoo.backend.generation;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.SerializationFeature;

/**
 * Écrit la documentation du dépôt : {@code README.md}, {@code docs/architecture/} (schéma Mermaid des blocs,
 * modèle de données, ce qui a été généré) et l'instantané du canvas. Le texte libre y est échappé en Markdown
 * ({@link Texts#markdown}) ou en Mermaid ({@link Texts#mermaid}) ; GitHub affiche les schémas nativement.
 */
final class DocsWriter {

    private final BlueprintModel model;
    private final Map<String, String> files;
    private final SpringBackendWriter backend;
    private final FrontendWriter frontends;

    DocsWriter(BlueprintModel model, Map<String, String> files, SpringBackendWriter backend, FrontendWriter frontends) {
        this.model = model;
        this.files = files;
        this.backend = backend;
        this.frontends = frontends;
    }

    void write() {
        files.put("docs/architecture/architecture.md", architecture());
        if (backend.hasEntities()) {
            files.put("docs/architecture/data-model.md", dataModel());
        }
        files.put("docs/architecture/canvas.json", canvasJson());
        files.put("README.md", readme());
    }

    /* ------------------------------------------------------------------ */
    /* Mermaid                                                              */
    /* ------------------------------------------------------------------ */

    /** Schéma des blocs et de leurs liens ({@code flowchart LR}). */
    String flowchart() {
        Map<String, String> ids = new HashMap<>();
        StringBuilder out = new StringBuilder("flowchart LR\n");
        int index = 1;
        if (model.blocks.isEmpty()) {
            out.append("  %% Architecture vide\n");
        }
        for (BlueprintModel.Block block : model.blocks) {
            String id = "n" + index++;
            ids.put(block.id(), id);
            String label = Texts.mermaid(block.title());
            if (block.tech() != null && !block.tech().isBlank()) {
                label += "<br/>" + Texts.mermaid(block.tech());
            }
            String shape = switch (block.type()) {
                case "database" -> id + "[(\"" + label + "\")]";
                case "queue" -> id + "[[\"" + label + "\"]]";
                case "auth" -> id + "{{\"" + label + "\"}}";
                case "webapp" -> id + "([\"" + label + "\"])";
                default -> id + "[\"" + label + "\"]";
            };
            out.append("  ").append(shape).append('\n');
        }
        for (BlueprintModel.Link link : model.links) {
            String from = ids.get(link.source());
            String to = ids.get(link.target());
            if (from == null || to == null) {
                continue;
            }
            String arrow = switch (link.kind()) {
                case "event" -> "-.->";
                case "data" -> "==>";
                default -> "-->";
            };
            String label = link.label() != null && !link.label().isBlank() ? link.label() : link.kind();
            out.append("  ").append(from).append(' ').append(arrow).append("|\"").append(Texts.mermaid(label)).append("\"| ").append(to).append('\n');
        }
        return out.toString();
    }

    /** Diagramme entité-relation des tables ({@code erDiagram}). */
    String erDiagram() {
        StringBuilder out = new StringBuilder("erDiagram\n");
        for (SpringBackendWriter.EntityInfo entity : backend.entities()) {
            out.append("  ").append(entity.table()).append(" {\n");
            out.append("    uuid id PK\n");
            for (SpringBackendWriter.FieldInfo field : entity.fields()) {
                out.append("    ").append(field.field().type()).append(' ').append(field.column());
                if (field.field().unique()) {
                    out.append(" UK");
                }
                out.append('\n');
            }
            out.append("  }\n");
        }
        return out.toString();
    }

    /* ------------------------------------------------------------------ */
    /* Documents                                                            */
    /* ------------------------------------------------------------------ */

    private static final Map<String, String> TYPE_LABEL = Map.of(
            "webapp", "Application web", "service", "Service", "database", "Base de données",
            "auth", "Authentification", "queue", "File de messages", "mobile-payment", "Paiement mobile",
            "messaging", "Messagerie", "billing", "Facturation", "generic", "Bloc libre");

    /** Ce que le générateur a produit pour un bloc, et ce qui reste à faire. */
    private String generated(BlueprintModel.Block block) {
        return switch (block.type()) {
            case "database" -> "Migration SQL, entités JPA et dépôts (`backend/`).";
            case "service" -> "Contrôleur REST (`backend/`) : CRUD complet pour les endpoints qui portent le nom d'une table, squelette « 501 À implémenter » pour les autres.";
            case "webapp" -> "Application Next.js : une route par page (`" + frontendDirectory(block) + "/`).";
            case "auth" -> "*À implémenter* : méthode choisie `" + Texts.markdown(block.data().path("method").asText(""), 20) + "`.";
            case "queue" -> "*À implémenter* : file de messages et ses topics.";
            case "mobile-payment" -> "*À implémenter* : passerelle de paiement mobile (aucune intégration fournie).";
            case "messaging" -> "*À implémenter* : envoi de messages (aucune intégration fournie).";
            case "billing" -> "*À implémenter* : facturation.";
            default -> "Aucun code : bloc libre.";
        };
    }

    private String frontendDirectory(BlueprintModel.Block block) {
        return frontends.frontends().stream().filter(f -> f.block() == block).map(FrontendWriter.Frontend::directory).findFirst().orElse("frontend");
    }

    private String blocksTable() {
        StringBuilder table = new StringBuilder("| Bloc | Type | Génération |\n|---|---|---|\n");
        for (BlueprintModel.Block block : model.blocks) {
            table.append("| ").append(Texts.markdown(block.title(), 80)).append(" | ")
                    .append(TYPE_LABEL.getOrDefault(block.type(), block.type())).append(" | ")
                    .append(generated(block)).append(" |\n");
        }
        return table.toString();
    }

    private String architecture() {
        StringBuilder md = new StringBuilder();
        md.append("# Architecture de ").append(Texts.markdown(model.displayName, 80)).append("\n\n");
        md.append("Ce dossier décrit l'architecture dessinée dans LONKOO. Le schéma ci-dessous s'affiche directement sur GitHub.\n\n");
        md.append("```mermaid\n").append(flowchart()).append("```\n\n");
        md.append("## Blocs\n\n").append(blocksTable()).append('\n');
        if (backend.hasEntities()) {
            md.append("## Modèle de données\n\nVoir [data-model.md](data-model.md).\n\n");
        }
        md.append("## Source\n\n[canvas.json](canvas.json) est l'instantané du canvas dont ce dépôt est tiré (contrat LONKOO, version 1).\n");
        return md.toString();
    }

    private String dataModel() {
        StringBuilder md = new StringBuilder("# Modèle de données\n\n");
        md.append("Les tables ci-dessous sont créées par la migration `backend/src/main/resources/db/migration/V1__schema_initial.sql`.\n\n");
        md.append("```mermaid\n").append(erDiagram()).append("```\n\n");
        for (SpringBackendWriter.EntityInfo entity : backend.entities()) {
            md.append("## ").append(entity.table()).append("\n\n");
            md.append("Classe `").append(entity.className()).append("`.\n\n| Colonne | Type | Contraintes |\n|---|---|---|\n");
            md.append("| id | uuid | clé primaire |\n");
            for (SpringBackendWriter.FieldInfo field : entity.fields()) {
                List<String> constraints = new java.util.ArrayList<>();
                if (field.field().required()) {
                    constraints.add("obligatoire");
                }
                if (field.field().unique()) {
                    constraints.add("unique");
                }
                md.append("| ").append(field.column()).append(" | ").append(field.field().type()).append(" | ")
                        .append(String.join(", ", constraints)).append(" |\n");
            }
            md.append('\n');
        }
        return md.toString();
    }

    private String canvasJson() {
        try {
            JsonMapper mapper = JsonMapper.builder().enable(SerializationFeature.INDENT_OUTPUT).build();
            JsonNode snapshot = model.snapshot;
            return mapper.writeValueAsString(snapshot) + "\n";
        } catch (JacksonException e) {
            throw new IllegalStateException("Instantané non sérialisable", e);
        }
    }

    private String readme() {
        StringBuilder md = new StringBuilder();
        md.append("# ").append(Texts.markdown(model.displayName, 80)).append("\n\n");
        md.append("> Projet généré par LONKOO à partir d'un canvas d'architecture. Le code est un point de départ : ce qui reste à écrire est indiqué plus bas.\n\n");
        md.append("## Sécurité : à lire avant de déployer\n\n");
        md.append("**L'API générée n'a pas d'authentification** : toute personne qui connaît son adresse peut lire, créer, modifier ")
                .append("et supprimer les données.");
        if (!model.ofType("auth").isEmpty()) {
            md.append(" Le bloc d'authentification du canvas est décrit dans la documentation, mais il n'est pas codé.");
        }
        md.append(" Avant de la mettre sur une adresse publique avec de vraies données, ajoutez l'authentification et changez les ")
                .append("mots de passe (voir `.env.example`).\n\n");
        md.append("## Architecture\n\n```mermaid\n").append(flowchart()).append("```\n\n");
        md.append("Détail dans [docs/architecture](docs/architecture/architecture.md).\n\n");

        md.append("## Démarrer\n\nPrérequis : Docker et Docker Compose.\n\n```bash\ndocker compose up --build\n```\n\n");
        md.append("- API : <http://localhost:8080> (santé : `/actuator/health`)\n");
        int port = 3000;
        for (FrontendWriter.Frontend frontend : frontends.frontends()) {
            md.append("- Interface `").append(frontend.directory()).append("` : <http://localhost:").append(port++).append(">\n");
        }
        md.append("- Contrat d'API : [openapi.yaml](openapi.yaml)\n\n");
        md.append("Les valeurs par défaut conviennent au développement local ; en production, copier `.env.example` en `.env` et changer les mots de passe.\n\n");

        md.append("## Blocs du canvas\n\n").append(blocksTable()).append('\n');

        md.append("## À compléter\n\n");
        List<SpringBackendWriter.Operation> stubs = backend.operations().stream().filter(op -> op.kind() == SpringBackendWriter.Kind.STUB).toList();
        if (stubs.isEmpty()) {
            md.append("- Les endpoints du canvas qui portent le nom d'une table ont un CRUD complet ; relisez-les avant de les exposer (les entités sont renvoyées telles quelles).\n");
        } else {
            md.append("Endpoints à implémenter (ils répondent `501`) :\n\n");
            stubs.forEach(op -> md.append("- `").append(op.method()).append(' ').append(op.path()).append("`\n"));
        }
        md.append("- Authentification, files de messages, paiement, messagerie et facturation : aucune intégration réelle n'est générée.\n");
        md.append("- Aucun test n'est généré.\n\n");

        md.append("## Déploiement sur un serveur Systalink\n\n");
        md.append("Le fichier `.github/workflows/deploy-systalink.yml` (déclenché à la main, ou par LONKOO) envoie le projet par SSH et lance `docker compose up -d --build`. ")
                .append("Créez d'abord ces secrets dans les réglages du dépôt (*Settings › Secrets and variables › Actions*) :\n\n");
        md.append("| Secret | Contenu |\n|---|---|\n");
        md.append("| `SYSTALINK_SSH_HOST` | adresse du serveur |\n");
        md.append("| `SYSTALINK_SSH_USER` | utilisateur de déploiement |\n");
        md.append("| `SYSTALINK_SSH_PRIVATE_KEY` | clé privée SSH de cet utilisateur |\n");
        md.append("| `SYSTALINK_SSH_KNOWN_HOSTS` | résultat de `ssh-keyscan <adresse>` (vérification de l'identité du serveur) |\n\n");
        md.append("---\n\nGénéré par LONKOO.\n");
        return md.toString();
    }
}
