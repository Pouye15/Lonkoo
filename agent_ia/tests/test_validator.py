"""Tests du validateur du contrat Canvas v1."""

import copy

from conftest import canvas_valide
from validator import validate_canvas


def test_canvas_valide_sans_erreur():
    assert validate_canvas(canvas_valide()) == []


def test_identifiant_de_bloc_duplique():
    canvas = canvas_valide()
    canvas["nodes"][1]["id"] = "n1"
    erreurs = validate_canvas(canvas)
    assert any("dupliqué" in e and "n1" in e for e in erreurs), erreurs


def test_nom_technique_duplique():
    canvas = canvas_valide()
    canvas["nodes"][1]["data"]["name"] = "service_api"
    erreurs = validate_canvas(canvas)
    assert any("Nom de bloc dupliqué" in e for e in erreurs), erreurs


def test_mot_reserve_refuse():
    canvas = canvas_valide()
    # « user » est un mot réservé PostgreSQL.
    canvas["nodes"][0]["data"]["name"] = "user"
    erreurs = validate_canvas(canvas)
    assert any("réservé" in e for e in erreurs), erreurs


def test_lien_vers_bloc_inexistant():
    canvas = canvas_valide()
    canvas["edges"][0]["target"] = "bloc_absent"
    erreurs = validate_canvas(canvas)
    assert any("cible inconnue" in e for e in erreurs), erreurs


def test_nom_technique_au_mauvais_format():
    canvas = canvas_valide()
    canvas["nodes"][0]["data"]["name"] = "Service-API"
    erreurs = validate_canvas(canvas)
    assert erreurs, "un nom hors format doit être refusé"


def test_type_de_bloc_inconnu_refuse_par_le_schema():
    canvas = canvas_valide()
    canvas["nodes"][0]["type"] = "kubernetes"
    erreurs = validate_canvas(canvas)
    assert erreurs, "un type hors contrat doit être refusé"


def test_champ_d_entite_reserve():
    canvas = canvas_valide()
    canvas["nodes"][1]["data"]["entities"] = [
        {"name": "commande", "fields": [{"name": "select", "type": "string"}]}
    ]
    erreurs = validate_canvas(canvas)
    assert any("réservé" in e for e in erreurs), erreurs


def test_canvas_original_non_modifie_par_la_validation():
    canvas = canvas_valide()
    avant = copy.deepcopy(canvas)
    validate_canvas(canvas)
    assert canvas == avant
