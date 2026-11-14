# SBOM : inventaire des composants livrés

Quatre inventaires au format [CycloneDX](https://cyclonedx.org/) 1.6 (JSON), un par morceau du projet qui embarque des
bibliothèques tierces. Ils accompagnent la déclaration des composants tiers ([../LICENCES-TIERCES.md](../LICENCES-TIERCES.md)).

| Fichier | Contenu | Source | Composants |
|---|---|---|---|
| `backend.cdx.json` | API Spring Boot : dépendances Maven d'exécution | `cyclonedx-maven-plugin` 2.9.3 (Apache 2.0) | 102 |
| `frontend.cdx.json` | Interface Next.js : dépendances npm de production | `@cyclonedx/cyclonedx-npm` 6.0.1 (Apache 2.0) | 32 |
| `realtime.cdx.json` | Serveur temps réel Node : dépendances npm de production | idem | 12 |
| `agent_ia.cdx.json` | Microservice IA Python : dépendances livrées par l'image | `scripts/make_sbom.py`, depuis `agent_ia/requirements.lock` (aucun outil tiers, aucun réseau) | 20 |

Chaque composant a son identifiant (`purl`), sa version, sa licence déclarée et, côté Maven, les empreintes de son jar.

## Ce qui en fait partie, et ce qui n'en fait pas partie

- **Dedans :** les bibliothèques que l'application embarque et exécute.
- **Dehors :** les outils de développement et de test (jamais livrés), le système des images Docker, le JDK, Node et
  Python. Les deux outils qui produisent les fichiers Maven et npm ne sont pas des dépendances du projet : ils sont
  lancés à la demande, version épinglée. `pytest` (tests du microservice IA) n'est ni dans l'image ni dans le SBOM.
- **Le microservice IA, sans outil tiers :** son inventaire est écrit directement par `scripts/make_sbom.py` depuis
  `agent_ia/requirements.lock`, le verrou qu'installe son image (`pip install --no-deps`). Image et SBOM portent donc
  le même inventaire par construction. La licence de chaque composant est relevée dans le paquet lui-même et inscrite
  en fin de ligne dans le verrou ; `scripts/check_licenses_python.py` refuse une ligne sans licence, une version non
  épinglée ou une licence hors de la liste permissive.
- **Un faux paquet, décrit comme tel :** l'interface remplace `sharp` par un dossier local (`frontend/stubs/sharp`) pour
  ne pas installer libvips, sous licence LGPL, interdite par le règlement. Dans `frontend.cdx.json`, ce faux paquet porte
  l'identifiant `pkg:generic/sharp-stub` (et non `pkg:npm/sharp`), une description et la propriété `lonkoo:stub`, pour
  qu'un outil d'analyse ne croie pas que la vraie bibliothèque est livrée.

## Les régénérer

```bash
python3 scripts/make_sbom.py            # réécrit docs/sbom/*.cdx.json puis les vérifie
python3 scripts/make_sbom.py --verify   # ne produit rien : échoue si docs/sbom ne correspond plus aux dépendances
```

```bash
python3 scripts/make_sbom.py --only agent_ia   # un seul inventaire, sans Maven ni npm (quelques secondes)
```

À refaire (et à commiter) dès qu'une dépendance Maven, npm ou Python change : la CI (job « SBOM des composants ») échoue
sinon, et dépose en plus les SBOM de la version testée en artefact. Prérequis : Java 21 et Maven (ou le wrapper du
backend), Node, un accès au réseau pour télécharger les deux outils. Le numéro de série et l'horodatage changent à
chaque génération : seul le contenu des composants compte.

## Comment on sait qu'ils sont complets

Un SBOM qui oublie des composants est pire que pas de SBOM. `scripts/check_sbom.py` compare donc chaque fichier à une
source indépendante de l'outil qui l'a produit : la liste `mvn dependency:list -DincludeScope=runtime` pour Maven, le
`package-lock.json` (hors paquets de développement) pour npm, le verrou `agent_ia/requirements.lock` pour le microservice
IA. Il échoue s'il manque un composant, ou si le fichier est mal formé. Les quatre fichiers ont aussi été validés contre
le schéma JSON officiel de CycloneDX 1.6 (`agent_ia.cdx.json` le 14/11/2026).

Le numéro de série d'`agent_ia.cdx.json` est déterministe (dérivé du nom du service) : deux générations sur le même
verrou donnent un fichier identique, sinon `--verify` signalerait un changement à chaque appel.

## Limites

- Le SBOM npm est établi d'après le `package-lock.json`, donc sur toutes les plateformes : il peut lister des paquets
  optionnels qui ne s'installent pas sur la machine qui le lit (binaires d'une autre plateforme).
- Les licences sont celles que les paquets **déclarent** (champ `license` du POM ou du `package.json`). Le contrôle
  bloquant de la CI est ailleurs (`scripts/check_licenses_maven.py`, `license-checker`) ; deux dépendances Spring Session
  déclarent un nom de licence ambigu, vérifié et consigné dans `LICENCES-TIERCES.md`, section 2.
