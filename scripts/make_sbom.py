#!/usr/bin/env python3
"""Produit les SBOM CycloneDX du projet (inventaire des composants livrés) et vérifie qu'ils sont complets.

Trois inventaires, un par morceau qui embarque des bibliothèques tierces :

- backend  : Maven, dépendances d'exécution (cyclonedx-maven-plugin, Apache 2.0) ;
- frontend : npm, dépendances de production, d'après `package-lock.json` (@cyclonedx/cyclonedx-npm, Apache 2.0) ;
- agent_ia : Python, d'après `requirements.lock` (cyclonedx-bom, Apache 2.0 ; licences lues sur PyPI) ;
- realtime : idem pour le serveur temps réel.

Sont exclus : les outils de développement et de test (jamais livrés), et ce qui n'est pas une bibliothèque de
l'application (système de l'image Docker, JDK, Node). Les outils qui produisent les SBOM ne sont pas des dépendances du
projet : ils sont lancés à la demande, version épinglée.

Chaque SBOM est ensuite comparé à une source indépendante par `scripts/check_sbom.py` : s'il manque un composant, ce
script échoue.

Usage :
    python3 scripts/make_sbom.py                 # écrit docs/sbom/*.cdx.json
    python3 scripts/make_sbom.py --out /tmp/sbom # ailleurs (la CI y dépose ses artefacts)
    python3 scripts/make_sbom.py --verify        # ne produit rien : vérifie que docs/sbom est à jour (échoue sinon)

Prérequis : Java 21 et Maven (ou le wrapper du backend), Node et npm, accès au réseau pour les outils.
"""
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CYCLONEDX_MAVEN = "org.cyclonedx:cyclonedx-maven-plugin:2.9.3"
CYCLONEDX_NPM = "@cyclonedx/cyclonedx-npm@6.0.1"
CYCLONEDX_PY = "cyclonedx-bom==7.6.0"
SPEC_VERSION = "1.6"

# Le paquet « sharp » de l'interface est un faux paquet local (frontend/stubs/sharp) qui évite d'installer libvips,
# sous licence LGPL, interdite par le règlement. Dans le SBOM, il ne doit pas passer pour le vrai sharp : son identifiant
# `pkg:npm/sharp` ferait croire à un scanner que libvips est livrée.
STUB_NOTE = (
    "Faux paquet local (frontend/stubs/sharp) qui remplace sharp : il ne traite aucune image et n'installe pas libvips "
    "(LGPL-3.0, interdite par le règlement CADEV). Voir docs/LICENCES-TIERCES.md."
)


def run(command, cwd):
    print("  $ " + " ".join(str(part) for part in command), flush=True)
    subprocess.run([str(part) for part in command], cwd=cwd, check=True)


def maven_command():
    """`mvn` s'il est installé (la CI), sinon le wrapper du dépôt (le poste de développement)."""
    found = shutil.which("mvn")
    if found:
        return [found]
    wrapper = ROOT / "backend" / ("mvnw.cmd" if sys.platform == "win32" else "mvnw")
    if wrapper.exists():
        return [str(wrapper)] if sys.platform == "win32" else ["sh", str(wrapper)]
    sys.exit("Maven est introuvable (ni `mvn`, ni backend/mvnw).")


def npx_command():
    found = shutil.which("npx")
    if not found:
        sys.exit("npx est introuvable : installez Node.")
    return found


def write_json(path, document):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def mark_stubs(document):
    """Décrit le faux paquet sharp pour ce qu'il est (voir STUB_NOTE)."""
    marked = 0
    stack = list(document.get("components") or [])
    while stack:
        component = stack.pop()
        stack.extend(component.get("components") or [])
        if component.get("name") == "sharp" and (component.get("licenses") or [{}])[0].get("license", {}).get("name") == "UNLICENSED":
            component["description"] = STUB_NOTE
            component["purl"] = f"pkg:generic/sharp-stub@{component['version']}"
            component.setdefault("properties", []).append({"name": "lonkoo:stub", "value": "true"})
            marked += 1
    return marked


def maven_truth():
    """Les dépendances d'exécution du backend, d'après Maven lui-même : ce que le SBOM doit contenir."""
    deps = Path(tempfile.mkdtemp()) / "maven-deps.txt"
    run(maven_command() + ["-B", "-ntp", "-q", "dependency:list", "-DincludeScope=runtime", f"-DoutputFile={deps}"],
        ROOT / "backend")
    return str(deps)


def make_backend(out):
    print("== backend (Maven)")
    work = ROOT / "backend"
    run(maven_command() + ["-B", "-ntp", "-q", f"{CYCLONEDX_MAVEN}:makeBom", "-DoutputFormat=json",
                           "-DoutputName=backend.cdx", f"-DschemaVersion={SPEC_VERSION}", "-DincludeTestScope=false"], work)
    produced = work / "target" / "backend.cdx.json"
    write_json(out / "backend.cdx.json", json.loads(produced.read_text(encoding="utf-8")))
    return ["maven", maven_truth(), str(out / "backend.cdx.json")]


