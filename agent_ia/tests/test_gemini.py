import json
import logging

import httpx
import pytest
from fastapi import HTTPException

import gemini
from gemini import GeminiClient

CLE = "cle-secrete-de-test-ne-doit-jamais-sortir"


def client_avec(monkeypatch, handler):
    """Un GeminiClient dont les appels HTTP sont traités par `handler` (aucun réseau)."""
    reel = httpx.AsyncClient

    def fabrique(*args, **kwargs):
        return reel(*args, transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(gemini.httpx, "AsyncClient", fabrique)
    return GeminiClient(api_key=CLE, base_url="https://fournisseur.test/v1", model="modele-test")


def reponse_ok(contenu):
    return httpx.Response(200, json={"choices": [{"message": {"content": contenu}}]})


async def appeler(client):
    return await client.call_llm([{"role": "user", "content": "x"}])


@pytest.mark.anyio
async def test_reponse_normale(monkeypatch):
    envoye = {}

    def handler(requete):
        envoye["entetes"] = requete.headers
        envoye["corps"] = json.loads(requete.content)
        return reponse_ok("bonjour")

    assert await appeler(client_avec(monkeypatch, handler)) == "bonjour"
    assert envoye["entetes"]["authorization"] == f"Bearer {CLE}"
    assert envoye["corps"]["model"] == "modele-test"
    assert envoye["corps"]["response_format"] == {"type": "json_object"}


@pytest.mark.anyio
@pytest.mark.parametrize(
    "statut,attendu",
    [(429, 503), (401, 503), (403, 503), (500, 502), (404, 502)],
)
async def test_erreurs_du_fournisseur_traduites(monkeypatch, statut, attendu):
    client = client_avec(monkeypatch, lambda requete: httpx.Response(statut, text="détail du fournisseur"))
    with pytest.raises(HTTPException) as erreur:
        await appeler(client)
    assert erreur.value.status_code == attendu


@pytest.mark.anyio
async def test_delai_depasse_donne_504(monkeypatch):
    def handler(requete):
        raise httpx.ReadTimeout("trop long", request=requete)

    with pytest.raises(HTTPException) as erreur:
        await appeler(client_avec(monkeypatch, handler))
    assert erreur.value.status_code == 504


@pytest.mark.anyio
async def test_fournisseur_injoignable_donne_502(monkeypatch):
    def handler(requete):
        raise httpx.ConnectError("refusé", request=requete)

    with pytest.raises(HTTPException) as erreur:
        await appeler(client_avec(monkeypatch, handler))
    assert erreur.value.status_code == 502


@pytest.mark.anyio
async def test_structure_de_reponse_inattendue_donne_502(monkeypatch):
    client = client_avec(monkeypatch, lambda requete: httpx.Response(200, json={"autre": 1}))
    with pytest.raises(HTTPException) as erreur:
        await appeler(client)
    assert erreur.value.status_code == 502


@pytest.mark.anyio
async def test_la_cle_n_apparait_ni_dans_les_erreurs_ni_dans_les_journaux(monkeypatch, caplog):
    caplog.set_level(logging.DEBUG)
    client = client_avec(monkeypatch, lambda requete: httpx.Response(500, text=f"erreur, clé reçue : {CLE}"))
    with pytest.raises(HTTPException) as erreur:
        await appeler(client)
    assert CLE not in str(erreur.value.detail)
    assert CLE not in caplog.text  # même si le fournisseur répète la clé dans son corps d'erreur


@pytest.mark.anyio
async def test_le_flux_ne_renvoie_pas_le_texte_d_une_exception(monkeypatch):
    def handler(requete):
        raise httpx.ConnectError(f"échec avec {CLE}", request=requete)

    client = client_avec(monkeypatch, handler)
    morceaux = [m async for m in client.stream_llm([{"role": "user", "content": "x"}])]
    assert morceaux and all(CLE not in m for m in morceaux)
    assert "Erreur du fournisseur IA" in morceaux[-1]


@pytest.mark.anyio
async def test_canvas_valide_du_premier_coup(canvas):
    client = GeminiClient(api_key=CLE)
    appels = []

    async def call_llm(messages, json_format=True, temperature=0.2):
        appels.append(messages)
        return json.dumps({"canvas": canvas, "summary": "Une boutique"})

    client.call_llm = call_llm
    resultat = await client.ask_for_canvas("système", "demande")
    assert resultat["canvas"] == canvas
    assert resultat["summary"] == "Une boutique"
    assert len(appels) == 1


@pytest.mark.anyio
async def test_une_seule_reprise_puis_succes(canvas):
    client = GeminiClient(api_key=CLE)
    reponses = [json.dumps({"canvas": {"schemaVersion": 1, "nodes": "faux"}}), json.dumps({"canvas": canvas})]
    appels = []

    async def call_llm(messages, json_format=True, temperature=0.2):
        appels.append(messages)
        return reponses.pop(0)

    client.call_llm = call_llm
    resultat = await client.ask_for_canvas("système", "demande")
    assert resultat["canvas"] == canvas
    assert len(appels) == 2
    assert "violé le contrat" in appels[1][1]["content"]  # la reprise cite les erreurs au modèle


@pytest.mark.anyio
async def test_deux_echecs_donnent_502_apres_exactement_deux_appels():
    client = GeminiClient(api_key=CLE)
    appels = []

    async def call_llm(messages, json_format=True, temperature=0.2):
        appels.append(messages)
        return "ceci n'est pas du JSON"

    client.call_llm = call_llm
    with pytest.raises(HTTPException) as erreur:
        await client.ask_for_canvas("système", "demande")
    assert erreur.value.status_code == 502
    assert len(appels) == 2  # jamais de troisième essai, jamais de canvas corrigé en silence
