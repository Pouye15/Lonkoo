"""Tests de scripts/check_deploiement.py : le contrôle laisse passer un déploiement cohérent, puis échoue, en nommant
l'écart, quand on retire la règle (un dossier oublié dans l'envoi, une valeur d'exemple dans le modèle de .env).
Il doit enfin passer sur les vrais fichiers du dépôt.

Lancement : python3 -m unittest scripts/test_check_deploiement.py
"""
import contextlib
import io
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import check_deploiement as script  # noqa: E402

COMPOSE = """
services:
  backend:
    build:
      context: ../backend
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Définir POSTGRES_PASSWORD}
      APP_PUBLIC_URL: https://${DOMAIN:?Définir DOMAIN}
  agent_ia:
    build:
      context: ../agent_ia
      dockerfile: Dockerfile
  caddy:
    build:
      context: .
      dockerfile: caddy.Dockerfile
"""

PIPELINE_COMPLET = "run: |\n  tar czf - backend agent_ia infra \\\n    | ssh deploy@hote\n"
GUIDE_COMPLET = "```bash\ntar czf - backend agent_ia infra | ssh deploy@<adresse> \"tar xzf -\"\n```\n"
MODELE_VIDE = "# commentaire\nDOMAIN=\nPOSTGRES_PASSWORD=\n# AI_API_KEY=\n"


class DossiersEnvoyes(unittest.TestCase):
    def test_les_dossiers_construits_sont_ceux_des_contextes(self):
        # « context: . » désigne infra/ lui-même ; « ../x » le dossier x du dépôt.
        self.assertEqual(script.dossiers_construits(COMPOSE), {"backend", "agent_ia", "infra"})

    def test_un_envoi_complet_ne_signale_rien(self):
        envois = {"deploy.yml": PIPELINE_COMPLET, "DEPLOIEMENT.md": GUIDE_COMPLET}
        self.assertEqual(script.ecarts_envois(COMPOSE, envois), [])

    def test_un_dossier_oublie_dans_le_pipeline_est_nomme(self):
        # Sans la règle : c'est exactement ce qui s'est produit avec agent_ia.
        pipeline = "tar czf - backend infra \\\n | ssh deploy@hote\n"
        ecarts = script.ecarts_envois(COMPOSE, {"deploy.yml": pipeline, "DEPLOIEMENT.md": GUIDE_COMPLET})
        self.assertEqual(len(ecarts), 1)
        self.assertIn("deploy.yml", ecarts[0])
        self.assertIn("agent_ia", ecarts[0])

    def test_un_dossier_oublie_dans_le_guide_est_nomme(self):
        guide = "tar czf - backend infra | ssh deploy@<adresse> \"tar xzf -\"\n"
        ecarts = script.ecarts_envois(COMPOSE, {"deploy.yml": PIPELINE_COMPLET, "DEPLOIEMENT.md": guide})
        self.assertEqual(len(ecarts), 1)
        self.assertIn("DEPLOIEMENT.md", ecarts[0])

    def test_une_phrase_qui_cite_la_commande_n_est_pas_prise_pour_la_liste(self):
        # Dans la prose, « tar czf - … » (points de suspension) n'est pas une liste de dossiers.
        guide = GUIDE_COMPLET + "La liste de l'envoi (`tar czf - …`) doit tout contenir.\n"
        self.assertEqual(script.ecarts_envois(COMPOSE, {"DEPLOIEMENT.md": guide}), [])

    def test_un_fichier_sans_commande_tar_est_signale(self):
        ecarts = script.ecarts_envois(COMPOSE, {"deploy.yml": "run: echo rien\n"})
        self.assertEqual(len(ecarts), 1)
        self.assertIn("aucune commande", ecarts[0])


class ModeleDeEnv(unittest.TestCase):
    def test_un_modele_aux_valeurs_vides_ne_signale_rien(self):
        self.assertEqual(script.ecarts_modele(COMPOSE, MODELE_VIDE), [])

    def test_une_valeur_d_exemple_est_nommee(self):
        # Sans la règle : « changer-moi… » serait accepté par le backend, qui ne reconnaît que « change-me ».
        modele = "DOMAIN=\nPOSTGRES_PASSWORD=changer-moi-avec-une-valeur-solide\n"
        ecarts = script.ecarts_modele(COMPOSE, modele)
        self.assertEqual(len(ecarts), 1)
        self.assertIn("POSTGRES_PASSWORD", ecarts[0])
        self.assertNotIn("changer-moi", ecarts[0])  # le message nomme la variable, jamais sa valeur

    def test_une_variable_exigee_mais_absente_est_nommee(self):
        ecarts = script.ecarts_modele(COMPOSE, "DOMAIN=\n")
        self.assertEqual(len(ecarts), 1)
        self.assertIn("POSTGRES_PASSWORD", ecarts[0])

    def test_une_ligne_commentee_ne_compte_pas_comme_valeur(self):
        self.assertEqual(script.ecarts_modele(COMPOSE, "DOMAIN=\nPOSTGRES_PASSWORD=\n# DOMAIN=exemple.org\n"), [])

    def test_les_fins_de_ligne_windows_sont_acceptees(self):
        self.assertEqual(script.ecarts_modele(COMPOSE, MODELE_VIDE.replace("\n", "\r\n")), [])


