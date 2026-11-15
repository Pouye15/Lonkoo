#!/usr/bin/env python3
"""Contrôles de cohérence du déploiement en production (compose, pipeline, guide, modèle de .env).

Deux défauts que la CI ne voyait pas, parce qu'elle construit la pile depuis un dépôt entier et avec un .env rempli :

1. Le compose de production construit ses images SUR LE SERVEUR, à partir de dossiers du dépôt (`build.context: ../backend`,
   `../agent_ia`...). Le pipeline (.github/workflows/deploy.yml) et le guide (docs/DEPLOIEMENT.md) n'envoient au serveur
   qu'une liste de dossiers (commande `tar`). Un service ajouté au compose sans l'être à ces listes fait échouer le
   premier démarrage (« path ... not found ») : c'est arrivé avec `agent_ia`.
2. Le modèle `infra/production.env.example` est copié tel quel sur le serveur, puis rempli à la main. Chaque variable que le
   compose exige (`${VAR:?...}`) doit y être VIDE : une valeur d'exemple oubliée serait acceptée en silence (le backend
   ne reconnaît que « change-me »), alors qu'une valeur vide arrête le démarrage en nommant la variable.
3. Une adresse de service interne ne doit pas avoir de tiret bas dans son nom de machine : java.net.URI ne la lit pas
   (« unsupported URI »), et le backend appellerait l'agent IA en erreur 500 à chaque requête. Les tests passaient, parce
   qu'ils appellent localhost ; cela n'a été vu qu'en essayant pour de vrai, sur le serveur, le 15/11.
4. L'adresse publique du site est écrite dans la ligne « Site en ligne » du README, qui fait foi ; les documents de
   soumission et de déploiement doivent porter la même, et aucun ne doit garder une ancienne adresse provisoire
   (sslip.io, nip.io). Le jour où un nom de domaine la remplace, une seule ligne est à changer : ce contrôle nomme
   les documents oubliés. Une ligne facultative « Adresse donnée à la soumission » dit l'adresse du formulaire quand
   elle n'est plus l'adresse publique (elle redirige vers elle) : c'est la seule adresse provisoire tolérée, et les
   déclarations de soumission doivent la porter.

Lancement, depuis la racine du dépôt : python3 scripts/check_deploiement.py
Code de sortie : 0 si tout est cohérent, 1 sinon (chaque écart est nommé).
"""
from __future__ import annotations

import posixpath
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
COMPOSE = "infra/docker-compose.prod.yml"
MODELE_ENV = "infra/production.env.example"
# Les deux endroits qui décrivent ce que l'on envoie au serveur.
ENVOIS = (".github/workflows/deploy.yml", "docs/DEPLOIEMENT.md")

CONTEXTE = re.compile(r"^\s*context:\s*(\S+)\s*$", re.MULTILINE)
# « tar czf - backend realtime frontend infra » : des noms de dossiers séparés par des espaces, jusqu'à « \ », « | » ou la fin.
TAR = re.compile(r"tar czf - ((?:[A-Za-z_][\w.-]*(?: +|$))+)", re.MULTILINE)
OBLIGATOIRE = re.compile(r"\$\{([A-Z][A-Z0-9_]*):\?")
AFFECTATION = re.compile(r"^([A-Z][A-Z0-9_]*)=(.*)$", re.MULTILINE)
# Fichiers où une adresse de service interne est écrite.
FICHIERS_ADRESSES = (COMPOSE, "docker-compose.yml", ".env.example", MODELE_ENV,
                     "backend/src/main/resources/application.properties")
LIGNE_ADRESSE = re.compile(r"\*\*Site en ligne :\*\*\s*<(https://[^>\s]+)>")
LIGNE_SOUMISE = re.compile(r"\*\*Adresse donnée à la soumission :\*\*\s*<(https://[^>\s]+)>")
DOCUMENT_SOUMISSION = "docs/DECLARATIONS-SOUMISSION.md"
DOCUMENTS_AVEC_ADRESSE = ("README.md", DOCUMENT_SOUMISSION, "docs/DEPLOIEMENT.md")
ADRESSE_PROVISOIRE = re.compile(r"https://[0-9a-z.-]*\b(?:sslip|nip)\.io\b")
TIRET_BAS_DANS_LE_NOM = re.compile(r"https?://[^\s/:\"']*_[^\s/:\"']*")


