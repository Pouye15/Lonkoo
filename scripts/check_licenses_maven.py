#!/usr/bin/env python3
"""Contrôle bloquant des licences des dépendances Maven d'exécution du backend.

Règle du concours (article 6) : une licence GPL, AGPL ou LGPL rend le projet irrecevable.
Une dépendance passe si l'une au moins de ses licences est permissive (Apache, MIT, BSD, ISC, CC0…).
Elle échoue si elle n'en a aucune et qu'une de ses licences est de la famille GPL, sauf exception
documentée ci-dessous. Une licence ni permissive ni GPL (EPL, absente…) est seulement signalée.

Usage :
    cd backend && mvn -B -ntp dependency:list -DincludeScope=runtime -DoutputFile=../maven-deps.txt
    python3 scripts/check_licenses_maven.py maven-deps.txt

Les licences sont lues dans les POM du dépôt local Maven (~/.m2/repository, ou $M2_REPO), en
remontant aux POM parents quand un POM n'en déclare pas. Bibliothèque standard seulement.
Code de sortie : 0 si rien de bloquant, 1 sinon.
"""
import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

PERMISSIVE = re.compile(
    r"apache|\bmit\b|bsd|\bisc\b|0bsd|\bcc0\b|public domain|unlicense|zlib|blueoak|creative commons",
    re.IGNORECASE,
)
COPYLEFT = re.compile(r"\bl?a?gpl\b|\bgpl[- ]?v?[0-9]|general public|lesser general", re.IGNORECASE)

# Exceptions documentées (voir docs/LICENCES-TIERCES.md, section 2).
EXCEPTIONS = {
    "jakarta.annotation:jakarta.annotation-api": (
        "EPL 2.0 ou GPL 2 avec exception Classpath, présent dans toute application Spring Boot ; "
        "question posée à l'organisateur (docs/QUESTIONS-ORGANISATEUR.md)"
    ),
    "org.springframework.session:spring-session-core": (
        "le POM annonce « Broadcom Foundation License » (nom sans texte ni adresse) ; le jar embarque "
        "META-INF/LICENSE.txt, qui est la licence Apache 2.0 (vérifié le 2026-10-25, voir docs/LICENCES-TIERCES.md)"
    ),
    "org.springframework.session:spring-session-jdbc": (
        "le POM annonce « Broadcom Foundation License » (nom sans texte ni adresse) ; le jar embarque "
        "META-INF/LICENSE.txt, qui est la licence Apache 2.0 (vérifié le 2026-10-25, voir docs/LICENCES-TIERCES.md)"
    ),
}

DEPENDENCY = re.compile(r"^\s*([^:\s]+):([^:\s]+):jar:([^:\s]+):")
MAX_PARENT_DEPTH = 6


def local_repository():
    return Path(os.environ.get("M2_REPO") or Path.home() / ".m2" / "repository")


def pom_path(group, artifact, version):
    return local_repository().joinpath(*group.split("."), artifact, version, f"{artifact}-{version}.pom")


def strip_namespace(tag):
    return tag.rsplit("}", 1)[-1]


def child_text(element, name):
    for child in element:
        if strip_namespace(child.tag) == name:
            return (child.text or "").strip()
    return None


def licenses_of(group, artifact, version, depth=0):
    """Noms des licences déclarées, en remontant aux POM parents ; None si le POM est absent."""
    path = pom_path(group, artifact, version)
    if not path.exists():
        return None
    root = ET.parse(path).getroot()
    names = []
    for section in root:
        if strip_namespace(section.tag) == "licenses":
            for lic in section:
                name = child_text(lic, "name")
                if name:
                    names.append(" ".join(name.split()))
    if names:
        return names
    if depth < MAX_PARENT_DEPTH:
        for section in root:
            if strip_namespace(section.tag) == "parent":
                parent = (child_text(section, "groupId"), child_text(section, "artifactId"), child_text(section, "version"))
                if all(parent):
                    return licenses_of(*parent, depth + 1)
    return []


def main(path):
    with open(path, encoding="utf-8") as handle:
        dependencies = [m.groups() for m in map(DEPENDENCY.match, handle) if m]
    if not dependencies:
        print(f"Aucune dépendance lue dans {path}", file=sys.stderr)
        return 1

    failures, warnings, accepted = [], [], []
    for group, artifact, version in dependencies:
        coordinates = f"{group}:{artifact}"
        names = licenses_of(group, artifact, version)
        label = f"{coordinates}:{version}"
        if names is None:
            warnings.append(f"{label} : POM introuvable dans le dépôt local")
        elif any(PERMISSIVE.search(name) for name in names):
            continue
        elif coordinates in EXCEPTIONS:
            accepted.append(f"{label} ({' | '.join(names)}) : {EXCEPTIONS[coordinates]}")
        elif any(COPYLEFT.search(name) for name in names):
            failures.append(f"{label} : {' | '.join(names)}")
        else:
            warnings.append(f"{label} : {' | '.join(names) or 'aucune licence déclarée'}")

    print(f"{len(dependencies)} dépendances examinées")
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
