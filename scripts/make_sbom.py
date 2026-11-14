#!/usr/bin/env python3
"""Produit les SBOM CycloneDX du projet (inventaire des composants livrés) et vérifie qu'ils sont complets.

Trois inventaires, un par morceau qui embarque des bibliothèques tierces :

- backend  : Maven, dépendances d'exécution (cyclonedx-maven-plugin, Apache 2.0) ;
- frontend : npm, dépendances de production, d'après `package-lock.json` (@cyclonedx/cyclonedx-npm, Apache 2.0) ;
- realtime : idem pour le serveur temps réel ;
- agent_ia : PyPI, d'après `agent_ia/requirements.lock` (la fermeture figée qu'installe l'image, licences relevées
  dans chaque paquet et inscrites dans le verrou). Aucun outil tiers : le document est écrit ici, sans réseau.

Sont exclus : les outils de développement et de test (jamais livrés), et ce qui n'est pas une bibliothèque de
l'application (système de l'image Docker, JDK, Node). Les outils qui produisent les SBOM ne sont pas des dépendances du
projet : ils sont lancés à la demande, version épinglée.

Chaque SBOM est ensuite comparé à une source indépendante par `scripts/check_sbom.py` : s'il manque un composant, ce
script échoue.

Usage :
    python3 scripts/make_sbom.py                 # écrit docs/sbom/*.cdx.json
    python3 scripts/make_sbom.py --only agent_ia # un seul inventaire (les autres restent en place)
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
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CYCLONEDX_MAVEN = "org.cyclonedx:cyclonedx-maven-plugin:2.9.3"
CYCLONEDX_NPM = "@cyclonedx/cyclonedx-npm@6.0.1"
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


PYPI_LOCKS = {"agent_ia": Path("agent_ia") / "requirements.lock"}


def parse_pypi_lock(path):
    """Lit un verrou `nom==version  # LICENCE` : rend la liste (nom, version, licence SPDX)."""
    composants = []
    for ligne in Path(path).read_text(encoding="utf-8").splitlines():
        nu = ligne.strip()
        if not nu or nu.startswith("#"):
            continue
        epingle, _, licence = nu.partition("#")
        nom, sep, version = epingle.strip().partition("==")
        if not sep:
            sys.exit(f"{path} : ligne non épinglée (`nom==version` attendu) : {ligne}")
        licence = licence.strip()
        if not licence:
            sys.exit(f"{path} : licence absente pour {nom} (commentaire `# SPDX` attendu en fin de ligne)")
        composants.append((nom.strip(), version.strip(), licence))
    if not composants:
        sys.exit(f"{path} : aucun composant épinglé")
    return composants


def make_python(name, out):
    """SBOM d'un service Python, écrit depuis son verrou : pas d'outil tiers, pas de réseau."""
    print(f"== {name} (PyPI, depuis requirements.lock)")
    lock = ROOT / PYPI_LOCKS[name]
    composants = parse_pypi_lock(lock)
    document = {
        "bomFormat": "CycloneDX",
        "specVersion": SPEC_VERSION,
        # Numéro de série déterministe : deux exécutions sur le même verrou donnent le même fichier,
        # sinon `--verify` signalerait un changement à chaque appel.
        "serialNumber": "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, f"lonkoo:sbom:{name}")),
        "version": 1,
        "metadata": {
            "component": {
                "type": "application",
                "name": f"lonkoo-{name.replace('_', '-')}",
                "version": "0.0.0",
                "description": "Microservice interne de l'agent IA de LONKOO (FastAPI).",
            },
            "properties": [
                {"name": "lonkoo:source", "value": str(PYPI_LOCKS[name]).replace("\\", "/")},
                {"name": "lonkoo:note",
                 "value": "Inventaire écrit depuis le verrou installé par l'image (pip install --no-deps) : "
                          "l'image et ce SBOM portent le même inventaire. Licences relevées dans chaque paquet."},
            ],
        },
        "components": [
            {
                "type": "library",
                "name": nom,
                "version": version,
                "purl": f"pkg:pypi/{nom.lower().replace('_', '-')}@{version}",
                "licenses": [{"license": {"id": licence}}],
            }
            for nom, version, licence in sorted(composants)
        ],
    }
    cible = out / f"{name}.cdx.json"
    write_json(cible, document)
    return ["pypi", str(lock), str(cible)]


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
    parser.add_argument("--only", choices=("backend", "frontend", "realtime", "agent_ia"),
                        help="ne (re)produire qu'un seul inventaire ; les autres fichiers de --out restent en place")
    args = parser.parse_args()
    out = Path(args.out).resolve()

    if args.verify:
        print("== vérification de " + str(out))
        checks = [["maven", maven_truth(), str(out / "backend.cdx.json")]] + [
            ["npm", str(ROOT / name / "package-lock.json"), str(out / f"{name}.cdx.json")] for name in ("frontend", "realtime")
        ] + [
            ["pypi", str(ROOT / PYPI_LOCKS[name]), str(out / f"{name}.cdx.json")] for name in PYPI_LOCKS
        ]
        if args.only:
            checks = [check for check in checks if check[2].endswith(f"{args.only}.cdx.json")]
        if run_checks(checks):
            sys.exit("docs/sbom est périmé (une dépendance a changé) : relancez `python3 scripts/make_sbom.py` et commitez le résultat.")
        print("docs/sbom est à jour.")
        return

    fabriques = {
        "backend": lambda: make_backend(out),
        "frontend": lambda: make_npm("frontend", out),
        "realtime": lambda: make_npm("realtime", out),
        "agent_ia": lambda: make_python("agent_ia", out),
    }
    demandes = [args.only] if args.only else list(fabriques)
    checks = [fabriques[nom]() for nom in demandes]

    print("== vérification (scripts/check_sbom.py)")
    failed = run_checks(checks)
    if failed:
        sys.exit(f"{failed} SBOM incomplet(s) : voir ci-dessus.")
    print(f"{len(checks)} SBOM CycloneDX {SPEC_VERSION} écrit(s) dans {out}")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