def dossiers_construits(compose: str) -> set[str]:
    """Dossiers de premier niveau du dépôt que le compose construit (les contextes sont relatifs à infra/)."""
    dossiers = set()
    for brut in CONTEXTE.findall(compose):
        chemin = posixpath.normpath(posixpath.join("infra", brut.strip("'\"")))
        premier = chemin.split("/")[0]
        if premier not in ("", ".", ".."):
            dossiers.add(premier)
    return dossiers


def ecarts_envois(compose: str, envois: dict[str, str]) -> list[str]:
    """Pour chaque fichier d'envoi, les dossiers construits par le compose qu'il n'envoie pas."""
    attendus = dossiers_construits(compose)
    ecarts = []
    for nom, texte in envois.items():
        listes = [set(m.split()) for m in TAR.findall(texte)]
        if not listes:
            ecarts.append(f"{nom} : aucune commande « tar czf - … » trouvée (elle doit envoyer {', '.join(sorted(attendus))})")
            continue
        for envoyes in listes:
            manquants = sorted(attendus - envoyes)
            if manquants:
                ecarts.append(f"{nom} : n'envoie pas {', '.join(manquants)}, que {COMPOSE} construit sur le serveur")
    return ecarts


def ecarts_modele(compose: str, modele: str) -> list[str]:
    """Les variables exigées par le compose doivent être présentes dans le modèle de .env, et vides."""
    valeurs = dict(AFFECTATION.findall(modele.replace("\r\n", "\n")))
    ecarts = []
    for variable in sorted(set(OBLIGATOIRE.findall(compose))):
        if variable not in valeurs:
            ecarts.append(f"{MODELE_ENV} : {variable} est exigée par {COMPOSE} mais absente du modèle")
        elif valeurs[variable].strip():
            ecarts.append(
                f"{MODELE_ENV} : {variable} porte une valeur d'exemple ; laissez-la vide, pour que le démarrage "
                "s'arrête tant qu'elle n'est pas remplie"
            )
    return ecarts


def ecarts_noms_de_machine(fichiers: dict[str, str]) -> list[str]:
    """Les adresses http(s) dont le nom de machine contient un tiret bas."""
    ecarts = []
    for nom, texte in fichiers.items():
        for adresse in sorted(set(TIRET_BAS_DANS_LE_NOM.findall(texte))):
            ecarts.append(
                f"{nom} : l'adresse {adresse} a un tiret bas dans son nom de machine, que java.net.URI ne lit pas ; "
                "donner au service un alias sans tiret bas (agent-ia)")
    return ecarts


def ecarts_adresse(readme: str, textes: dict[str, str], obligatoires) -> list[str]:
    """L'adresse publique du README doit être celle des documents, sans reste d'une adresse provisoire.

    Si un nom de domaine a remplacé l'adresse donnée dans le formulaire de soumission, le README la garde sur une ligne « Adresse
    donnée à la soumission » : elle redirige vers l'adresse publique. C'est la seule adresse provisoire tolérée, et les
    déclarations de soumission doivent la porter (c'est elle que la plateforme a reçue)."""
    trouvee = LIGNE_ADRESSE.search(readme)
    if not trouvee:
        return ["README.md : la ligne « **Site en ligne :** <adresse> » est introuvable (c'est elle qui fait foi)"]
    officielle = trouvee.group(1).rstrip("/")
    soumise_trouvee = LIGNE_SOUMISE.search(readme)
    soumise = soumise_trouvee.group(1).rstrip("/") if soumise_trouvee else None
    ecarts = []
    for nom in obligatoires:
        if officielle not in textes.get(nom, ""):
            ecarts.append(f"{nom} : ne mentionne pas l'adresse publique {officielle}")
    if soumise and soumise != officielle and soumise not in textes.get(DOCUMENT_SOUMISSION, ""):
        ecarts.append(f"{DOCUMENT_SOUMISSION} : ne mentionne pas l'adresse donnée à la soumission {soumise} (celle du formulaire)")
    tolerees = {officielle} | ({soumise} if soumise else set())
    for nom, texte in textes.items():
        for autre in sorted(set(ADRESSE_PROVISOIRE.findall(texte)) - tolerees):
            ecarts.append(f"{nom} : porte une autre adresse provisoire, {autre} (l'adresse publique est {officielle})")
    return ecarts


