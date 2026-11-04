import json
import re
from pathlib import Path
from typing import Any, Dict, List, Set
import jsonschema

# Liste des mots réservés Java 21, PostgreSQL et YAML 1.1
JAVA_RESERVED: Set[str] = {
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
    "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float",
    "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native",
    "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
    "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
    "volatile", "while", "true", "false", "null", "record", "var", "yield", "sealed", "permits"
}

SQL_RESERVED: Set[str] = {
    "all", "alter", "analyse", "analyze", "and", "any", "array", "as", "asc", "asymmetric",
    "authorization", "begin", "between", "binary", "both", "by", "cast", "check", "collate",
    "collation", "column", "commit", "concurrently", "constraint", "create", "cross",
    "current_catalog", "current_date", "current_role", "current_schema", "current_time",
    "current_timestamp", "current_user", "database", "deferrable", "delete", "desc", "distinct",
    "do", "drop", "else", "end", "except", "exists", "false", "fetch", "for", "foreign", "freeze",
    "from", "full", "grant", "group", "having", "ilike", "in", "index", "initially", "inner",
    "insert", "intersect", "into", "is", "isnull", "join", "key", "lateral", "leading", "left",
    "like", "limit", "localtime", "localtimestamp", "natural", "not", "notnull", "null", "offset",
    "on", "only", "or", "order", "outer", "overlaps", "placing", "primary", "references",
    "returning", "right", "rollback", "schema", "select", "session_user", "set", "similar", "some",
    "symmetric", "system_user", "table", "tablesample", "then", "to", "trailing", "trigger", "true",
    "union", "unique", "update", "user", "using", "values", "variadic", "verbose", "view", "when",
    "where", "window", "with"
}

YAML_RESERVED: Set[str] = {
    "true", "false", "null", "yes", "no", "on", "off", "y", "n"
}

IDENT_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,30}$")

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schemas" / "canvas.schema.json"
with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
    RAW_SCHEMA = json.load(f)

validator_cls = jsonschema.validators.validator_for(RAW_SCHEMA)
validator_cls.check_schema(RAW_SCHEMA)
COMPILED_VALIDATOR = validator_cls(RAW_SCHEMA)


def is_reserved(ident: str) -> bool:
    low = ident.lower()
    return low in JAVA_RESERVED or low in SQL_RESERVED or low in YAML_RESERVED


def validate_canvas(canvas: Dict[str, Any]) -> List[str]:
    """Valide la structure du canvas selon JSON Schema et les règles d'intégrité LONKOO."""
    errors: List[str] = []

    # 1. Validation JSON Schema
    for err in COMPILED_VALIDATOR.iter_errors(canvas):
        path = ".".join(str(p) for p in err.absolute_path) or "root"
        errors.append(f"{path}: {err.message}")

    if errors:
        return errors

    # 2. Règles métiers LONKOO (unicité, liens, mots réservés)
    nodes = canvas.get("nodes", [])
    node_ids: Set[str] = set()
    node_names: Set[str] = set()

    for node in nodes:
        node_id = node.get("id", "")
        if node_id in node_ids:
            errors.append(f"Identifiant de bloc dupliqué : {node_id}")
        node_ids.add(node_id)

        data = node.get("data", {})
        name = data.get("name", "")
        where = f"bloc {node_id}"

        if not name:
            errors.append(f"Nom de bloc vide ({where})")
        elif not IDENT_PATTERN.match(name):
            errors.append(f"Nom de bloc invalide (format ^[a-z][a-z0-9_]{{0,30}}$ requis) : {name} ({where})")
        elif is_reserved(name):
            errors.append(f"Nom de bloc réservé : {name} ({where})")
        elif name in node_names:
            errors.append(f"Nom de bloc dupliqué : {name}")
        else:
            node_names.add(name)

        # Vérification entités et champs
        entity_names: Set[str] = set()
        for entity in data.get("entities", []):
            ename = entity.get("name", "")
            if not ename or not IDENT_PATTERN.match(ename):
                errors.append(f"Nom d'entité invalide dans {where} : {ename}")
            elif is_reserved(ename):
                errors.append(f"Nom d'entité réservé dans {where} : {ename}")
            elif ename in entity_names:
                errors.append(f"Nom d'entité dupliqué dans {where} : {ename}")
            else:
                entity_names.add(ename)

            field_names: Set[str] = set()
            for field in entity.get("fields", []):
                fname = field.get("name", "")
                if not fname or not IDENT_PATTERN.match(fname):
                    errors.append(f"Nom de champ invalide ({fname}) dans entité {ename} ({where})")
                elif is_reserved(fname):
                    errors.append(f"Nom de champ réservé ({fname}) dans entité {ename} ({where})")
                elif fname in field_names:
                    errors.append(f"Nom de champ dupliqué ({fname}) dans entité {ename} ({where})")
                else:
                    field_names.add(fname)

    # 3. Vérification des liens (edges)
    edge_ids: Set[str] = set()
    for edge in canvas.get("edges", []):
        eid = edge.get("id", "")
        if eid in edge_ids:
            errors.append(f"Identifiant de lien dupliqué : {eid}")
        edge_ids.add(eid)

        source = edge.get("source", "")
        target = edge.get("target", "")
        if source not in node_ids:
            errors.append(f"Lien {eid} : source inconnue {source}")
        if target not in node_ids:
            errors.append(f"Lien {eid} : cible inconnue {target}")

    return errors
