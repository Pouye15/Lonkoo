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


def main() -> int:
    compose = (RACINE / COMPOSE).read_text(encoding="utf-8")
    envois = {nom: (RACINE / nom).read_text(encoding="utf-8") for nom in ENVOIS}
    modele = (RACINE / MODELE_ENV).read_text(encoding="utf-8")
    ecarts = ecarts_envois(compose, envois) + ecarts_modele(compose, modele)
    if ecarts:
        for ecart in ecarts:
            print(f"ÉCART  {ecart}")
        print("Déploiement : incohérent (voir docs/DEPLOIEMENT.md).")
        return 1
    print(f"Déploiement cohérent : les dossiers construits ({', '.join(sorted(dossiers_construits(compose)))}) "
          f"sont tous envoyés, et le modèle de .env laisse vides les {len(set(OBLIGATOIRE.findall(compose)))} variables exigées.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