def ecarts_adresses_caddy(caddyfile: str, compose: str, dockerfile: str = "") -> list[str]:
    """Caddy lit DOMAINS (plusieurs adresses possibles) et redirige toutes celles qui ne sont pas DOMAIN vers DOMAIN (la connexion
    GitHub n'a qu'une adresse de retour), par une redirection TEMPORAIRE (307) : un navigateur garde une redirection permanente
    sans limite de durée et tourne en boucle si l'adresse principale change ; le compose donne les adresses à Caddy, DOMAIN par
    défaut ; la validation faite à la construction de l'image (infra/caddy.Dockerfile) doit poser les deux variables, sinon la
    construction échoue."""
    ecarts = []
    if "{$DOMAINS}" not in caddyfile:
        ecarts.append("infra/Caddyfile : l'adresse du site doit être {$DOMAINS} (plusieurs adresses possibles), pas {$DOMAIN}")
    if "redir @alias" not in caddyfile:
        ecarts.append("infra/Caddyfile : les adresses autres que DOMAIN doivent rediriger vers DOMAIN (redir @alias …) : la connexion "
                      "GitHub échoue depuis une autre adresse (« État de connexion invalide »)")
    elif not re.search(r"redir @alias\s+\S+\s+307\b", caddyfile):
        ecarts.append("infra/Caddyfile : la redirection des adresses autres que DOMAIN doit être temporaire (307), ni permanente "
                      "(301, 308) ni sans code : un navigateur garde une redirection permanente et tourne en boucle si l'adresse "
                      "principale change")
    if "DOMAINS: ${DOMAINS:-${DOMAIN}}" not in compose:
        ecarts.append(f"{COMPOSE} : le service caddy doit recevoir DOMAINS: ${{DOMAINS:-${{DOMAIN}}}} (DOMAIN par défaut)")
    if dockerfile:
        for variable, motif in (("DOMAINS", r"DOMAINS="), ("DOMAIN", r"(?<![A-Z])DOMAIN=")):
            if not re.search(motif, dockerfile):
                ecarts.append(f"infra/caddy.Dockerfile : la validation du Caddyfile doit poser {variable}=… (le Caddyfile la lit)")
    return ecarts


def main() -> int:
    compose = (RACINE / COMPOSE).read_text(encoding="utf-8")
    envois = {nom: (RACINE / nom).read_text(encoding="utf-8") for nom in ENVOIS}
    modele = (RACINE / MODELE_ENV).read_text(encoding="utf-8")
    adresses = {nom: (RACINE / nom).read_text(encoding="utf-8") for nom in FICHIERS_ADRESSES}
    textes = {"README.md": (RACINE / "README.md").read_text(encoding="utf-8")}
    for doc in sorted((RACINE / "docs").glob("*.md")):
        textes[f"docs/{doc.name}"] = doc.read_text(encoding="utf-8")
    ecarts = (ecarts_envois(compose, envois) + ecarts_modele(compose, modele) + ecarts_noms_de_machine(adresses)
              + ecarts_adresse(textes["README.md"], textes, DOCUMENTS_AVEC_ADRESSE)
              + ecarts_adresses_caddy((RACINE / "infra/Caddyfile").read_text(encoding="utf-8"), compose,
                                   (RACINE / "infra/caddy.Dockerfile").read_text(encoding="utf-8")))
    if ecarts:
        for ecart in ecarts:
            print(f"ÉCART  {ecart}")
        print("Déploiement : incohérent (voir docs/DEPLOIEMENT.md).")
        return 1
    print(f"Déploiement cohérent : les dossiers construits ({', '.join(sorted(dossiers_construits(compose)))}) "
          f"sont tous envoyés, le modèle de .env laisse vides les {len(set(OBLIGATOIRE.findall(compose)))} variables exigées, "
          "aucune adresse de service n'a de tiret bas dans son nom de machine, et l'adresse publique est la même partout.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
