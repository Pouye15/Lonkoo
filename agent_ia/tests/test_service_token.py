import importlib

import pytest

import main
from conftest import TOKEN

ROUTES = [
    ("/sketch", {"brief": "Une boutique en ligne"}),
    ("/complete", {"snapshot": {"nodes": []}}),
    ("/audit", {"snapshot": {"nodes": []}}),
    ("/chat", {"messages": [{"role": "user", "content": "Bonjour"}]}),
    ("/chat/stream", {"messages": [{"role": "user", "content": "Bonjour"}]}),
]


def test_health_reste_ouvert_sans_jeton(client):
    reponse = client.get("/health")
    assert reponse.status_code == 200
    assert reponse.json()["status"] == "UP"


@pytest.mark.parametrize("path,body", ROUTES)
def test_sans_jeton_toute_route_refuse(client, path, body):
    assert client.post(path, json=body).status_code == 403


@pytest.mark.parametrize("path,body", ROUTES)
def test_mauvais_jeton_toute_route_refuse(client, path, body):
    assert client.post(path, json=body, headers={"X-Service-Token": TOKEN + "x"}).status_code == 403


def test_le_bon_jeton_laisse_passer(client, auth, llm):
    llm.replies.append('{"findings": []}')
    reponse = client.post("/audit", json={"snapshot": {"nodes": []}}, headers=auth)
    assert reponse.status_code == 200


@pytest.mark.parametrize("path,body", ROUTES)
def test_sans_jeton_configure_toute_route_refuse_meme_avec_un_en_tete(client, monkeypatch, path, body):
    # Le piège d'origine : un jeton vide désactivait la vérification et ouvrait le service à tout le réseau.
    monkeypatch.setattr(main, "SERVICE_TOKEN", "")
    for headers in ({}, {"X-Service-Token": ""}, {"X-Service-Token": TOKEN}):
        reponse = client.post(path, json=body, headers=headers)
        assert reponse.status_code == 503, headers


def test_le_jeton_du_temps_reel_n_est_pas_un_repli(monkeypatch):
    monkeypatch.delenv("AI_SERVICE_TOKEN", raising=False)
    monkeypatch.setenv("REALTIME_SERVICE_TOKEN", "temps-reel-" + TOKEN)
    try:
        rechargé = importlib.reload(main)
        assert rechargé.SERVICE_TOKEN == ""
    finally:
        monkeypatch.setenv("AI_SERVICE_TOKEN", TOKEN)
        importlib.reload(main)


def test_aucun_en_tete_cors(client):
    # Seul le backend appelle ce service : un navigateur n'a aucune raison d'être autorisé.
    reponse = client.get("/health", headers={"Origin": "https://exemple.org"})
    assert "access-control-allow-origin" not in reponse.headers