class NomsDeMachine(unittest.TestCase):
    def test_un_tiret_bas_dans_le_nom_de_machine_est_nomme(self):
        # Cas réel du 15/11 : le nom du service Docker, avec un tiret bas, donnait « unsupported URI » en Java.
        ecarts = script.ecarts_noms_de_machine({"docker-compose.yml": "AI_AGENT_URL: http://agent_ia:8000\n"})
        self.assertEqual(len(ecarts), 1)
        self.assertIn("docker-compose.yml", ecarts[0])
        self.assertIn("http://agent_ia", ecarts[0])

    def test_un_alias_avec_un_tiret_est_accepte(self):
        self.assertEqual(script.ecarts_noms_de_machine({"a": "AI_AGENT_URL=http://agent-ia:8000\n"}), [])

    def test_un_tiret_bas_dans_le_chemin_ou_la_variable_n_est_pas_un_nom_de_machine(self):
        texte = "https://${DOMAIN}/api/auth/github/callback\nhttps://exemple.org/un_chemin?x=a_b\n"
        self.assertEqual(script.ecarts_noms_de_machine({"a": texte}), [])


class AdressePublique(unittest.TestCase):
    README = "Titre\n\n**Site en ligne :** <https://5.22.217.55.sslip.io> (essai)\n"

    def test_les_documents_qui_portent_la_meme_adresse_ne_signalent_rien(self):
        textes = {"README.md": self.README, "d.md": "voir https://5.22.217.55.sslip.io/login"}
        self.assertEqual(script.ecarts_adresse(self.README, textes, ("README.md", "d.md")), [])

    def test_un_document_qui_garde_l_ancienne_adresse_est_nomme(self):
        # Le jour où un nom de domaine remplace sslip.io : le README change, les autres documents sont oubliés.
        readme = "**Site en ligne :** <https://lonkoo.example.org>"
        textes = {"README.md": readme, "d.md": "voir https://5.22.217.55.sslip.io/login"}
        ecarts = script.ecarts_adresse(readme, textes, ("README.md", "d.md"))
        self.assertEqual(len(ecarts), 2)
        self.assertTrue(any("d.md : ne mentionne pas" in e for e in ecarts))
        self.assertTrue(any("d.md : porte une autre adresse provisoire" in e for e in ecarts))

    def test_un_document_obligatoire_sans_l_adresse_est_nomme(self):
        textes = {"README.md": self.README, "d.md": "rien"}
        ecarts = script.ecarts_adresse(self.README, textes, ("README.md", "d.md"))
        self.assertEqual(len(ecarts), 1)
        self.assertIn("d.md", ecarts[0])

    def test_sans_ligne_de_reference_dans_le_readme_c_est_signale(self):
        self.assertEqual(len(script.ecarts_adresse("pas de ligne", {}, ())), 1)

    # Un nom de domaine remplace l'adresse sslip.io, qui reste celle du formulaire de soumission (elle redirige vers le site).
    SOUMISE = ("Titre\n\n**Site en ligne :** <https://lonkoo.example.org>\n\n"
               "**Adresse donnée à la soumission :** <https://5.22.217.55.sslip.io> (elle redirige)\n")
    DECLARATIONS = script.DOCUMENT_SOUMISSION

    def test_l_adresse_donnee_a_la_soumission_est_toleree_et_attendue_dans_les_declarations(self):
        textes = {"README.md": self.SOUMISE, self.DECLARATIONS: "https://lonkoo.example.org et https://5.22.217.55.sslip.io",
                  "d.md": "voir https://lonkoo.example.org/login et https://5.22.217.55.sslip.io"}
        self.assertEqual(script.ecarts_adresse(self.SOUMISE, textes, ("README.md", self.DECLARATIONS, "d.md")), [])

    def test_des_declarations_qui_oublient_l_adresse_du_formulaire_sont_nommees(self):
        textes = {"README.md": self.SOUMISE, self.DECLARATIONS: "https://lonkoo.example.org"}
        ecarts = script.ecarts_adresse(self.SOUMISE, textes, ("README.md", self.DECLARATIONS))
        self.assertEqual(len(ecarts), 1)
        self.assertIn("donnée à la soumission", ecarts[0])

    def test_une_autre_adresse_provisoire_reste_signalee_malgre_l_adresse_de_soumission(self):
        textes = {"README.md": self.SOUMISE, self.DECLARATIONS: "https://lonkoo.example.org https://5.22.217.55.sslip.io",
                  "d.md": "https://lonkoo.example.org https://203.0.113.9.sslip.io"}
        ecarts = script.ecarts_adresse(self.SOUMISE, textes, ("README.md", self.DECLARATIONS, "d.md"))
        self.assertEqual(len(ecarts), 1)
        self.assertIn("203.0.113.9.sslip.io", ecarts[0])

    def test_sans_la_ligne_de_soumission_l_ancienne_adresse_reste_signalee(self):
        readme = "**Site en ligne :** <https://lonkoo.example.org>"
        textes = {"README.md": readme, self.DECLARATIONS: "https://lonkoo.example.org https://5.22.217.55.sslip.io"}
        ecarts = script.ecarts_adresse(readme, textes, ("README.md", self.DECLARATIONS))
        self.assertEqual(len(ecarts), 1)
        self.assertIn("porte une autre adresse provisoire", ecarts[0])


