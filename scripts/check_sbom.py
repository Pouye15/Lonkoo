#!/usr/bin/env python3
"""Vérifie qu'un SBOM CycloneDX est complet, sans se fier à l'outil qui l'a produit.

Un SBOM qui oublie des composants est pire que pas de SBOM : il rassure à tort. On compare donc le SBOM à une source
indépendante :

- Maven : la liste des dépendances d'exécution de `mvn dependency:list -DincludeScope=runtime` (la même que lit
  `scripts/check_licenses_maven.py`) ;
- npm : le `package-lock.json`, sans les paquets réservés au développement (`dev: true`).

Chaque composant de la source doit figurer dans le SBOM (même groupe, même nom, même version). Un composant en plus
dans le SBOM est signalé sans faire échouer (portée « provided », paquets optionnels d'une autre plateforme).

Usage :
    python3 scripts/check_sbom.py maven maven-deps.txt docs/sbom/backend.cdx.json
    python3 scripts/check_sbom.py npm frontend/package-lock.json docs/sbom/frontend.cdx.json

Code de sortie : 0 si le SBOM est bien formé et complet, 1 sinon. Bibliothèque standard seulement.
"""
import json
import re
import sys
from pathlib import Path

MAVEN_LINE = re.compile(r"^\s*([^:\s]+):([^:\s]+):jar:([^:\s]+):")


def maven_expected(path):
    expected = set()
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        match = MAVEN_LINE.match(line)
        if match:
            expected.add(f"{match.group(1)}:{match.group(2)}:{match.group(3)}")
    return expected


def npm_expected(path):
    lock = json.loads(Path(path).read_text(encoding="utf-8"))
    expected = set()
    for key, entry in lock.get("packages", {}).items():
        if not key.startswith("node_modules/"):
            continue
        name = key.rsplit("node_modules/", 1)[1]
        if entry.get("link"):
            # Un paquet remplacé par un dossier local (le faux sharp) : sa version est celle du dossier.
            entry = lock["packages"].get(entry.get("resolved"), {})
        if entry.get("dev") or "version" not in entry:
            continue
        expected.add(f"{name}:{entry['version']}")
    return expected


def all_components(sbom):
    """Tous les composants, y compris ceux rangés à l'intérieur d'un autre (CycloneDX autorise l'imbrication)."""
    stack = list(sbom.get("components") or [])
    while stack:
        component = stack.pop()
        yield component
        stack.extend(component.get("components") or [])


def component_key(kind, component):
    group = component.get("group") or ""
    name = component["name"]
    if kind == "maven":
        return f"{group}:{name}:{component['version']}"
    full = f"{group}/{name}" if group else name
    return f"{full}:{component['version']}"


def shape_problems(sbom):
    problems = []
    if sbom.get("bomFormat") != "CycloneDX":
        problems.append("bomFormat n'est pas CycloneDX")
    if not sbom.get("specVersion"):
        problems.append("specVersion absent")
    if not sbom.get("serialNumber"):
        problems.append("serialNumber absent")
    if not (sbom.get("metadata") or {}).get("component"):
        problems.append("metadata.component absent (le SBOM ne dit pas de quoi il est l'inventaire)")
    components = list(all_components(sbom))
    if not components:
        problems.append("aucun composant")
    for component in components:
        if not component.get("name") or not component.get("version"):
            problems.append(f"composant sans nom ou sans version : {component.get('purl') or component}")
        elif not component.get("purl"):
            problems.append(f"composant sans purl : {component['name']}")
    return problems


def main(argv):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) != 4 or argv[1] not in ("maven", "npm"):
        print(__doc__)
        return 2
    kind, source, sbom_path = argv[1], argv[2], argv[3]
    sbom = json.loads(Path(sbom_path).read_text(encoding="utf-8"))
    expected = maven_expected(source) if kind == "maven" else npm_expected(source)
    found = {component_key(kind, c) for c in all_components(sbom) if c.get("name") and c.get("version")}

    problems = shape_problems(sbom)
    missing = sorted(expected - found)
    extra = sorted(found - expected)

    label = Path(sbom_path).name
    print(f"{label} : {len(found)} composants dans le SBOM, {len(expected)} attendus ({kind}), "
          f"CycloneDX {sbom.get('specVersion')}")
    for item in extra:
        print(f"  EN PLUS    {item} (absent de la source : portée provided ou paquet optionnel)")
    for item in missing:
        print(f"  MANQUANT   {item}")
    for item in problems:
        print(f"  MAL FORMÉ  {item}")
    if missing or problems:
        print("SBOM incomplet ou mal formé.")
        return 1
    print("SBOM complet : tout composant d'exécution de la source y figure.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
