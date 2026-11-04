#!/usr/bin/env python3
"""Contrôle bloquant des licences des dépendances Python de l'agent IA.

Même règle que pour Maven (`scripts/check_licenses_maven.py`) : une licence GPL, AGPL ou LGPL rend le projet
irrecevable (règle du concours, article 6). Une dépendance passe si l'une au moins de ses licences est permissive.
Elle échoue si elle n'en a aucune et qu'une de ses licences est de la famille GPL, sauf exception documentée
ci-dessous. Une licence ni permissive ni GPL (MPL, absente…) est seulement signalée.

Les licences sont lues dans le SBOM `docs/sbom/agent_ia.cdx.json`, lui-même contrôlé contre `requirements.lock`
(`python3 scripts/make_sbom.py --verify`) : il couvre donc aussi les dépendances indirectes.

Usage :
    python3 scripts/check_licenses_python.py docs/sbom/agent_ia.cdx.json

Bibliothèque standard seulement. Code de sortie : 0 si rien de bloquant, 1 sinon.
"""
import json
import re
import sys
from pathlib import Path

PERMISSIVE = re.compile(
    r"apache|\bmit\b|bsd|\bisc\b|0bsd|\bcc0\b|public domain|unlicense|zlib|blueoak|creative commons|\bpsf\b|python software foundation",
    re.IGNORECASE,
)
COPYLEFT = re.compile(r"\bl?a?gpl\b|\bgpl[- ]?v?[0-9]|general public|lesser general", re.IGNORECASE)

# Exceptions documentées (voir docs/LICENCES-TIERCES.md, section 2).
EXCEPTIONS = {
    "certifi": (
        "MPL-2.0 : copyleft limité aux fichiers modifiés, non modifié ici, jamais lié statiquement ; dépendance obligatoire "
        "de httpx ; question à poser à l'organisateur (docs/LICENCES-TIERCES.md, section 2)"
    ),
}


def license_names(component):
    names = []
    for entry in component.get("licenses") or []:
        if "expression" in entry:
            names.append(entry["expression"])
        else:
            license_ = entry.get("license") or {}
            names.append(license_.get("id") or license_.get("name") or "")
    return [n for n in names if n]


def main(path):
    sbom = json.loads(Path(path).read_text(encoding="utf-8"))
    components = sbom.get("components") or []
    if not components:
        print(f"Aucun composant lu dans {path}", file=sys.stderr)
        return 1

    failures, warnings, accepted = [], [], []
    for component in components:
        name, version = component["name"], component["version"]
        names = license_names(component)
        label = f"{name}:{version}"
        if any(PERMISSIVE.search(n) for n in names):
            continue
        elif name in EXCEPTIONS:
            accepted.append(f"{label} ({' | '.join(names)}) : {EXCEPTIONS[name]}")
        elif any(COPYLEFT.search(n) for n in names):
            failures.append(f"{label} : {' | '.join(names)}")
        else:
            warnings.append(f"{label} : {' | '.join(names) or 'aucune licence déclarée'}")

    print(f"{len(components)} dépendances examinées")
    for line in accepted:
        print(f"  EXCEPTION  {line}")
    for line in warnings:
        print(f"  À REVOIR   {line}")
    for line in failures:
        print(f"  REFUSÉE    {line}")
    if failures:
        print("\nLicence de la famille GPL sans alternative permissive : le projet serait irrecevable.")
        return 1
    print("\nAucune licence GPL, AGPL ou LGPL sans alternative permissive.")
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