class AdressesCaddy(unittest.TestCase):
    COMPOSE = "      DOMAINS: ${DOMAINS:-${DOMAIN}}\n"
    CADDYFILE = "{$DOMAINS} {\n\t@alias not host {$DOMAIN}\n\tredir @alias https://{$DOMAIN}{uri} 307\n}\n"
    DOCKERFILE = "RUN DOMAIN=x DOMAINS=x caddy validate\n"

    def test_une_configuration_complete_ne_signale_rien(self):
        self.assertEqual(script.ecarts_adresses_caddy(self.CADDYFILE, self.COMPOSE, self.DOCKERFILE), [])

    def test_un_caddyfile_qui_lit_encore_domain_est_signale(self):
        ecarts = script.ecarts_adresses_caddy(self.CADDYFILE.replace("{$DOMAINS}", "{$DOMAIN}"), self.COMPOSE)
        self.assertEqual(len(ecarts), 1)
        self.assertIn("Caddyfile", ecarts[0])

    def test_sans_la_redirection_les_autres_adresses_servent_l_application(self):
        # Cas réel du 15/11 : depuis lonkoo.site, la connexion GitHub échouait par « État de connexion invalide ».
        ecarts = script.ecarts_adresses_caddy("{$DOMAINS} {\n}\n", self.COMPOSE)
        self.assertEqual(len(ecarts), 1)
        self.assertIn("redirig", ecarts[0])

    def test_une_redirection_permanente_ou_sans_code_est_signalee(self):
        # Cas réel du 15/11 : Chrome gardait l'ancienne redirection 308 lonkoo.site vers sslip.io et tournait en boucle une fois
        # lonkoo.site devenue l'adresse principale. Sans code, Caddy répond 302, qui change un POST en GET : 307 est exigé.
        for permanente in (self.CADDYFILE.replace("307", "308"), self.CADDYFILE.replace("307", "301"),
                           self.CADDYFILE.replace(" 307", "")):
            ecarts = script.ecarts_adresses_caddy(permanente, self.COMPOSE)
            self.assertEqual(len(ecarts), 1, permanente)
            self.assertIn("temporaire", ecarts[0])

    def test_un_compose_qui_ne_transmet_pas_domains_est_signale(self):
        ecarts = script.ecarts_adresses_caddy(self.CADDYFILE, "      DOMAIN: ${DOMAIN}\n")
        self.assertEqual(len(ecarts), 1)
        self.assertIn("DOMAINS", ecarts[0])

    def test_une_validation_a_la_construction_qui_oublie_une_variable_est_signalee(self):
        # Cas réel du 15/11 : la CI a échoué parce que le Dockerfile de Caddy validait avec DOMAIN=… alors que le Caddyfile lit DOMAINS.
        sans_domains = script.ecarts_adresses_caddy(self.CADDYFILE, self.COMPOSE, "RUN DOMAIN=x caddy validate\n")
        self.assertEqual(len(sans_domains), 1)
        self.assertIn("DOMAINS", sans_domains[0])
        sans_domain = script.ecarts_adresses_caddy(self.CADDYFILE, self.COMPOSE, "RUN DOMAINS=x caddy validate\n")
        self.assertEqual(len(sans_domain), 1)
        self.assertIn("poser DOMAIN=", sans_domain[0])


class DepotReel(unittest.TestCase):
    def test_le_depot_est_coherent(self):
        sortie = io.StringIO()
        with contextlib.redirect_stdout(sortie):
            code = script.main()
        self.assertEqual(code, 0, sortie.getvalue())


if __name__ == "__main__":
    unittest.main()
