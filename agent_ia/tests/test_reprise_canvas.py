"""Tests de la génération de canvas : au plus une reprise, jamais de correction silencieuse."""

import json

import httpx
import pytest
from fastapi import HTTPException

from conftest import canvas_valide, executer_avec_transport


def _reponse_modele(contenu: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={"choices": [{"message": {"content": contenu}}]},
    )


def _canvas_invalide() -> dict:
    canvas = canvas_valide()
    canvas["edges"][0]["target"] = "bloc_absent"
    return canvas


def test_canvas_valide_du_premier_coup_sans_reprise():
    appels = []

    def handler(request: httpx.Request) -> httpx.Response:
        appels.append(json.loads(request.content))
        return _reponse_modele(json.dumps({"canvas": canvas_valide(), "summary": "Esquisse"}))

    resultat = executer_avec_transport(
        handler, lambda g: g.ask_for_canvas("prompt système", "contenu utilisateur")
    )

    assert len(appels) == 1
    assert resultat["summary"] == "Esquisse"
    assert resultat["demo"] is False


def test_une_seule_reprise_puis_echec_502():
    appels = []

    def handler(request: httpx.Request) -> httpx.Response:
        appels.append(json.loads(request.content))
        return _reponse_modele(json.dumps({"canvas": _canvas_invalide(), "summary": "Bancal"}))

    with pytest.raises(HTTPException) as erreur:
        executer_avec_transport(
            handler, lambda g: g.ask_for_canvas("prompt système", "contenu utilisateur")
        )

    assert erreur.value.status_code == 502
    assert "ne respecte pas le contrat" in erreur.value.detail
    # Exactement deux appels : la demande initiale puis UNE reprise.
    assert len(appels) == 2


def test_la_reprise_rejoue_la_conversation_avec_la_sortie_fautive():
    appels = []
    sortie_fautive = json.dumps({"canvas": _canvas_invalide(), "summary": "Bancal"})

    def handler(request: httpx.Request) -> httpx.Response:
        appels.append(json.loads(request.content))
        if len(appels) == 1:
            return _reponse_modele(sortie_fautive)
        return _reponse_modele(json.dumps({"canvas": canvas_valide(), "summary": "Corrigé"}))

    resultat = executer_avec_transport(
        handler, lambda g: g.ask_for_canvas("prompt système", "contenu utilisateur")
    )

    assert resultat["summary"] == "Corrigé"
    assert len(appels) == 2

    messages_de_reprise = appels[1]["messages"]
    roles = [m["role"] for m in messages_de_reprise]
    assert roles == ["system", "user", "assistant", "user"]
    # Le modèle revoit sa propre sortie fautive…
    assert messages_de_reprise[2]["content"] == sortie_fautive
    # …et les erreurs du validateur.
    assert "cible inconnue" in messages_de_reprise[3]["content"]


def test_sortie_non_json_declenche_une_reprise_puis_502():
    appels = []

    def handler(request: httpx.Request) -> httpx.Response:
        appels.append(json.loads(request.content))
        return _reponse_modele("Je préfère ne pas répondre en JSON.")

    with pytest.raises(HTTPException) as erreur:
        executer_avec_transport(
            handler, lambda g: g.ask_for_canvas("prompt système", "contenu utilisateur")
        )

    assert erreur.value.status_code == 502
    assert len(appels) == 2


def test_delai_par_appel_lu_dans_la_configuration(monkeypatch):
    from gemini import DEFAULT_TIMEOUT_SECONDS, GeminiClient, read_timeout_seconds

    assert read_timeout_seconds({}) == DEFAULT_TIMEOUT_SECONDS
    assert read_timeout_seconds({"AI_TIMEOUT_SECONDS": "12"}) == 12.0
    # Valeur illisible ou absurde : on retombe sur le défaut, sans planter.
    assert read_timeout_seconds({"AI_TIMEOUT_SECONDS": "abc"}) == DEFAULT_TIMEOUT_SECONDS
    assert read_timeout_seconds({"AI_TIMEOUT_SECONDS": "0"}) == DEFAULT_TIMEOUT_SECONDS

    monkeypatch.setenv("AI_TIMEOUT_SECONDS", "17")
    assert GeminiClient(api_key="").timeout == 17.0


def test_appel_sans_client_http_partage_rend_503():
    from gemini import GeminiClient

    gemini = GeminiClient(api_key="", base_url="https://fournisseur.test/v1")
    with pytest.raises(HTTPException) as erreur:
        import asyncio

        asyncio.run(gemini.call_llm([{"role": "user", "content": "bonjour"}]))
    assert erreur.value.status_code == 503
