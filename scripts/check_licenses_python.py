#!/usr/bin/env python3
"""Vérifie les licences des dépendances Python livrées (microservice `agent_ia`).

Le règlement CADev (article 6) n'admet que des licences permissives : une licence à réciprocité
(GPL, AGPL, LGPL) rend le projet irrecevable. Ce script lit le verrou du service — c'est-à-dire
exactement ce que l'image installe (`pip install --no-deps -r requirements.lock`) — et refuse
toute licence qui n'est pas dans la liste autorisée.

La licence de chaque ligne du verrou est relevée **dans le paquet lui-même** (expression SPDX
`License-Expression`, classifieur `License ::` ou champ `License` de la version épinglée), jamais
recopiée d'une liste. Ce script ne vérifie donc pas la licence à la source : il vérifie que ce qui
est déclaré est admissible, et que rien n'est déclaré sans licence. La vérification à la source se
fait à la main, et se consigne dans `docs/LICENCES-TIERCES.md`.

Usage :
    python3 scripts/check_licenses_python.py                       # agent_ia/requirements.lock
    python3 scripts/check_licenses_python.py chemin/requirements.lock

Code de sortie : 0 si toutes les licences sont admissibles, 1 sinon. Bibliothèque standard seulement.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_LOCK = ROOT / "agent_ia" / "requirements.lock"

# Licences permissives admises (identifiants SPDX). `PSF-2.0` et `Python-2.0` sont la licence de
# la Python Software Foundation : permissive, sans réciprocité (c'est celle de Python lui-même).
ALLOWED = {
    "MIT", "MIT-0", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD",
    "PSF-2.0", "Python-2.0", "Unlicense", "CC0-1.0", "BlueOak-1.0.0",
}

# Exceptions documentées, à ne jamais étendre sans l'écrire dans docs/LICENCES-TIERCES.md § 2.
# MPL-2.0 est un copyleft **par fichier** : il n'impose rien au reste du projet tant que le
# composant n'est pas modifié, et il n'est pas dans la liste rédhibitoire du règlement (GPL,
# AGPL, LGPL). `certifi` n'est qu'un magasin de certificats, livré tel quel, jamais modifié.
EXCEPTIONS = {
    "certifi": ("MPL-2.0", "magasin de certificats livré tel quel, jamais modifié ; copyleft par fichier"),
}

# Licences qui rendent le projet irrecevable : signalées à part, sans ambiguïté.
FORBIDDEN_MARKERS = ("GPL", "AGPL", "LGPL", "SSPL", "EUPL", "CDDL")


def read_lock(path):
    """Rend la liste (nom, version, licence) du verrou, et refuse une ligne sans licence."""
    entries = []
    problems = []
    for number, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), start=1):
        bare = line.strip()
        if not bare or bare.startswith("#"):
            continue
        pinned, _, licence = bare.partition("#")
        name, sep, version = pinned.strip().partition("==")
        if not sep:
            problems.append(f"ligne {number} : version non épinglée (`nom==version` attendu) : {bare}")
            continue
        if not licence.strip():
            problems.append(f"ligne {number} : licence absente pour {name.strip()} "
                            f"(commentaire `# SPDX` attendu en fin de ligne)")
            continue
        entries.append((name.strip(), version.strip(), licence.strip()))
    return entries, problems


def main(argv):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    lock = Path(argv[1]) if len(argv) > 1 else DEFAULT_LOCK
    if not lock.exists():
        print(f"Verrou introuvable : {lock}")
        return 1

    entries, problems = read_lock(lock)
    if not entries and not problems:
        print(f"{lock} : aucun composant épinglé.")
        return 1

    refused = []
    tolerated = []
    for name, version, licence in entries:
        if licence in ALLOWED:
            continue
        exception = EXCEPTIONS.get(name.lower())
        if exception and exception[0] == licence:
            tolerated.append((name, version, licence, exception[1]))
            continue
        forbidden = any(marker in licence.upper() for marker in FORBIDDEN_MARKERS)
        refused.append((name, version, licence, forbidden))

    print(f"{lock.name} : {len(entries)} composants livrés, {len(ALLOWED)} licences admises")
    for name, version, licence, raison in tolerated:
        print(f"  TOLÉRÉ     {name} {version} : {licence} — exception documentée ({raison})")
    for name, version, licence, forbidden in refused:
        verdict = "RÉDHIBITOIRE" if forbidden else "NON ADMISE"
        print(f"  {verdict:<10} {name} {version} : {licence}")
    for problem in problems:
        print(f"  VERROU     {problem}")

    if refused or problems:
        print("Licences Python : refus. Corrigez la dépendance ou documentez l'exception "
              "dans docs/LICENCES-TIERCES.md § 2 avant de l'ajouter à EXCEPTIONS.")
        return 1
    print("Licences Python : toutes admissibles.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
