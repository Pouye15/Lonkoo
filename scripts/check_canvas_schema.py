"""Vérifie que le schéma du canvas est valide et que les exemples le respectent.

Usage : python scripts/check_canvas_schema.py
Dépendance : jsonschema (MIT).
"""
import json
import pathlib
import sys

from jsonschema import Draft202012Validator

racine = pathlib.Path(__file__).resolve().parent.parent
schema = json.loads((racine / "docs" / "canvas.schema.json").read_text(encoding="utf-8"))
Draft202012Validator.check_schema(schema)
validateur = Draft202012Validator(schema)

echecs = 0
for exemple in sorted((racine / "docs" / "exemples").glob("*.canvas.json")):
    erreurs = list(validateur.iter_errors(json.loads(exemple.read_text(encoding="utf-8"))))
    if erreurs:
        echecs += 1
        print(f"ÉCHEC {exemple.name}")
        for e in erreurs[:5]:
            print(f"  - {'/'.join(map(str, e.path))}: {e.message}")
    else:
        print(f"OK    {exemple.name}")
sys.exit(1 if echecs else 0)
