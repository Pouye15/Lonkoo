import json
import os
import secrets
from pathlib import Path

import pytest

# Le jeton est lu à l'import de `main` : il doit être posé avant. Tiré au hasard à chaque lancement (aucun secret écrit dans le code).
TOKEN = secrets.token_hex(16)
os.environ["AI_SERVICE_TOKEN"] = TOKEN
os.environ.pop("AI_API_KEY", None)

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def canvas():
    """Un canvas minimal (2 blocs, 1 lien) conforme au contrat."""
    return json.loads((FIXTURES / "canvas_minimal.json").read_text(encoding="utf-8"))


@pytest.fixture
def client():
    return TestClient(main.app)


@pytest.fixture
def auth():
    return {"X-Service-Token": TOKEN}


@pytest.fixture
def llm(monkeypatch):
    """Remplace l'appel au fournisseur : renvoie les réponses données dans l'ordre et garde ce qui a été envoyé."""

    class Fake:
        def __init__(self):
            self.replies = []
            self.calls = []

    fake = Fake()

    async def call_llm(messages, json_format=True, temperature=0.2):
        fake.calls.append(messages)
        if not fake.replies:
            raise AssertionError("appel au fournisseur non prévu par le test")
        return fake.replies.pop(0)

    monkeypatch.setattr(main.gemini_client, "call_llm", call_llm)
    return fake


@pytest.fixture
def anyio_backend():
    return "asyncio"
