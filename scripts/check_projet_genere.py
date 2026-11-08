#!/usr/bin/env python3
"""Vérifie un projet généré par LONKOO une fois construit et démarré (job « projet-genere » de la CI).

Le script lit le canvas qui a servi à générer le projet (docs/architecture/canvas.json du projet généré) et s'y adapte :
il fonctionne donc pour n'importe quel modèle de départ.

  1. la santé du backend répond UP (il met quelques secondes à démarrer : on réessaie) ;
  2. chaque liste d'entité répond 200 avec une liste vide (la migration a créé les tables) ;
  3. pour chaque écriture d'entité (POST /<entités>) : une écriture valide donne 201 ; si l'entité a un champ unique, la
     même écriture redonne 409 (le 409 est réservé aux doublons) ; sans un champ obligatoire, 400 qui nomme le champ ; et
     ce refus n'a rien écrit (la même écriture, complète, passe ensuite en 201) ;
  4. chaque page de l'interface répond 200.

Usage : python3 scripts/check_projet_genere.py --canvas <canvas.json> [--api http://localhost:8080] [--front http://localhost:3000]
Bibliothèque standard seulement. Code de sortie : 0 si tout passe, 1 sinon.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
import uuid

SAMPLES = {
    "string": "exemple",
    "text": "exemple",
    "integer": 1,
    "long": 1,
    "decimal": 1,
    "boolean": True,
    "date": "2026-01-01",
    "datetime": "2026-01-01T00:00:00Z",
    "json": {},
}


def camel(name):
    """cree_le devient creeLe : le nom du champ dans le JSON du projet généré."""
    head, *tail = name.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in tail)


def strip_suffix(text, suffix):
    return text[: -len(suffix)] if text.endswith(suffix) and len(text) > len(suffix) else text


def entity_for_segment(segment, entities):
    """Même règle que le générateur : « commandes » désigne l'entité « commande » (s, es ou x retirés)."""
    normalized = segment.replace("-", "_")
    for candidate in (normalized, strip_suffix(normalized, "s"), strip_suffix(normalized, "es"), strip_suffix(normalized, "x")):
        for entity in entities:
            if entity["name"] == candidate:
                return entity
    return None


def single_segment(path):
    """« /commandes » donne « commandes » ; « /commandes/{id} » et « / » donnent None."""
    parts = [part for part in path.split("/") if part]
    return parts[0] if len(parts) == 1 else None


def payload(entity, token, without=None):
    """Une écriture valide de l'entité (champs obligatoires et uniques, valeurs d'exemple ; `token` rend les uniques distincts)."""
    body = {}
    for field in entity["fields"]:
        if field.get("name") == without:
            continue
        if not (field.get("required") or field.get("unique")):
            continue
        kind = field["type"]
        if kind == "uuid":
            value = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{entity['name']}.{field['name']}.{token}"))
        elif field.get("unique") and kind in ("string", "text"):
            value = f"ci-{token}"
        elif field.get("unique"):
            value = sum(map(ord, token)) + 1
        else:
            value = SAMPLES[kind]
        body[camel(field["name"])] = value
    return body


def entities_of(canvas):
    entities = []
    for node in canvas["nodes"]:
        if node["type"] == "database":
            entities.extend(node["data"].get("entities", []))
    return entities


def write_targets(canvas):
    """Les couples (chemin, entité) des POST sur une collection d'entité, et les chemins GET de liste."""
    entities = entities_of(canvas)
    posts, lists = [], []
    for node in canvas["nodes"]:
        if node["type"] != "service":
            continue
        for endpoint in node["data"].get("endpoints", []):
            segment = single_segment(endpoint["path"])
            entity = entity_for_segment(segment, entities) if segment else None
            if entity is None:
                continue
            if endpoint["method"] == "POST" and endpoint["path"] not in [p for p, _ in posts]:
                posts.append((endpoint["path"], entity))
            if endpoint["method"] == "GET" and endpoint["path"] not in lists:
                lists.append(endpoint["path"])
    return posts, lists


def pages_of(canvas):
    pages = [""]
    for node in canvas["nodes"]:
        if node["type"] == "webapp":
            pages.extend(node["data"].get("pages", []))
    return pages


