import json

import main
import prompts
from schemas import ChatMessage, ChatRequest

# Ce que https://systalink.com/fr n'affichait pas le 04/11/2026 (relevé à la main) : l'assistant ne doit pas l'affirmer à la place de Systalink.
NON_CONFIRME = ["15ms", "< 15", "ultra-faible", "réplication synchrone", "Anycast", "SystaDrive", "compatible S3", "bare-metal", "bientôt disponibles"]


def test_les_consignes_n_affirment_rien_de_non_confirme_sur_systalink():
    for nom in ("CHAT_SYSTEM_PROMPT", "AUDIT_SYSTEM_PROMPT"):
        texte = getattr(prompts, nom)
        for affirmation in NON_CONFIRME:
            assert affirmation not in texte, f"{nom} affirme « {affirmation} »"


def test_la_consigne_du_chat_interdit_d_inventer_des_chiffres_sur_systalink():
    assert "N'affirme RIEN d'autre sur Systalink" in prompts.CHAT_SYSTEM_PROMPT


def test_la_consigne_d_audit_ne_demande_ni_score_ni_correctif_chiffre():
    format_json = prompts.AUDIT_SYSTEM_PROMPT.split("Format strict de réponse JSON", 1)[1]
    assert "impactScore" not in format_json
    assert '"patch"' not in format_json
    assert "N'invente aucun chiffre" in prompts.AUDIT_SYSTEM_PROMPT


def test_les_actions_suggerees_ne_citent_aucun_service_non_confirme():
    reponses = [
        "Utilisez PostgreSQL avec une réplication et une protection DDoS, en base managée sur le cloud.",
        "Ajoutez un cache Redis.",
        "Rien de particulier.",
    ]
    for reponse in reponses:
        for action in main._extract_suggestions("Que faire ?", reponse):
            for affirmation in ("DBaaS", "anti-DDoS", "VPS Dakar", "Yokk &"):
                assert affirmation not in action, action


def test_une_reponse_du_chat_passe_par_la_route_avec_ses_actions(client, auth, monkeypatch):
    async def call_llm(messages, json_format=True, temperature=0.2):
        assert json_format is False
        return "Un cache Redis soulagerait la base."

    monkeypatch.setattr(main.gemini_client, "call_llm", call_llm)
    corps = {"messages": [{"role": "user", "content": "Comment accélérer ?"}]}
    reponse = client.post("/chat", json=corps, headers=auth)
    assert reponse.status_code == 200
    assert reponse.json()["reply"] == "Un cache Redis soulagerait la base."
    assert any("Redis" in a for a in reponse.json()["suggestedActions"])


def test_le_contexte_du_chat_part_en_json(monkeypatch):
    requete = ChatRequest(messages=[ChatMessage(role="user", content="x")], snapshot={"actif": True, "note": None})
    messages = main._build_chat_messages(requete)
    contexte = messages[0]["content"]
    assert json.dumps({"actif": True, "note": None}, ensure_ascii=False) in contexte
    assert [m["role"] for m in messages] == ["system", "user"]
