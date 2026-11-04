import json

import pytest
from fastapi import HTTPException

import main

NOEUDS = {"n1", "n2"}


def remarque(**champs):
    base = {
        "id": "r1",
        "severity": "CRITICAL",
        "category": "SECURITY",
        "title": "Base exposée",
        "targetNodeId": "n1",
        "rationale": "Elle est joignable depuis Internet.",
        "currentConfig": "port ouvert",
        "proposedConfig": "réseau privé",
    }
    base.update(champs)
    return base


def analyser(*remarques):
    return main.parse_findings({"findings": list(remarques)}, NOEUDS)


def test_une_remarque_complete_est_gardee_telle_quelle():
    trouvees, ecartees = analyser(remarque())
    assert ecartees == 0
    assert len(trouvees) == 1
    r = trouvees[0]
    assert (r.id, r.severity.value, r.category.value, r.targetNodeId) == ("r1", "CRITICAL", "SECURITY", "n1")
    assert r.title == "Base exposée"


def test_la_gravite_et_la_categorie_en_minuscules_sont_acceptees():
    trouvees, _ = analyser(remarque(severity="critical", category="security"))
    assert len(trouvees) == 1


@pytest.mark.parametrize(
    "champs",
    [
        {"targetNodeId": "inconnu"},
        {"targetNodeId": None},
        {"targetNodeId": ["n1"]},
        {"severity": "URGENT"},
        {"severity": None},
        {"category": "COULEUR"},
        {"category": ""},
        {"title": ""},
        {"title": "   "},
        {"title": None},
    ],
)
def test_une_remarque_incomplete_ou_invalide_est_ecartee_jamais_completee(champs):
    # Avant : gravité et catégorie inconnues devenaient RECOMMENDED / STACK, un titre vide « Remarque d'architecture ».
    trouvees, ecartees = analyser(remarque(**champs))
    assert trouvees == []
    assert ecartees == 1


def test_un_element_qui_n_est_pas_un_objet_est_ecarte():
    trouvees, ecartees = analyser("texte", 3, None, remarque())
    assert len(trouvees) == 1
    assert ecartees == 3


def test_un_identifiant_absent_recoit_un_numero_technique():
    sans_id = remarque()
    del sans_id["id"]
    trouvees, _ = analyser(remarque(id="a"), sans_id)
    assert [r.id for r in trouvees] == ["a", "remarque_2"]


def test_aucun_chiffre_n_est_ajoute_a_la_remarque():
    # Avant : « +35% RPS », « replicas: 2 », « +14 pts Score IA » étaient posés quand le modèle n'en donnait pas.
    champs = main.parse_findings({"findings": [remarque()]}, NOEUDS)[0][0].model_dump()
    assert "patch" not in champs
    assert "impactScore" not in champs


@pytest.mark.parametrize("reponse", [{}, {"findings": None}, {"findings": "aucune"}, [], "texte", None])
def test_une_reponse_sans_liste_de_remarques_est_refusee(reponse):
    # Un texte illisible n'est pas un audit « sans remarque » : il ne doit pas passer pour un succès.
    with pytest.raises(HTTPException) as erreur:
        main.parse_findings(reponse, NOEUDS)
    assert erreur.value.status_code == 502


def test_une_liste_vide_est_un_audit_sans_remarque():
    assert main.parse_findings({"findings": []}, NOEUDS) == ([], 0)


def test_route_audit_filtre_et_compte(client, auth, llm, canvas):
    llm.replies.append(json.dumps({"findings": [remarque(targetNodeId="n1"), remarque(id="r2", targetNodeId="absent")]}))
    reponse = client.post("/audit", json={"snapshot": canvas}, headers=auth)
    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["discarded"] == 1
    assert [f["targetNodeId"] for f in corps["findings"]] == ["n1"]
    assert corps["demo"] is False


def test_route_audit_texte_illisible_du_fournisseur_donne_502(client, auth, llm, canvas):
    llm.replies.append("Voici mon analyse en prose, pas du JSON.")
    reponse = client.post("/audit", json={"snapshot": canvas}, headers=auth)
    assert reponse.status_code == 502


def test_l_instantane_part_au_fournisseur_en_vrai_json(client, auth, llm, canvas):
    llm.replies.append('{"findings": []}')
    canvas["meta"] = {"actif": True, "note": None}
    client.post("/audit", json={"snapshot": canvas}, headers=auth)
    envoye = llm.calls[0][1]["content"]
    debut = envoye.index("{")
    assert json.loads(envoye[debut:]) == canvas  # la représentation d'un dict Python (True, None) ne s'analyserait pas


def test_complete_envoie_aussi_du_json(client, auth, llm, canvas, monkeypatch):
    envoyes = []

    async def ask(system_prompt, user_content):
        envoyes.append(user_content)
        return {"canvas": canvas, "summary": "ok", "demo": False}

    monkeypatch.setattr(main.gemini_client, "ask_for_canvas", ask)
    canvas["meta"] = {"actif": True, "note": None}
    client.post("/complete", json={"snapshot": canvas, "instruction": "ajoute un cache"}, headers=auth)
    assert '"actif": true' in envoyes[0]
    assert "True" not in envoyes[0] and "None" not in envoyes[0]
