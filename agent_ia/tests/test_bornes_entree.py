"""Tests des bornes d'entrée : le microservice se défend seul, sans compter sur le backend."""

import json

from conftest import canvas_valide
from schemas import MAX_MESSAGE_CHARS, MAX_MESSAGES, MAX_SNAPSHOT_BYTES, MAX_TEXT_CHARS


def _detail(reponse) -> str:
    return json.dumps(reponse.json(), ensure_ascii=False)


def test_trop_de_messages_refuse(client, entetes):
    messages = [{"role": "user", "content": "bonjour"} for _ in range(MAX_MESSAGES + 1)]
    reponse = client.post("/chat", json={"messages": messages}, headers=entetes)
    assert reponse.status_code == 422
    assert "Conversation trop longue" in _detail(reponse)


def test_nombre_de_messages_a_la_limite_accepte(client, entetes, faux_llm):
    faux_llm([json.dumps({"reply": "Bonjour.", "suggestedActions": []})])
    messages = [{"role": "user", "content": "bonjour"} for _ in range(MAX_MESSAGES)]
    reponse = client.post("/chat", json={"messages": messages}, headers=entetes)
    assert reponse.status_code == 200


def test_message_trop_long_refuse(client, entetes):
    messages = [{"role": "user", "content": "a" * (MAX_MESSAGE_CHARS + 1)}]
    reponse = client.post("/chat", json={"messages": messages}, headers=entetes)
    assert reponse.status_code == 422
    assert "Message trop long" in _detail(reponse)


def test_cahier_des_charges_trop_long_refuse(client, entetes):
    reponse = client.post("/sketch", json={"brief": "a" * (MAX_TEXT_CHARS + 1)}, headers=entetes)
    assert reponse.status_code == 422
    assert "Cahier des charges trop long" in _detail(reponse)


def test_consigne_trop_longue_refusee(client, entetes):
    reponse = client.post(
        "/complete",
        json={"snapshot": canvas_valide(), "instruction": "a" * (MAX_TEXT_CHARS + 1)},
        headers=entetes,
    )
    assert reponse.status_code == 422
    assert "Consigne trop longue" in _detail(reponse)


def _instantane_trop_gros() -> dict:
    canvas = canvas_valide()
    # Charge utile volontairement plus grosse que la borne sérialisée (1 Mio).
    canvas["remplissage"] = "x" * (MAX_SNAPSHOT_BYTES + 1000)
    return canvas


def test_instantane_trop_volumineux_refuse_sur_audit(client, entetes):
    reponse = client.post("/audit", json={"snapshot": _instantane_trop_gros()}, headers=entetes)
    assert reponse.status_code == 422
    assert "trop volumineux" in _detail(reponse)


def test_instantane_trop_volumineux_refuse_sur_complete(client, entetes):
    reponse = client.post(
        "/complete",
        json={"snapshot": _instantane_trop_gros(), "instruction": "ajoute un cache"},
        headers=entetes,
    )
    assert reponse.status_code == 422


def test_instantane_trop_volumineux_refuse_sur_chat(client, entetes):
    reponse = client.post(
        "/chat",
        json={
            "messages": [{"role": "user", "content": "bonjour"}],
            "snapshot": _instantane_trop_gros(),
        },
        headers=entetes,
    )
    assert reponse.status_code == 422


def test_trop_de_blocs_cibles_refuse(client, entetes):
    reponse = client.post(
        "/complete",
        json={"snapshot": canvas_valide(), "nodeIds": [f"n{i}" for i in range(201)]},
        headers=entetes,
    )
    assert reponse.status_code == 422
    assert "Trop de blocs ciblés" in _detail(reponse)
