"""Tests de la route /audit : une panne du modèle ne doit jamais passer pour un audit vide."""

import json

from conftest import canvas_valide


def _remarque(**extra):
    base = {
        "id": "remarque_1",
        "severity": "CRITICAL",
        "category": "RESILIENCE",
        "title": "Point unique de panne",
        "targetNodeId": "n2",
        "rationale": "La base n'a pas de réplique.",
        "currentConfig": "Instance unique",
        "proposedConfig": "Réplication",
    }
    base.update(extra)
    return base


def test_sortie_inanalysable_rend_502(client, entetes, faux_llm):
    faux_llm(["Je ne peux pas auditer ce canvas."])
    reponse = client.post("/audit", json={"snapshot": canvas_valide()}, headers=entetes)
    assert reponse.status_code == 502
    assert "inutilisable" in reponse.json()["detail"]


def test_json_sans_liste_findings_rend_502(client, entetes, faux_llm):
    faux_llm(['{"resultat": "tout va bien"}'])
    reponse = client.post("/audit", json={"snapshot": canvas_valide()}, headers=entetes)
    assert reponse.status_code == 502


def test_liste_findings_vide_legitime_rend_200(client, entetes, faux_llm):
    faux_llm(['{"findings": []}'])
    reponse = client.post("/audit", json={"snapshot": canvas_valide()}, headers=entetes)
    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["findings"] == []
    assert corps["discarded"] == 0


def test_remarque_sans_patch_ne_fabrique_aucune_valeur(client, entetes, faux_llm):
    faux_llm([json.dumps({"findings": [_remarque()]})])
    reponse = client.post("/audit", json={"snapshot": canvas_valide()}, headers=entetes)
    assert reponse.status_code == 200
    remarque = reponse.json()["findings"][0]
    assert remarque["patch"] is None
    assert remarque["impactScore"] is None
    assert remarque["targetNodeId"] == "n2"


def test_patch_fourni_par_le_modele_est_relaye(client, entetes, faux_llm):
    faux_llm([json.dumps({"findings": [_remarque(patch={"tech": "PostgreSQL"}, impactScore="+10")]})])
    reponse = client.post("/audit", json={"snapshot": canvas_valide()}, headers=entetes)
    remarque = reponse.json()["findings"][0]
    assert remarque["patch"] == {"tech": "PostgreSQL"}
    assert remarque["impactScore"] == "+10"


def test_remarque_sur_bloc_inconnu_est_ecartee(client, entetes, faux_llm):
    faux_llm([json.dumps({"findings": [_remarque(targetNodeId="bloc_absent")]})])
    reponse = client.post("/audit", json={"snapshot": canvas_valide()}, headers=entetes)
    corps = reponse.json()
    assert corps["findings"] == []
    assert corps["discarded"] == 1


def test_instantane_transmis_en_json_et_non_en_repr_python(client, entetes, faux_llm):
    appels = faux_llm(['{"findings": []}'])
    client.post("/audit", json={"snapshot": canvas_valide()}, headers=entetes)
    contenu_utilisateur = appels[0][1]["content"]
    assert '"schemaVersion": 1' in contenu_utilisateur
    assert "'schemaVersion'" not in contenu_utilisateur
    assert "True" not in contenu_utilisateur and "None" not in contenu_utilisateur


def test_instantane_encadre_par_les_delimiteurs(client, entetes, faux_llm):
    from prompts import UNTRUSTED_END, UNTRUSTED_START

    appels = faux_llm(['{"findings": []}'])
    client.post("/audit", json={"snapshot": canvas_valide()}, headers=entetes)
    contenu_utilisateur = appels[0][1]["content"]
    assert UNTRUSTED_START in contenu_utilisateur
    assert UNTRUSTED_END in contenu_utilisateur


def test_prompt_audit_demande_cinq_a_dix_remarques():
    from prompts import AUDIT_SYSTEM_PROMPT

    assert "entre 5 et 10 remarques" in AUDIT_SYSTEM_PROMPT