def call(method, url, body=None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        with error:
            return error.code, error.read().decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        return 0, ""


def check(canvas, api, front, wait_seconds=120, sleep=time.sleep):
    # `front` à None : pas d'interface à vérifier (backend seul, par exemple en local sans Node).
    """Rend la liste des échecs (vide si tout passe). Affiche chaque vérification réussie."""
    failures = []

    def ok(message):
        print(f"OK   {message}")

    def fail(message):
        print(f"FAIL {message}")
        failures.append(message)

    # 1. santé
    deadline = time.monotonic() + wait_seconds
    status, text = 0, ""
    while True:
        status, text = call("GET", f"{api}/actuator/health")
        if status == 200 or time.monotonic() >= deadline:
            break
        sleep(3)
    if status == 200 and '"UP"' in text:
        ok("santé du backend généré : UP")
    else:
        fail(f"santé du backend généré : {status} (200 et UP attendus)")
        return failures

    posts, lists = write_targets(canvas)
    if not posts:
        fail("aucune écriture d'entité à vérifier dans ce modèle (POST sur le nom d'une entité attendu)")

    # 2. listes vides
    for path in lists:
        status, text = call("GET", f"{api}{path}")
        if status == 200 and text.strip() in ("[]", ""):
            ok(f"GET {path} : liste vide")
        else:
            fail(f"GET {path} : {status} {text[:80]!r} (200 et [] attendus)")

    # 3. écritures
    for path, entity in posts:
        name = entity["name"]
        token_a, token_b = f"{name}-a", f"{name}-b"
        valid = payload(entity, token_a)
        status, text = call("POST", f"{api}{path}", valid)
        if status == 201:
            ok(f"POST {path} : 201")
        else:
            fail(f"POST {path} : {status} {text[:120]!r} (201 attendu)")
            continue

        if any(field.get("unique") for field in entity["fields"]):
            status, _ = call("POST", f"{api}{path}", valid)
            if status == 409:
                ok(f"POST {path} en double : 409")
            else:
                fail(f"POST {path} en double : {status} (409 attendu)")

        required = next((field for field in entity["fields"] if field.get("required")), None)
        if required is None:
            continue
        status, text = call("POST", f"{api}{path}", payload(entity, token_b, without=required["name"]))
        try:
            fields = json.loads(text).get("champs", {})
        except (ValueError, AttributeError):
            fields = {}
        if status == 400 and camel(required["name"]) in fields:
            ok(f"POST {path} sans « {required['name']} » : 400 qui nomme le champ")
        else:
            fail(f"POST {path} sans « {required['name']} » : {status} {text[:120]!r} (400 avec champs.{camel(required['name'])} attendu)")
        if any(field.get("unique") for field in entity["fields"]):
            status, _ = call("POST", f"{api}{path}", payload(entity, token_b))
            if status == 201:
                ok(f"après le 400, POST {path} complet : 201 (rien n'a été écrit)")
            else:
                fail(f"après le 400, POST {path} complet : {status} (201 attendu : le refus n'aurait rien dû écrire)")

    # 4. pages
    for page in (pages_of(canvas) if front else []):
        status, _ = call("GET", f"{front}/{page}")
        if status == 200:
            ok(f"interface /{page} : 200")
        else:
            fail(f"interface /{page} : {status} (200 attendu)")
    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--canvas", required=True, help="docs/architecture/canvas.json du projet généré")
    parser.add_argument("--api", default="http://localhost:8080")
    parser.add_argument("--front", default="http://localhost:3000")
    parser.add_argument("--sans-interface", action="store_true", help="ne vérifie que le backend")
    args = parser.parse_args()
    with open(args.canvas, encoding="utf-8") as handle:
        canvas = json.load(handle)
    failures = check(canvas, args.api.rstrip("/"), None if args.sans_interface else args.front.rstrip("/"))
    if failures:
        print(f"\n{len(failures)} vérification(s) en échec.")
        return 1
    print("\nProjet généré vérifié : santé, API (201, 409, 400)" + ("." if args.sans_interface else " et interface."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
