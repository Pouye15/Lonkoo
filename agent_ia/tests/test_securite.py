"""Tests de sécurité : jeton de service, absence de CORS, non-fuite de la clé d'API."""

import json
import logging

import httpx
import pytest
from fastapi import HTTPException

from conftest import FAKE_API_KEY, SERVICE_TOKEN, canvas_valide, executer_avec_transport


# ---------------------------------------------------------------------------
# Jeton de service
# ---------------------------------------------------------------------------

def test_sans_jeton_la_requete_est_refusee_403(client):
    reponse = client.post("/audit", json={"snapshot": canvas_valide()})
    assert reponse.status_code == 403
    assert "jeton de service" in reponse.json()["detail"]


def test_jeton_errone_refuse_403(client):
    reponse = client.post(
        "/chat",
        json={"messages": [{"role": "user", "content": "bonjour"}]},
        headers={"X-Service-Token": "mauvais_jeton"},
    )
    assert reponse.status_code == 403


def test_health_reste_accessible_sans_jeton(client):
    # Le contrôle de santé de Docker appelle /health sans en-tête.
    reponse = client.get("/health")
    assert reponse.status_code == 200
    assert reponse.json()["status"] == "UP"


def test_demarrage_refuse_sans_jeton_de_service(app_module):
    with pytest.raises(RuntimeError) as erreur:
        app_module.resolve_service_token({})
    assert "AI_SERVICE_TOKEN" in str(erreur.value)


def test_echappatoire_de_developpement_explicite(app_module, caplog):
    with caplog.at_level(logging.WARNING, logger="agent_ia"):
        jeton = app_module.resolve_service_token({"AI_ALLOW_INSECURE": "true"})
    assert jeton == ""
    assert "AVERTISSEMENT" in caplog.text


def test_jeton_de_secours_realtime_accepte(app_module):
    assert app_module.resolve_service_token({"REALTIME_SERVICE_TOKEN": "jeton_partage"}) == "jeton_partage"


def test_jeton_configure_est_bien_celui_attendu(app_module):
    assert app_module.SERVICE_TOKEN == SERVICE_TOKEN


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

def test_aucun_middleware_cors_installe(app_module, client):
    noms = [m.cls.__name__ for m in app_module.app.user_middleware]
    assert "CORSMiddleware" not in noms

    reponse = client.get("/health", headers={"Origin": "https://site.malveillant.test"})
    assert "access-control-allow-origin" not in {k.lower() for k in reponse.headers}


# ---------------------------------------------------------------------------
# Non-fuite de la clé d'API
# ---------------------------------------------------------------------------

def test_la_cle_n_apparait_pas_dans_l_erreur_ni_dans_les_journaux(caplog):
    def handler(request: httpx.Request) -> httpx.Response:
        # Le fournisseur renvoie une erreur dont le corps contient la clé (cas réel vu
        # avec certains fournisseurs qui réaffichent l'en-tête d'autorisation).
        return httpx.Response(
            500,
            text=json.dumps({"error": f"clé refusée : {FAKE_API_KEY}"}),
        )

    with caplog.at_level(logging.ERROR, logger="agent_ia.gemini"):
        with pytest.raises(HTTPException) as erreur:
            executer_avec_transport(
                handler, lambda g: g.call_llm([{"role": "user", "content": "bonjour"}])
            )

    assert erreur.value.status_code == 502
    assert FAKE_API_KEY not in str(erreur.value.detail)
    assert FAKE_API_KEY not in caplog.text
    # Seul le code HTTP est journalisé.
    assert "500" in caplog.text


def test_authentification_refusee_ne_divulgue_pas_la_cle(caplog):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text=f"invalid api key {FAKE_API_KEY}")

    with caplog.at_level(logging.ERROR, logger="agent_ia.gemini"):
        with pytest.raises(HTTPException) as erreur:
            executer_avec_transport(
                handler, lambda g: g.call_llm([{"role": "user", "content": "bonjour"}])
            )

    assert erreur.value.status_code == 503
    assert FAKE_API_KEY not in str(erreur.value.detail)
    assert FAKE_API_KEY not in caplog.text


def test_la_cle_n_apparait_pas_dans_la_reponse_http(client, entetes, faux_llm, caplog):
    faux_llm(["ceci n'est pas du JSON"])
    with caplog.at_level(logging.ERROR):
        reponse = client.post("/audit", json={"snapshot": canvas_valide()}, headers=entetes)
    assert reponse.status_code == 502
    assert FAKE_API_KEY not in reponse.text
    assert FAKE_API_KEY not in caplog.text


def test_la_cle_part_bien_en_en_tete_mais_pas_dans_le_corps():
    vu = {}

    def handler(request: httpx.Request) -> httpx.Response:
        vu["auth"] = request.headers.get("Authorization")
        vu["corps"] = request.content.decode("utf-8")
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})

    executer_avec_transport(handler, lambda g: g.call_llm([{"role": "user", "content": "bonjour"}]))

    assert vu["auth"] == f"Bearer {FAKE_API_KEY}"
    assert FAKE_API_KEY not in vu["corps"]


def test_erreur_de_streaming_ne_divulgue_aucun_detail_interne(caplog):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"échec vers https://fournisseur.test/v1?key={FAKE_API_KEY}")

    async def _collecter(gemini):
        return [morceau async for morceau in gemini.stream_llm([{"role": "user", "content": "bonjour"}])]

    with caplog.at_level(logging.ERROR, logger="agent_ia.gemini"):
        morceaux = executer_avec_transport(handler, _collecter)

    assert len(morceaux) == 1
    charge = json.loads(morceaux[0][len("data: "):])
    assert charge == {"error": "Le service IA est temporairement indisponible."}
    assert FAKE_API_KEY not in caplog.text


def test_delai_depasse_rend_504():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("trop lent")

    with pytest.raises(HTTPException) as erreur:
        executer_avec_transport(
            handler, lambda g: g.call_llm([{"role": "user", "content": "bonjour"}])
        )
    assert erreur.value.status_code == 504
