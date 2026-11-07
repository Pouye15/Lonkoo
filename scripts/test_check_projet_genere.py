"""Tests de scripts/check_projet_genere.py : un faux projet généré (serveur HTTP en mémoire) se comporte comme le vrai
(201, 409 sur un doublon, 400 qui nomme le champ manquant), et le script doit passer sur chaque modèle de départ, puis
échouer quand le faux projet se comporte mal (le test « sans la règle »).

Lancement : python3 -m unittest scripts/test_check_projet_genere.py
"""
import contextlib
import io
import json
import pathlib
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import check_projet_genere as script  # noqa: E402

RACINE = pathlib.Path(__file__).resolve().parent.parent
MODELES = sorted((RACINE / "docs" / "exemples").glob("*.canvas.json"))


class FauxProjet:
    """Imite le projet généré pour un canvas donné ; les défauts se règlent par les attributs."""

    def __init__(self, canvas, **defauts):
        self.canvas = canvas
        self.entities = script.entities_of(canvas)
        self.posts, self.lists = script.write_targets(canvas)
        self.pages = set(script.pages_of(canvas))
        # Les collections d'entité répondent en liste, qu'on puisse y écrire ou non (comme le projet généré).
        self.rows = {path: [] for path in [p for p, _ in self.posts] + self.lists}
        self.sante = defauts.get("sante", 200)
        self.manquant_donne = defauts.get("manquant_donne", 400)  # statut renvoyé pour un champ obligatoire manquant
        self.ecrit_avant_de_refuser = defauts.get("ecrit_avant_de_refuser", False)
        self.pages_cassees = set(defauts.get("pages_cassees", ()))
        self.doublon_accepte = defauts.get("doublon_accepte", False)
        faux = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def reply(self, status, body=""):
                data = body.encode()
                self.send_response(status)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                if self.path == "/actuator/health":
                    return self.reply(faux.sante, '{"status":"UP"}' if faux.sante == 200 else "")
                if self.path in faux.rows:
                    return self.reply(200, json.dumps(faux.rows[self.path]))
                page = self.path.strip("/")
                if page in faux.pages and page not in faux.pages_cassees:
                    return self.reply(200, "<html></html>")
                return self.reply(404)

            def do_POST(self):
                entity = dict(faux.posts).get(self.path)
                if entity is None:
                    return self.reply(404)
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
                manquants = {script.camel(f["name"]): "est obligatoire" for f in entity["fields"]
                             if f.get("required") and script.camel(f["name"]) not in body}
                if manquants:
                    if faux.ecrit_avant_de_refuser:
                        faux.rows[self.path].append(body)
                    return self.reply(faux.manquant_donne, json.dumps({"detail": "Données invalides", "champs": manquants}))
                uniques = [script.camel(f["name"]) for f in entity["fields"] if f.get("unique")]
                if not faux.doublon_accepte and any(row.get(u) == body.get(u) for row in faux.rows[self.path] for u in uniques):
                    return self.reply(409, '{"detail":"valeur déjà utilisée"}')
                faux.rows[self.path].append(body)
                return self.reply(201, json.dumps(body))

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


def verifier(canvas, **defauts):
    faux = FauxProjet(canvas, **defauts)
    try:
        # Le script affiche chaque vérification : ici on ne veut que ses échecs, pas le bruit dans les journaux.
        with contextlib.redirect_stdout(io.StringIO()):
            return script.check(canvas, faux.url, faux.url, wait_seconds=0, sleep=lambda _: None)
    finally:
        faux.close()


def charger(chemin):
    return json.loads(chemin.read_text(encoding="utf-8"))


class FonctionsPures(unittest.TestCase):
    def test_camel(self):
        self.assertEqual(script.camel("cree_le"), "creeLe")
        self.assertEqual(script.camel("rendez_vous_id"), "rendezVousId")
        self.assertEqual(script.camel("total"), "total")

    def test_entite_pour_un_segment_comme_le_generateur(self):
        entites = [{"name": "commande"}, {"name": "colis"}, {"name": "rendez_vous"}, {"name": "frais"}]
        self.assertEqual(script.entity_for_segment("commandes", entites)["name"], "commande")
        self.assertEqual(script.entity_for_segment("colis", entites)["name"], "colis")
        self.assertEqual(script.entity_for_segment("rendez-vous", entites)["name"], "rendez_vous")
        self.assertEqual(script.entity_for_segment("frais", entites)["name"], "frais")
        self.assertIsNone(script.entity_for_segment("inconnu", entites))

    def test_segment_unique(self):
        self.assertEqual(script.single_segment("/commandes"), "commandes")
        self.assertIsNone(script.single_segment("/commandes/{id}"))
        self.assertIsNone(script.single_segment("/"))

    def test_une_ecriture_valide_porte_les_champs_obligatoires_et_uniques_en_camel_case(self):
        entite = {"name": "commande", "fields": [
            {"name": "reference", "type": "string", "required": True, "unique": True},
            {"name": "total", "type": "decimal", "required": True},
            {"name": "cree_le", "type": "datetime", "required": True},
            {"name": "note", "type": "text"}]}
        corps = script.payload(entite, "a")
        self.assertEqual(set(corps), {"reference", "total", "creeLe"})
        self.assertNotEqual(script.payload(entite, "a")["reference"], script.payload(entite, "b")["reference"])
        self.assertNotIn("total", script.payload(entite, "a", without="total"))


class ModelesDeDepart(unittest.TestCase):
    def test_il_y_a_au_moins_cinq_modeles(self):
        self.assertGreaterEqual(len(MODELES), 5)

    def test_le_script_passe_sur_un_projet_sain_pour_chaque_modele(self):
        for chemin in MODELES:
            with self.subTest(modele=chemin.name):
                canvas = charger(chemin)
                echecs = verifier(canvas)
                self.assertEqual(echecs, [], f"{chemin.name} : {echecs}")
                posts, _ = script.write_targets(canvas)
                self.assertGreaterEqual(len(posts), 1, f"{chemin.name} : aucune écriture d'entité vérifiée")


class SansLaRegle(unittest.TestCase):
    """Chaque défaut du faux projet doit être vu : sans cela, le contrôle ne contrôlerait rien."""

    canvas = charger(RACINE / "docs" / "exemples" / "clinique-rendez-vous.canvas.json")

    def test_un_champ_manquant_qui_donne_409_au_lieu_de_400_est_vu(self):
        self.assertTrue([e for e in verifier(self.canvas, manquant_donne=409) if "400" in e])

    def test_un_refus_qui_a_quand_meme_ecrit_est_vu(self):
        self.assertTrue([e for e in verifier(self.canvas, ecrit_avant_de_refuser=True) if "rien" in e or "201" in e])

    def test_un_doublon_accepte_est_vu(self):
        self.assertTrue([e for e in verifier(self.canvas, doublon_accepte=True) if "409" in e])

    def test_un_backend_qui_ne_demarre_pas_est_vu(self):
        echecs = verifier(self.canvas, sante=503)
        self.assertEqual(len(echecs), 1)
        self.assertIn("santé", echecs[0])

    def test_une_page_cassee_est_vue(self):
        self.assertTrue([e for e in verifier(self.canvas, pages_cassees={"dossiers"}) if "dossiers" in e])


if __name__ == "__main__":
    unittest.main()
