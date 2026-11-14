"""Tests de l'extraction JSON de la sortie du modèle."""

from gemini import GeminiClient


def _client() -> GeminiClient:
    return GeminiClient(api_key="", base_url="https://fournisseur.test/v1", model="m", timeout=5.0)


def test_json_nu():
    assert _client().extract_json('{"findings": []}') == {"findings": []}


def test_bloc_json_balise():
    texte = '```json\n{"summary": "ok"}\n```'
    assert _client().extract_json(texte) == {"summary": "ok"}


def test_bloc_balise_sans_langage():
    texte = '```\n{"summary": "ok"}\n```'
    assert _client().extract_json(texte) == {"summary": "ok"}


def test_texte_non_json_renvoie_none():
    assert _client().extract_json("Désolé, je ne peux pas répondre.") is None


def test_texte_vide_renvoie_none():
    assert _client().extract_json("") is None


def test_json_qui_n_est_pas_un_objet_renvoie_none():
    # Une liste ou un nombre ne sont pas exploitables par les routes.
    assert _client().extract_json("[1, 2, 3]") is None
    assert _client().extract_json("42") is None
