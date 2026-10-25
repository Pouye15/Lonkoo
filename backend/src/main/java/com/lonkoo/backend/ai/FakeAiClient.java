package com.lonkoo.backend.ai;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.lonkoo.backend.canvas.SeedContent;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Agent de démonstration : des réponses figées, valides au contrat du canvas, pour que l'interface avance sans clé d'API
 * (activé par {@code AI_PROVIDER=fake}). Il ne comprend rien à ce qu'on lui demande : ses réponses disent
 * {@code demo: true} pour qu'on ne les prenne jamais pour celles d'un agent. C'est aussi l'exemple à suivre pour brancher
 * un vrai fournisseur (voir {@link AiClient}).
 */
@Component
@ConditionalOnProperty(prefix = "lonkoo.ai", name = "provider", havingValue = "fake")
public class FakeAiClient implements AiClient {

    private static final String NOTICE = " (réponse figée de démonstration : l'agent IA n'est pas branché)";

    private final SeedContent seed;

    public FakeAiClient(SeedContent seed) {
        this.seed = seed;
    }

    @Override
    public boolean demo() {
        return true;
    }

    /** Toujours le modèle d'exemple, quel que soit le cahier des charges. */
    @Override
    public AiProposal sketch(String brief) {
        JsonNode canvas = JsonMapper.shared().readTree(seed.json());
        return new AiProposal(canvas, "Esquisse : le modèle d'exemple « " + canvas.path("meta").path("name").asText() + " »" + NOTICE);
    }

    /** Le canvas reçu, plus un cache relié au premier bloc désigné (ou au premier bloc du canvas). */
    @Override
    public AiProposal complete(JsonNode snapshot, List<String> nodeIds, String instruction) {
        ObjectNode canvas = (ObjectNode) snapshot.deepCopy();
        ArrayNode nodes = canvas.has("nodes") && canvas.get("nodes").isArray() ? (ArrayNode) canvas.get("nodes") : canvas.putArray("nodes");
        ArrayNode edges = canvas.has("edges") && canvas.get("edges").isArray() ? (ArrayNode) canvas.get("edges") : canvas.putArray("edges");

        String firstId = nodes.isEmpty() ? null : nodes.get(0).path("id").asText();
        Set<String> ids = new HashSet<>();
        Set<String> names = new HashSet<>();
        double lowest = 0;
        for (JsonNode node : nodes) {
            ids.add(node.path("id").asText());
            names.add(node.path("data").path("name").asText());
            lowest = Math.max(lowest, node.path("position").path("y").asDouble(0));
        }
        String id = unique("ia-cache", ids);
        String name = unique("cache_ia", names);

        ObjectNode added = nodes.addObject();
        added.put("id", id);
        added.put("type", "generic");
        added.putObject("position").put("x", 0).put("y", lowest + 160);
        ObjectNode data = added.putObject("data");
        data.put("name", name);
        data.put("label", "Cache (proposition)");
        data.put("tech", "Valkey");
        data.put("description", "Proposition de démonstration : un cache de lecture devant la base.");

        String source = nodeIds.isEmpty() ? firstId : nodeIds.get(0);
        if (source != null) {
            ObjectNode edge = edges.addObject();
            edge.put("id", unique("ia-lien", edgeIds(edges)));
            edge.put("source", source);
            edge.put("target", id);
            edge.put("kind", "data");
            edge.put("label", "met en cache");
        }
        return new AiProposal(canvas, "Ajout d'un cache de lecture" + NOTICE);
    }

    /** Trois remarques sur des blocs du canvas : une base, un point d'entrée, un service. */
    @Override
    public List<AiFinding> audit(JsonNode snapshot) {
        JsonNode nodes = snapshot.path("nodes");
        if (!nodes.isArray() || nodes.isEmpty()) {
            return List.of();
        }
        String database = firstOfType(nodes, "database");
        String entry = firstOfType(nodes, "webapp");
        String service = firstOfType(nodes, "service");
        String any = nodes.get(0).path("id").asText();

        List<AiFinding> findings = new ArrayList<>();
        findings.add(new AiFinding("demo-1", AiFinding.Severity.RECOMMENDED, AiFinding.Category.RESILIENCE,
                "Prévoir une sauvegarde et une réplique de la base", database != null ? database : any,
                "Une seule base sans copie : une panne ou une erreur de manipulation perd les données." + NOTICE,
                "Une instance, sans sauvegarde décrite", "Sauvegarde quotidienne testée et une réplique en lecture"));
        findings.add(new AiFinding("demo-2", AiFinding.Severity.CRITICAL, AiFinding.Category.SECURITY,
                "Limiter le débit du point d'entrée", entry != null ? entry : any,
                "Sans limite, un client peut saturer le service en quelques secondes." + NOTICE,
                "Aucune limite de débit décrite", "Limite par adresse et par compte à l'entrée"));
        findings.add(new AiFinding("demo-3", AiFinding.Severity.OPTIMIZATION, AiFinding.Category.PERFORMANCE,
                "Ajouter un cache de lecture", service != null ? service : any,
                "Les lectures répétées gagnent à ne pas passer par la base." + NOTICE,
                "Chaque lecture interroge la base", "Un cache de lecture à durée courte"));
        return findings;
    }

    private static String firstOfType(JsonNode nodes, String type) {
        for (JsonNode node : nodes) {
            if (type.equals(node.path("type").asText())) {
                return node.path("id").asText();
            }
        }
        return null;
    }

    private static Set<String> edgeIds(ArrayNode edges) {
        Set<String> ids = new HashSet<>();
        for (JsonNode edge : edges) {
            ids.add(edge.path("id").asText());
        }
        return ids;
    }

    /** {@code base}, puis {@code base-2}, {@code base-3}… tant que le nom est pris (les noms de blocs restent des identifiants valides). */
    private static String unique(String base, Set<String> taken) {
        if (!taken.contains(base)) {
            return base;
        }
        for (int i = 2; ; i++) {
            String candidate = base + (base.contains("_") ? "_" : "-") + i;
            if (!taken.contains(candidate)) {
                return candidate;
            }
        }
    }
}
