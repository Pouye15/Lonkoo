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


@pytest.mark.parametrize("path,_corps", ROUTES)
def test_le_jeton_est_verifie_avant_le_corps_de_la_requete(client, monkeypatch, path, _corps):
    # Essayé en vrai en HTTP : le corps était validé d'abord, donc un appel sans jeton et sans corps valide recevait 422 (et le
    # détail des champs attendus) au lieu de 403.
    assert client.post(path, json={}).status_code == 403
    assert client.post(path, content=b"pas du json", headers={"Content-Type": "application/json"}).status_code == 403
    monkeypatch.setattr(main, "SERVICE_TOKEN", "")
    assert client.post(path, json={}).status_code == 503


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


def test_pas_de_documentation_ni_de_schema_servis(client, auth):
    # Un service interne n'a pas à décrire son API : ni /docs, ni /redoc, ni /openapi.json, même avec le bon jeton.
    for chemin in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(chemin, headers=auth).status_code == 404, chemin
        assert client.get(chemin).status_code == 403, chemin


def test_aucun_en_tete_cors(client):
    # Seul le backend appelle ce service : un navigateur n'a aucune raison d'être autorisé.
    reponse = client.get("/health", headers={"Origin": "https://exemple.org"})
    assert "access-control-allow-origin" not in reponse.headers
