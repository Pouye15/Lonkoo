#!/usr/bin/env python3
"""Cherche des avis de sécurité connus (OSV.dev) pour les dépendances Maven d'exécution du backend.

Usage :
    cd backend && mvn -B -ntp dependency:list -DincludeScope=runtime -DoutputFile=../deps.txt
    python3 scripts/check_osv_maven.py deps.txt

Code de sortie : 0 si aucun avis, 1 s'il y en a, 2 si OSV est injoignable.
Bibliothèque standard seulement (aucune dépendance à déclarer).
"""
import json
import re
import sys
import urllib.error
import urllib.request

OSV = "https://api.osv.dev/v1"
DEPENDENCY = re.compile(r"^\s*([^:\s]+):([^:\s]+):jar:([^:\s]+):")


def post(url, payload):
    request = urllib.request.Request(
        url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def get(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.load(response)


def main(path):
    dependencies = []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            match = DEPENDENCY.match(line)
            if match:
                dependencies.append(match.groups())
    if not dependencies:
        print(f"Aucune dépendance lue dans {path}", file=sys.stderr)
        return 2

    queries = [
        {"package": {"name": f"{group}:{artifact}", "ecosystem": "Maven"}, "version": version}
        for group, artifact, version in dependencies
    ]
    try:
        results = post(f"{OSV}/querybatch", {"queries": queries})["results"]
        affected = {}
        for (group, artifact, version), result in zip(dependencies, results):
            for vuln in result.get("vulns", []):
                affected.setdefault(vuln["id"], set()).add(f"{group}:{artifact}:{version}")
        details = {vuln_id: get(f"{OSV}/vulns/{vuln_id}") for vuln_id in affected}
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"OSV.dev injoignable : {error}", file=sys.stderr)
        return 2

    print(f"{len(dependencies)} dépendances interrogées, {len(affected)} avis")
    for vuln_id, artifacts in sorted(affected.items()):
        detail = details[vuln_id]
        severity = detail.get("database_specific", {}).get("severity", "?")
        fixed = sorted(
            {
                event["fixed"]
                for entry in detail.get("affected", [])
                for rng in entry.get("ranges", [])
                for event in rng.get("events", [])
                if "fixed" in event
            }
        )
        print(f"\n{vuln_id} [{severity}] {detail.get('summary', '')}")
        print(f"  touche : {', '.join(sorted(artifacts))}")
        print(f"  corrigé dans : {', '.join(fixed[:6]) or '?'}")
    return 1 if affected else 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
