package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.lonkoo.backend.ai.AiFinding;
import com.lonkoo.backend.ai.AiResponses;

import tools.jackson.databind.JsonNode;

/**
 * La lecture d'une réponse de fournisseur, partagée par les deux clients : extraction du JSON, canvas, résumé,
 * remarques, gravité et catégorie. Le point important : une sortie inexploitable se distingue d'un audit vide.
 */
class AiResponsesTest {

    @Test
    void theJsonIsFoundEvenInsideAMarkdownBlock() {
        assertThat(AiResponses.extractJson("{\"a\":1}").path("a").asInt()).isEqualTo(1);
        assertThat(AiResponses.extractJson("```json\n{\"a\":2}\n```").path("a").asInt()).isEqualTo(2);
        assertThat(AiResponses.extractJson("```\n{\"a\":3}\n```").path("a").asInt()).isEqualTo(3);
    }

    @Test
    void aTextThatIsNotJsonGivesNothing() {
        assertThat(AiResponses.extractJson("Bonjour, voici mon avis…")).isNull();
        assertThat(AiResponses.extractJson("")).isNull();
        assertThat(AiResponses.extractJson(null)).isNull();
    }

    @Test
    void theCanvasIsTakenWhereverTheModelPutIt() {
        JsonNode wrapped = AiResponses.extractJson("{\"canvas\":{\"schemaVersion\":1,\"nodes\":[]},\"summary\":\"ok\"}");
        assertThat(AiResponses.unwrapCanvas(wrapped).path("schemaVersion").asInt()).isEqualTo(1);

        JsonNode bare = AiResponses.extractJson("{\"schemaVersion\":1,\"nodes\":[],\"edges\":[]}");
        assertThat(AiResponses.unwrapCanvas(bare)).isSameAs(bare);

        assertThat(AiResponses.unwrapCanvas(AiResponses.extractJson("{\"findings\":[]}"))).isNull();
        assertThat(AiResponses.unwrapCanvas(null)).isNull();
    }

    @Test
    void theSummaryFallsBackWhenItIsAbsentOrEmpty() {
        assertThat(AiResponses.unwrapSummary(AiResponses.extractJson("{\"summary\":\"fait\"}"), "défaut")).isEqualTo("fait");
        assertThat(AiResponses.unwrapSummary(AiResponses.extractJson("{\"summary\":\"  \"}"), "défaut")).isEqualTo("défaut");
        assertThat(AiResponses.unwrapSummary(AiResponses.extractJson("{}"), "défaut")).isEqualTo("défaut");
        assertThat(AiResponses.unwrapSummary(null, "défaut")).isEqualTo("défaut");
    }

    @Test
    void anAuditWithoutAnyUsableListIsNotAnAuditWithoutRemarks() {
        // null : la sortie est inexploitable, l'appelant doit signaler une panne.
        assertThat(AiResponses.findings(null)).isNull();
        assertThat(AiResponses.findings(AiResponses.extractJson("{\"reponse\":\"je ne sais pas\"}"))).isNull();
        assertThat(AiResponses.findings(AiResponses.extractJson("{\"findings\":\"beaucoup\"}"))).isNull();

        // Liste vide : réponse légitime d'un canvas sans rien à signaler.
        assertThat(AiResponses.findings(AiResponses.extractJson("{\"findings\":[]}"))).isEmpty();
    }

    @Test
    void aRemarkIsReadWithItsDefaultsAndWithoutTheOnesThatTargetNothing() {
        List<AiFinding> findings = AiResponses.findings(AiResponses.extractJson("""
                {"findings": [
                  {"id": "f1", "severity": "critical", "category": "security", "title": "Titre",
                   "targetNodeId": "n1", "rationale": "parce que", "currentConfig": "avant", "proposedConfig": "après"},
                  {"targetNodeId": "n2"},
                  {"id": "f3", "severity": "n'importe quoi", "category": "n'importe quoi", "targetNodeId": "n3"},
                  {"id": "f4", "title": "sans cible"},
                  {"id": "f5", "title": "cible vide", "targetNodeId": "  "}
                ]}
                """));

        assertThat(findings).hasSize(3);

        AiFinding first = findings.get(0);
        assertThat(first.id()).isEqualTo("f1");
        assertThat(first.severity()).as("la gravité est lue sans tenir compte de la casse").isEqualTo(AiFinding.Severity.CRITICAL);
        assertThat(first.category()).isEqualTo(AiFinding.Category.SECURITY);
        assertThat(first.proposedConfig()).isEqualTo("après");

        assertThat(findings.get(1).id()).as("un identifiant est donné à défaut").isEqualTo("remarque_2");
        assertThat(findings.get(1).title()).isEqualTo("Remarque d'architecture");
        assertThat(findings.get(1).rationale()).isEmpty();

        assertThat(findings.get(2).severity()).as("une gravité inconnue devient RECOMMENDED").isEqualTo(AiFinding.Severity.RECOMMENDED);
        assertThat(findings.get(2).category()).as("une catégorie inconnue devient STACK").isEqualTo(AiFinding.Category.STACK);

        assertThat(findings).noneMatch(finding -> finding.id().equals("f4") || finding.id().equals("f5"));
    }

    @Test
    void theSeverityAndTheCategoryNeverThrow() {
        assertThat(AiResponses.parseSeverity("OPTIMIZATION")).isEqualTo(AiFinding.Severity.OPTIMIZATION);
        assertThat(AiResponses.parseSeverity("")).isEqualTo(AiFinding.Severity.RECOMMENDED);
        assertThat(AiResponses.parseSeverity(null)).isEqualTo(AiFinding.Severity.RECOMMENDED);
        assertThat(AiResponses.parseCategory("performance")).isEqualTo(AiFinding.Category.PERFORMANCE);
        assertThat(AiResponses.parseCategory(null)).isEqualTo(AiFinding.Category.STACK);
    }
}
