# Composants tiers et licences

**Règle du règlement CADev (article 6) :** seuls les composants sous licence permissive (notamment MIT, Apache 2.0, BSD) sont admis. Les licences à réciprocité (GPL, AGPL, LGPL) rendent le projet **irrecevable**. Tous les composants et leurs licences sont déclarés à la soumission.

Mise à jour obligatoire à chaque nouvelle dépendance, dans la même pull request.

## 1. Composants utilisés

La colonne « Vérifié » se coche seulement après avoir lu la licence dans le dépôt ou le paquet du composant, et pas seulement ce tableau. Les licences indiquées sont à confirmer à la source avant de cocher « Vérifié ».

| Composant | Version | Licence | Permissive ? | Usage | Source | Vérifié |
|---|---|---|---|---|---|---|
| Next.js | 16.4.2 | MIT | Oui | Frontend | npm | [x] |
| React / React DOM | 19.3.1 | MIT | Oui | Frontend | npm | [x] |
| React Flow (@xyflow/react) | [x] | MIT | Oui | Canvas | npm | [ ] |
| Tailwind CSS (et @tailwindcss/postcss) | 4.3.3 | MIT | Oui | Style (build uniquement) | npm | [x] |
| @phosphor-icons/react | 2.1.10 | MIT | Oui | Icônes | npm | [x] |
| TypeScript | 6.0.3 | Apache 2.0 | Oui | Compilation et vérification des types (développement) | npm | [x] |
| ESLint, eslint-config-next | 9.39.5, 16.4.2 | MIT | Oui | Lint (développement) | npm | [x] |
| caniuse-lite (dépendance de next) | 1.0.30001816 | CC-BY-4.0 | Oui (données, attribution) | Table de compatibilité des navigateurs, livrée avec next | npm | [x] |
| Yjs | 13.6.33 | MIT | Oui | Document partagé du canvas (serveur temps réel et navigateur) | npm | [x] |
| Hocuspocus (`@hocuspocus/server`, `@hocuspocus/common` ; `@hocuspocus/provider` : tests du serveur et navigateur) | 4.7.1 | MIT | Oui | Serveur de synchronisation temps réel (remplace y-websocket, qui n'a plus de serveur) et client du studio | npm | [x] |
| jose | 6.2.13 | MIT | Oui | Vérification des tickets JWT du temps réel | npm | [x] |
| ws | 8.22.0 | MIT | Oui | Serveur WebSocket (8.18.3 écarté : deux avis de sécurité) | npm | [x] |
| Dépendances de Hocuspocus et Yjs : async-mutex 0.5.0, crossws 0.4.15, isomorphic.js 0.2.5, kleur 4.1.5, lib0 0.2.119, y-protocols 1.0.7 | voir `package-lock.json` | MIT | Oui | Serveur temps réel | npm | [x] |
| tslib (dépendance de Hocuspocus) | 2.8.1 | 0BSD | Oui | Serveur temps réel | npm | [x] |
| @lifeomic/attempt (dépendance de `@hocuspocus/provider`) | 3.1.0 | MIT | Oui | Reconnexion du client temps réel (navigateur) | npm | [x] |
| ajv, avec fast-deep-equal 3.1.3, json-schema-traverse 1.0.0, require-from-string 2.0.2, fast-uri 3.1.9 (BSD-3-Clause) | 8.17.1 | MIT | Oui | Tests du front : un bloc écrit par le tableau blanc est valide pour le schéma du contrat (développement uniquement, jamais livré) | npm | [x] |
| Spring Boot (starters, Spring Framework 7.0.9, Spring Security) | 4.1.1 | Apache 2.0 | Oui | Backend | Maven | [x] |
| Apache Log4j2 (log4j-core, log4j-slf4j2-impl) | 2.25.5 | Apache 2.0 | Oui | Journaux (remplace Logback) | Maven | [x] |
| Flyway (flyway-core, flyway-database-postgresql) | 12.4.0 | Apache 2.0 | Oui | Migrations SQL | Maven | [x] |
| Playwright (`playwright-core`, dossier `e2e/`) | 1.64.1 | Apache 2.0 | Oui | Outil de vérification dans un navigateur, jamais livré (ni images Docker, ni SBOM) ; télécharge Chromium (BSD-3-Clause) pour son usage | npm | [x] |
| Spring Session (spring-session-core, spring-session-jdbc, avec les modules `spring-boot-session*` de Spring Boot) | 4.1.1 | Apache 2.0 (le POM écrit « Broadcom Foundation License », sans texte ; le jar embarque la licence Apache 2.0 : voir section 2) | Oui | Sessions en base | Maven | [x] |
| Pilote JDBC PostgreSQL | 42.7.13 | BSD-2-Clause | Oui | Accès à la base | Maven | [x] |
| Hibernate Validator | 9.1.3.Final | Apache 2.0 | Oui | Validation des requêtes (pas d'ORM Hibernate) | Maven | [x] |
| networknt json-schema-validator | 3.0.8 | Apache 2.0 | Oui | Validation des instantanés de canvas | Maven | [x] |
| Nimbus JOSE + JWT | 10.9.1 | Apache 2.0 | Oui | Signature des tickets temps réel | Maven | [x] |
| zonky embedded-postgres (et binaires PostgreSQL 14) | 2.2.2 | Apache 2.0 (binaires : licence PostgreSQL) | Oui | Tests du backend uniquement, jamais livré | Maven | [x] |
| PostgreSQL | 16 | Licence PostgreSQL | Oui | Base de données | Docker | [ ] |
| FastAPI, Uvicorn, HTTPX, Pydantic, jsonschema | 0.162.0, 0.54.0, 0.28.1, 2.14.2, 4.26.0 | MIT, BSD-3-Clause, BSD-3-Clause, MIT, MIT | Oui | Agent IA (`agent_ia/`, Python 3.12) : serveur HTTP, appels au fournisseur d'IA, validation du contrat du canvas | PyPI | [x] |
| Dépendances indirectes de l'agent IA (23 paquets : Starlette, anyio, h11, httpcore, idna, click, python-dotenv, PyYAML, watchfiles, websockets, httptools, uvloop, attrs, referencing, rpds-py, jsonschema-specifications, typing-extensions, typing-inspection, annotated-types, annotated-doc, pydantic-core, opentelemetry-api, certifi) | voir `agent_ia/requirements.lock` | MIT, BSD-3-Clause, Apache 2.0, PSF-2.0 (typing-extensions), Apache 2.0 ou MIT (uvloop) ; **certifi : MPL-2.0 (voir section 2)** | Oui, sauf certifi | Agent IA | PyPI | [x] licences lues sur PyPI le 04/11/2026 |
| pytest (avec iniconfig, packaging, pluggy, Pygments ; colorama sous Windows) | 9.2.0 | MIT (pytest, iniconfig, pluggy), Apache 2.0 ou BSD-2-Clause (packaging), BSD-2-Clause (Pygments), BSD-3-Clause (colorama) | Oui | Tests de l'agent IA (développement), jamais livré | PyPI | [x] |
| Image Docker `python:3.12-slim` | 3.12 | PSF-2.0 (Python) ; système Debian | Oui (Python) | Image de l'agent IA | Docker | [ ] même réserve que pour les autres images : le système est hors du périmètre du SBOM |
| [Bibliothèque d'icônes] | [x] | [à vérifier] | [ ] | Icônes | [ ] | [ ] |
| | | | | | | |

## 2. Composants à surveiller (pièges connus)

| Composant | Problème | Action |
|---|---|---|
| Hibernate ORM (avant la version 7) | LGPL 2.1. La relicence Apache 2.0 ne s'applique qu'à partir de la 7.0 | Utiliser Hibernate 7 ou ne pas utiliser JPA. Vérifier avec `mvn dependency:tree` |
| Logback (journaux par défaut de Spring Boot) | Double licence EPL 2.0 ou LGPL 2.1 (1.5.x) | Fait : exclu de tout l'arbre (`spring-boot-starter-logging` exclu dans `backend/pom.xml`), Log4j2 à la place. Vérifié le 2026-10-21 sur les 97 dépendances d'exécution du backend (`dependency:list` + licences des POM) : aucune LGPL ni GPL seule ; seule `jakarta.annotation-api` est en EPL 2.0 / GPL 2 avec exception Classpath (ligne ci-dessous) ; HdrHistogram est en CC0 ou BSD-2-Clause |
| OpenJDK | GPL 2 avec exception Classpath | Question posée à l'organisateur. Usage courant, à confirmer |
| Next.js : sharp / @img/sharp-libvips-* | LGPL-3.0-or-later, installé en dépendance optionnelle de `next` ; fait échouer le contrôle de licences | Fait : `frontend/stubs/sharp` (paquet privé, version 0.35.5) déclaré comme **workspace npm** (`"workspaces": ["stubs/sharp"]`) : il satisfait la plage demandée par `next`, donc npm le lie au lieu de télécharger sharp et libvips ; `images: { unoptimized: true }` dans `next.config.ts`. Vérifié le 2026-10-20 : `npm ci` n'installe aucun `@img/*`. Ne pas utiliser `overrides` avec `file:` : le chemin est résolu depuis `node_modules/next` et `npm ci` échoue. Si `next` change la plage de `sharp`, relever la version du stub (la CI le signale) |
| jakarta.annotation-api | EPL 2.0 ou GPL 2 avec exception Classpath, présent dans toute application Spring Boot | Question à l'organisateur (voir QUESTIONS-ORGANISATEUR.md) |
| spring-session-core, spring-session-jdbc 4.1.1 | Le POM déclare « Broadcom Foundation License », un nom que le contrôle ne reconnaît pas et qui ne renvoie à aucun texte | Vérifié le 2026-10-25 : `META-INF/LICENSE.txt` de chaque jar est le texte intégral de la licence Apache 2.0 ; le même éditeur déclare Apache 2.0 pour les autres bibliothèques Spring. Consigné comme exception dans `scripts/check_licenses_maven.py`. À confirmer avec l'organisateur si le doute persiste (il suffirait alors de retirer `spring-boot-starter-session-jdbc` : sessions en mémoire, à nouveau) |
| tldraw | Licence propre, clé exigée en production | Ne pas utiliser |
| PlantUML | Plusieurs licences au choix, la version GPL est la plus complète | Si utilisé, télécharger la version MIT ou Apache |
| Jakarta EE (certaines API) | Double licence EPL 2.0 ou GPL 2 avec exception Classpath | Vérifier dans le rapport de licences |
| certifi 2026.10.23 (dépendance obligatoire de HTTPX, donc de l'agent IA) | MPL-2.0 : copyleft de fichier. Seuls les fichiers de certifi, si on les modifie, restent sous MPL ; rien d'autre n'est touché. Ici : installé tel quel depuis PyPI, jamais modifié. Le contrôle automatique ne refuse que GPL, AGPL et LGPL, mais notre règle interne est « licences permissives seulement » | **Décision à prendre** : poser la question à l'organisateur (`docs/QUESTIONS-ORGANISATEUR.md`). Exception déclarée dans `scripts/check_licenses_python.py`. Repli si c'est refusé : remplacer HTTPX par un client HTTP sans certifi |

## 3. Assets (icônes, polices, images)

| Asset | Licence | Source |
|---|---|---|
| Geist et Geist Mono (polices) | SIL Open Font License 1.1 | Google Fonts, chargées par `next/font/google` et auto-hébergées au build |

Pas de logos de marques (Wave, Orange Money, WhatsApp, Systalink) sans autorisation.

## 4. Code antérieur au concours

Le règlement permet d'intégrer du code appartenant à un membre de l'équipe et antérieur au concours, à condition de le déclarer.

| Fichier ou dossier | Propriétaire | Date de création | Raison |
|---|---|---|---|
| Aucun | | | |

## 5. Vérification automatique

La CI (`.github/workflows/ci.yml`) contrôle de façon bloquante les licences npm, celles des dépendances d'exécution Maven (`scripts/check_licenses_maven.py` : refus d'une licence GPL, AGPL ou LGPL sans alternative permissive, exceptions documentées dans le script) et celles de l'agent IA en Python (`scripts/check_licenses_python.py`, même règle, d'après `docs/sbom/agent_ia.cdx.json`) ; le rapport complet du plugin Maven reste informatif. Lancer aussi à la main avant la soumission :

Les inventaires des composants livrés (SBOM CycloneDX, un par morceau) sont dans [sbom/](sbom/README.md) : `python3 scripts/make_sbom.py` les régénère, la CI vérifie qu'ils sont à jour et complets. Les deux outils qui les produisent, `cyclonedx-maven-plugin` 2.9.3 et `@cyclonedx/cyclonedx-npm` 6.0.1, sont sous licence Apache 2.0 ; ils ne sont pas des dépendances du projet (lancés à la demande, jamais livrés).

```bash
# Java
cd backend && mvn org.codehaus.mojo:license-maven-plugin:2.4.0:add-third-party
# puis lire backend/target/generated-sources/license/THIRD-PARTY.txt

# Node
cd frontend && npx license-checker-rseidelsohn --production --summary
```