def make_npm(name, out):
    print(f"== {name} (npm)")
    work = ROOT / name
    target = out / f"{name}.cdx.json"
    run([npx_command(), "--yes", CYCLONEDX_NPM, "--omit", "dev", "--package-lock-only", "--flatten-components",
         "--spec-version", SPEC_VERSION, "--output-format", "JSON", "--output-file", target], work)
    document = json.loads(target.read_text(encoding="utf-8"))
    stubs = mark_stubs(document)
    if stubs:
        print(f"  {stubs} faux paquet local décrit comme tel dans le SBOM")
    write_json(target, document)
    return ["npm", str(work / "package-lock.json"), str(target)]


def pypi_licenses(name, version):
    """Licences déclarées par une version précise d'un paquet PyPI (expression SPDX si elle existe, sinon classificateurs)."""
    with urllib.request.urlopen(f"https://pypi.org/pypi/{name}/{version}/json", timeout=30) as response:
        info = json.load(response)["info"]
    if info.get("license_expression"):
        return [{"expression": info["license_expression"]}]
    names = [c.split("::")[-1].strip() for c in info.get("classifiers") or [] if c.startswith("License ::")]
    if not names and (info.get("license") or "").strip():
        names = [info["license"].strip().splitlines()[0][:80]]
    return [{"license": {"name": n}} for n in names if n]


def describe_python(document, name):
    """Complète la sortie de cyclonedx-py : de quoi le SBOM est l'inventaire, et la licence de chaque composant."""
    document.setdefault("metadata", {})["component"] = {
        "type": "application",
        "name": "lonkoo-" + name.replace("_", "-"),
        "description": "Microservice interne de l'agent IA (FastAPI), image Docker construite depuis requirements.lock.",
    }
    for component in document.get("components") or []:
        component.pop("description", None)  # la ligne du fichier de dépendances, avec ses empreintes : du bruit
        component["bom-ref"] = component["purl"]
        licenses = pypi_licenses(component["name"], component["version"])
        if licenses:
            component["licenses"] = licenses


def make_python(name, out):
    print(f"== {name} (Python)")
    lock = ROOT / name / "requirements.lock"
    venv = Path(tempfile.mkdtemp()) / "venv"
    run([sys.executable, "-m", "venv", venv], ROOT)
    tools = venv / ("Scripts" if sys.platform == "win32" else "bin")
    run([tools / "python", "-m", "pip", "install", "--quiet", "--disable-pip-version-check", CYCLONEDX_PY], ROOT)
    target = out / f"{name}.cdx.json"
    run([tools / "cyclonedx-py", "requirements", lock, "--sv", SPEC_VERSION, "--of", "JSON", "-o", target], ROOT)
    document = json.loads(target.read_text(encoding="utf-8"))
    describe_python(document, name)
    write_json(target, document)
    return ["pip", str(lock), str(target)]


def run_checks(checks):
    """Lance scripts/check_sbom.py pour chaque SBOM ; rend le nombre de SBOM refusés."""
    failed = 0
    for check in checks:
        result = subprocess.run([sys.executable, str(ROOT / "scripts" / "check_sbom.py"), *check])
        failed += result.returncode != 0
    return failed


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default=str(ROOT / "docs" / "sbom"), help="dossier de sortie (docs/sbom par défaut)")
    parser.add_argument("--verify", action="store_true",
                        help="ne produit rien : vérifie que les SBOM déjà dans --out correspondent aux dépendances actuelles")
    args = parser.parse_args()
    out = Path(args.out).resolve()

    if args.verify:
        print("== vérification de " + str(out))
        checks = [["maven", maven_truth(), str(out / "backend.cdx.json")]] + [
            ["npm", str(ROOT / name / "package-lock.json"), str(out / f"{name}.cdx.json")] for name in ("frontend", "realtime")
        ] + [["pip", str(ROOT / "agent_ia" / "requirements.lock"), str(out / "agent_ia.cdx.json")]]
        if run_checks(checks):
            sys.exit("docs/sbom est périmé (une dépendance a changé) : relancez `python3 scripts/make_sbom.py` et commitez le résultat.")
        print("docs/sbom est à jour.")
        return

    checks = [make_backend(out), make_npm("frontend", out), make_npm("realtime", out), make_python("agent_ia", out)]

    print("== vérification (scripts/check_sbom.py)")
    failed = run_checks(checks)
    if failed:
        sys.exit(f"{failed} SBOM incomplet(s) : voir ci-dessus.")
    print(f"Quatre SBOM CycloneDX {SPEC_VERSION} écrits dans {out}")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
