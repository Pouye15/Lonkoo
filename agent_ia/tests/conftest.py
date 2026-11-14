"""Réglages communs aux tests du microservice.

Les modules du service s'importent à plat (`from gemini import ...`) parce que l'image
Docker démarre avec `WORKDIR /app/src`. On ajoute donc `src` au chemin d'import, et on
pose les variables d'environnement AVANT tout import de `main` (qui refuse de démarrer
sans jeton de service).
"""

import asyncio
import os
import sys
from pathlib import Path
from typing import Callable, Dict, List

import httpx
import pytest

SRC = Path(__file__).resolve().parent.parent / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

# Jeton de service de test (valeur factice, aucun secret réel).
SERVICE_TOKEN = "jeton_de_service_de_test_0123456789"
# Fausse clé d'API : les tests vérifient qu'elle n'apparaît ni dans une réponse ni dans un journal.
FAKE_API_KEY = "cle-factice-ne-doit-jamais-fuiter-42"

os.environ["AI_SERVICE_TOKEN"] = SERVICE_TOKEN
os.environ.pop("REALTIME_SERVICE_TOKEN", None)
os.environ.pop("AI_ALLOW_INSECURE", None)
os.environ["AI_API_KEY"] = FAKE_API_KEY
os.environ["AI_BASE_URL"] = "https://fournisseur.test/v1"
os.environ["AI_MODEL"] = "modele-de-test"


# Canvas minimal conforme au contrat Canvas v1.
def canvas_valide() -> Dict:
    return {
        "schemaVersion": 1,
        "meta": {"name": "Démo", "description": "Canvas de test"},
        "nodes": [
            {
                "id": "n1",
                "type": "service",
                "position": {"x": 0, "y": 0},
                "data": {"name": "service_api", "label": "API", "tech": "Spring Boot"},
            },
            {
                "id": "n2",
                "type": "database",
                "position": {"x": 260, "y": 0},
                "data": {"name": "base_commandes", "label": "Base", "engine": "postgresql"},
            },
        ],
        "edges": [{"id": "e1", "source": "n1", "target": "n2", "kind": "data"}],
    }


@pytest.fixture
def entetes() -> Dict[str, str]:
    """En-têtes d'une requête interne légitime."""
    return {"X-Service-Token": SERVICE_TOKEN}


@pytest.fixture
def app_module():
    import main

    return main


@pytest.fixture
def client(app_module):
    """Client de test FastAPI, cycle de vie exécuté (client HTTP partagé créé)."""
    from fastapi.testclient import TestClient

    with TestClient(app_module.app) as test_client:
        yield test_client


@pytest.fixture
def faux_llm(app_module, monkeypatch):
    """Remplace l'appel au modèle par une suite de réponses figées, et compte les appels."""

    def installer(reponses: List[str]) -> List[List[Dict[str, str]]]:
        restantes = list(reponses)
        appels: List[List[Dict[str, str]]] = []

        async def _call_llm(messages, json_format=True, temperature=0.2):
            appels.append(messages)
            if not restantes:
                raise AssertionError("Appel au modèle non prévu par le test")
            return restantes.pop(0)

        monkeypatch.setattr(app_module.gemini_client, "call_llm", _call_llm)
        return appels

    return installer


def executer_avec_transport(handler: Callable[[httpx.Request], httpx.Response], action):
    """Exécute `action(client_gemini)` avec un client HTTP simulé (httpx.MockTransport)."""
    from gemini import GeminiClient

    async def _run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            gemini = GeminiClient(
                api_key=FAKE_API_KEY,
                base_url="https://fournisseur.test/v1",
                model="modele-de-test",
                timeout=5.0,
            )
            gemini.attach_http_client(http)
            return await action(gemini)

    return asyncio.run(_run())
