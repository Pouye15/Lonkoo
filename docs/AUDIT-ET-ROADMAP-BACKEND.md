# Audit du backend et feuille de route du reste à faire

> Audit du 2026-10-21 (J-3 avant la soumission du samedi 24 octobre, midi), sur l'arbre de travail de la branche `backend`. Ce document complète [ROADMAP-BACKEND.md](ROADMAP-BACKEND.md), qui reste la référence des contrats (§ 7) et des décisions (§ 11) ; les numéros de lots `WP` sont les mêmes, les lots du reste à faire sont notés `R1` à `R12`.
>
> **Périmètre :** API Spring Boot, serveur temps réel (Node), base, Dockerfiles, contrats, tests. **Hors périmètre : l'agent IA** (Serine Fallou Ngom) ; seul son point de raccordement figure au lot R12.
>
> **Limites de l'audit :** seul le dépôt local a été examiné. Docker n'est pas installé sur le poste, donc **aucune image n'a été construite** ; aucun navigateur, VPS, GitHub ni Caddy n'a été contacté ; le travail éventuel de Fall ou de Gaye sur d'autres branches n'est pas vu.
>
> **Suivi du 21/10 :** les lots R1, R2 et R3 sont faits, R4 est fait côté code (essai réel en attente). Les constats C-01 à C-06, S-01 à S-03, S-05, D-01 à D-05 sont corrigés et couverts par des tests (OSV.dev : 0 avis sur les 97 dépendances Maven ; `npm audit` : 0) ; un test de chaîne permanent (backend Spring et serveur Node réels) surveille la chaîne temps réel. Un défaut de plus a été trouvé et corrigé en chemin (S-08). Après R2 : 71 tests Java et 31 tests Node, tous verts ; avec R4, 97 tests Java. Les constats ci-dessous restent tels que relevés à l'audit, avec la mention **Corrigé** quand c'est le cas ; le travail est commité localement en six commits, **pas encore poussé** ; reste à faire : R4 à R12.

## 1. En bref

1. **Le chemin parcouru est important :** 19 routes publiques et 2 routes internes côté Spring, un serveur temps réel Node (synchronisation, persistance, instantanés, restauration), deux migrations, 37 tests Java et 6 tests Node au vert. Environ 19 h des 37 h prévues pour le backend sont faites (WP1 à WP7).
2. **La chaîne complète ne fonctionne pas telle que livrée.** Quatre défauts la cassent (C-01 à C-04 au § 5) : le backend ne peut appeler aucune route du serveur temps réel, le WebSocket est refusé derrière Caddy, le format Yjs du codec n'est pas celui du contrat, et un instantané invalide donne 500 au lieu de 422. Avec le premier défaut contourné dans une sonde, tout le reste du parcours passe (synchronisation, persistance après redémarrage, version, restauration visible en direct, lecture seule). **Corrigé le 21/10 (R1).**
3. **Sécurité :** les routes internes du serveur temps réel n'ont aucune authentification ; trois dépendances ont des avis connus (Tomcat et Jackson côté backend, `ws` côté temps réel). L'authentification des routes internes (R1) et les dépendances (R2) sont corrigées.
4. **Le travail est maintenant commité localement** en six commits (R3), sans avoir été poussé : à relire, puis à pousser sur la branche `backend`.
5. **Ce qui reste est surtout hors de ce qui a été écrit :** connexion GitHub (WP4b), génération, envoi sur GitHub et déploiement (WP8), mise en ligne (WP11), branchement du front (WP12). Aucun n'est commencé dans le dépôt, et ils pèsent plus de la moitié du travail restant. Reste estimé à l'audit : **environ 52 h pour l'équipe, dont environ 21 h pour le backend de Pouye** ; R1 (4,5 h) étant fait, il reste environ 47 h et 17 h, pour environ 33 h disponibles pour Pouye d'ici samedi midi à l'origine.
6. **Point dur du calendrier :** WP8 (environ 12 h) tient difficilement avec WP11 avant jeudi soir. Décider ce soir ce qui est coupé (§ 6.6).

## 2. Ce qui a été fait pour cet audit

| Vérification | Résultat |
|---|---|
| Lecture du code : 48 fichiers Java, 11 classes de test, 2 migrations, 4 fichiers et 3 tests Node, `pom.xml`, Dockerfiles, `infra/Caddyfile`, CI | voir les constats |
| `./mvnw clean test` (JDK 25, cible 21) | 37 tests, 0 échec, environ 1 min 20 |
| `npm test` dans `realtime/` (Node 22.20 ; la CI utilise Node 24) | 6 tests, 0 échec |
| **Sonde de chaîne complète** (test Java jetable, supprimé) : Spring réel sur PostgreSQL embarqué, serveur Node réel, clients Hocuspocus réels | 23 vérifications, résultats aux § 4 et 5 |
| Sonde du client HTTP Java contre Node (GET et POST) | échec dans les deux cas avec le client par défaut |
| OSV.dev sur les 97 dépendances Maven d'exécution ; `npm audit --omit=dev` | 10 avis côté backend, 1 dépendance (2 avis) côté temps réel |
| Licences : relevé des POM des 97 dépendances ; `license-checker` sur `realtime/` (liste de la CI) | aucune LGPL ni GPL seule ; temps réel : MIT ×11, 0BSD ×1 |
| `npx @redocly/cli lint docs/openapi.yaml` | valide (avertissements de style seulement) |

Les sondes sont jetables : le test de chaîne est à recréer en test permanent (R1).

## 3. État par lot

| Lot | État | Ce qui reste |
|---|---|---|
| WP0 Poste et dépôt | partiel | PostgreSQL embarqué pour les tests (fait) ; Docker toujours absent ; **les deux applications OAuth GitHub sont à créer** (bloque R4) |
| WP1 Contrat d'API | fait, aligné sur le code et validé en CI (R3) | les routes GitHub, IA, génération et déploiement quand elles seront codées |
| WP2 Squelette Spring | fait (licences Maven bloquantes en CI depuis R3) | l'image sera construite par la CI au premier push |
| WP3 Base | fait (V1, V2, purge testée) | migration V3 d'index (Q-03) |
| WP4a Invité et session | fait | rien : fixation de session, expiration, limite par adresse (testées) |
| WP4b Connexion GitHub | codée et testée contre un faux GitHub (21/10) | essai réel avec l'application OAuth de développement ; message d'erreur côté front |
| WP5 Projets, canvas, partage | fait (T1 et suppression) | membres et rôles (T3) ; tests de rôles (Q-01) |
| WP6 Temps réel | écrit ; chaîne réparée le 21/10 (R1) | R6 |
| WP7 Versions | écrit ; utilisable depuis R1 | Q-02, Q-04 |
| WP8 Génération, GitHub, déploiement | non commencé (aucun code, migration V10 absente) | R8 |
| WP9 Sécurité transverse | partiel | R2, R10 |
| WP10 Tests et conformité | partiel | R5, R11 |
| WP11 Images et pipeline | partiel : Dockerfiles backend et temps réel écrits, jamais construits | R7 |
| WP12 Branchement du front | non commencé (front en `NEXT_PUBLIC_API_MODE=mock`, aucune référence à Hocuspocus) | R9 |
| WP13 Raccordement IA | non commencé | R12 (optionnel) |

## 4. Ce qui est solide (vérifié)

- **Une fois le client HTTP corrigé dans la sonde**, le parcours de bout en bout passe : deux clients Hocuspocus se synchronisent ; l'instantané JSON reflète leurs modifications (7 blocs du modèle d'exemple, puis 8) ; l'état est enregistré en base (3 s de debounce) et **retrouvé intact après redémarrage du serveur temps réel** ; une version est créée (201) puis **restaurée en direct chez un client connecté** (il passe de 0 à 8 blocs sans reconnexion) ; un canvas vide donne une version valide.
- **Lecture seule appliquée** : un membre `READ` qui ajoute un bloc voit sa modification refusée par le serveur (8 blocs avant et après).
- **Contrôle d'accès** : un seul service (`CanvasAccessService`), 404 et non 403 pour une ressource invisible, jeton de partage stocké en empreinte SHA-256, ticket JWT de 5 minutes lié au canvas, jeton de service comparé en temps constant, vérification d'`Origin`, limite de création d'invités par adresse réelle (lue dans `X-Forwarded-For`, testée sur un vrai serveur), session fermée à l'expiration de l'invité, erreurs en `application/problem+json`.
- **Licences** : aucune LGPL ni GPL seule dans les 97 dépendances d'exécution (seule `jakarta.annotation-api` est en EPL 2.0 ou GPL 2 avec exception, déjà signalée) ; Logback exclu ; le temps réel passe le contrôle npm de la CI.
- **Qualité du code** : 3 364 lignes Java (2 455 de production, 909 de test), 620 lignes Node, tests sans Docker ni Testcontainers ; démarrage refusé si le secret des tickets est trop court ; seed et schéma embarqués surveillés par un test de dérive.

## 5. Constats

Gravité : **Critique** (la démo ne marche pas), **Haute** (faille ou fonction demandée absente), **Moyenne**, **Faible**. Les numéros de ligne sont ceux du 21/10.

### 5.1 La chaîne temps réel (à corriger en premier, lot R1)

| ID | Gravité | Constat et preuve | Correctif |
|---|---|---|---|
| C-01 | **Critique** | **Le backend ne peut appeler aucune route du serveur temps réel.** `java.net.http.HttpClient` tente par défaut HTTP/2 en clair (en-têtes `Upgrade: h2c`) ; le serveur Node, qui écoute l'évènement `upgrade`, détruit toute connexion dont le chemin n'est pas `/` (`realtime/src/index.js:149-155`). Preuve : le client par défaut échoue en GET comme en POST (`HTTP/1.1 header parser received no bytes`), le même appel en HTTP/1.1 répond 200 ou 204. Effet : `GET /snapshot`, `POST /versions` et `POST …/restore` répondent 500. | **Corrigé le 21/10** : HTTP/1.1 forcé ; Node répond 400 net à toute montée de protocole autre que WebSocket. Prévu à l'audit : `.version(HttpClient.Version.HTTP_1_1)` dans [RealtimeSnapshotClient.java:25](../backend/src/main/java/com/lonkoo/backend/realtime/RealtimeSnapshotClient.java#L25) ; côté Node, ne traiter dans `upgrade` que les demandes WebSocket et laisser passer les autres |
| C-02 | **Haute** | **Les routes internes du serveur temps réel n'exigent aucun jeton**, contrairement au § 7.2 du plan. Preuve : sans en-tête, `GET …/snapshot` répond 200 et un `POST …/restore` anonyme répond 204 et **vide le canvas**. Seuls protègent le réseau interne et le 404 de Caddy sur `/internal/*`. | **Corrigé le 21/10** : jeton exigé par Node (comparaison à temps constant) et présenté par le backend ; tests des deux côtés. Prévu à l'audit : Même `REALTIME_SERVICE_TOKEN` dans les deux sens : Node vérifie `Authorization: Bearer` (comparaison à temps constant), `RealtimeSnapshotClient` l'envoie ; tests des deux côtés |
| C-03 | **Critique** | **Le WebSocket ne peut pas se connecter derrière Caddy.** Caddy envoie `/ws…` à `realtime:1234` sans retirer le préfixe ([Caddyfile:21](../infra/Caddyfile#L21), `handle /ws*`) ; le serveur n'accepte l'upgrade que sur `/` (`index.js:152`). Preuve : un client sur `ws://…/ws` expire (`TIMEOUT_NO_SYNC`), sur `/` il se synchronise. | **Corrigé le 21/10** : `handle_path /ws*` dans le Caddyfile, et le serveur accepte aussi `/ws` ; reste à vérifier sur le VPS. Prévu à l'audit : Caddy : `handle_path /ws*` (retire le préfixe) ; vérifier sur le VPS |
| C-04 | **Critique** | **Le format Yjs du codec n'est pas celui du contrat.** [schema-canvas.md:44](schema-canvas.md#L44) impose des `Y.Map` indexées par `id` ; [canvasCodec.js:61](../realtime/src/canvasCodec.js#L61) et `:91` écrivent et lisent des `Y.Array`. Preuve : pour un document construit comme le contrat le décrit, `yjsToSnapshot` renvoie `"nodes": {"n1": …}` (un objet) que le schéma refuse ; toute version prise depuis un front conforme au contrat échoue. | **Corrigé le 21/10** : codec au format du contrat, précisions ajoutées à `schema-canvas.md` (à relire par Fall, Ngom et Gaye), migration des anciens états. Prévu à l'audit : Décision D11 (§ 6.4) : suivre le contrat, le front n'étant pas encore écrit ; le codec lit les cartes et émet des tableaux triés par `id` ; tests croisés avec un client qui écrit selon le contrat ; prévenir Fall aujourd'hui |
| C-05 | **Haute** | **Un instantané invalide donne 500 au lieu de 422.** `InvalidCanvasException` porte `@ResponseStatus` ([ligne 9](../backend/src/main/java/com/lonkoo/backend/canvas/InvalidCanvasException.java#L9)) mais le gestionnaire générique ajouté le 20/10 ([ApiExceptionHandler.java:24](../backend/src/main/java/com/lonkoo/backend/web/ApiExceptionHandler.java#L24), `@ExceptionHandler(Exception.class)`) l'intercepte et répond « Erreur interne ». Preuve : un bloc nommé `class` fait répondre 500 à `POST /versions`. | **Corrigé le 21/10** : 422 `problem+json` avec la propriété `errors`. Prévu à l'audit : Faire étendre `ErrorResponseException` (statut 422), comme les autres exceptions de l'application |
| C-06 | Moyenne | Temps réel arrêté ou lent : 500 « Erreur interne » (`IllegalStateException`) au lieu d'une réponse explicite. | **Corrigé le 21/10** : 503 (injoignable), 504 (trop lent), 502 (réponse inattendue). Prévu à l'audit : `UpstreamUnavailableException` (503) et délai dépassé (504), message exploitable par le front |

### 5.2 Sécurité et dépendances

| ID | Gravité | Constat | Correctif |
|---|---|---|---|
| S-01 | **Haute** | **Backend : Tomcat 11.0.24 et Jackson 3.1.5 ont des avis connus (OSV.dev, 10 au total).** Tomcat : trois avis critiques (GHSA-9xv2-5v5q-p794, GHSA-gcx9-497g-6cp6, GHSA-h3x4-894j-xpx5 ; authentification DIGEST et FORM, contrôle d'accès : fonctions que l'application n'utilise pas, à corriger quand même). Jackson : sept avis dont cinq hauts, surtout du déni de service (GHSA-cxp5-3px4-pw24, GHSA-q4xh-88c3-wmh7, GHSA-wv8q-qhhj-9h54, GHSA-7hhh-6rmp-j9qf, GHSA-p6pp-m3f8-5c89). Spring Boot 4.1.1 est la dernière version publiée. | **Corrigé le 21/10** : `tomcat.version` 11.0.25 et `jackson-bom.version` 3.1.7 dans `pom.xml` ; OSV.dev ne signale plus rien. Prévu à l'audit : Propriétés du parent : `<tomcat.version>11.0.25</tomcat.version>` et `<jackson-bom.version>3.1.7</jackson-bom.version>` (versions présentes sur Maven Central) ; relancer les tests |
| S-02 | **Haute** | **Temps réel : `ws` 8.18.3** a deux avis hauts (GHSA-58qx-3vcg-4xpx, divulgation de mémoire non initialisée ; GHSA-96hv-2xvq-fx4p, épuisement mémoire par petits fragments), sur un serveur exposé via `/ws`. | **Corrigé le 21/10** : `ws` 8.22.0, `npm audit` à 0. Prévu à l'audit : `ws` 8.22.0 dans [package.json:18](../realtime/package.json#L18) ; relancer `npm test` |
| S-03 | Moyenne | Aucune limite de taille côté temps réel : `ws` accepte 100 Mio par message par défaut (`new WebSocketServer({ noServer: true })`, `index.js:147`) ; `readJsonBody` lit sans plafond ; aucune limite de connexions par utilisateur. | **Corrigé le 21/10** : `maxPayload` de 2 Mio (fermeture 1009 au-delà), corps HTTP interne limité (413), réglable par `REALTIME_MAX_MESSAGE_BYTES` ; la limite de corps de Caddy reste à poser (R7). Prévu à l'audit : `maxPayload` (1 Mio), plafond de `readJsonBody`, `request_body { max_size }` dans Caddy |
| S-04 | Moyenne | Les droits ne sont vérifiés qu'à la connexion : un membre retiré ou un lien expiré garde sa socket ouverte (ticket vérifié une seule fois). | Route interne « fermer les connexions du canvas » appelée à la suppression d'un projet ou d'un membre ; au minimum, l'écrire dans la soumission |
| S-05 | Moyenne | Le cookie de session n'est `Secure` qu'en profil `prod` (`application-prod.properties`), or aucun compose ne positionne `SPRING_PROFILES_ACTIVE=prod` (il n'y a pas encore de compose de production) et le refus de démarrer avec des valeurs `change-me` (WP2) n'est pas fait. | **Corrigé le 21/10** : `ConfigurationCheck` refuse le démarrage en profil `prod` (valeurs d'exemple, secret de service de moins de 16 caractères, mot de passe de base vide, adresse non `https`) et signale seulement ailleurs ; `SPRING_PROFILES_ACTIVE` documenté. Reste à positionner `prod` dans le compose (R7). Prévu à l'audit : Compose de production + contrôle au démarrage en `prod` (secrets `change-me`, `APP_PUBLIC_URL` en `https`) + test |
| S-06 | Moyenne | Aucune limite d'usage : nombre de projets, de canvas et de versions par utilisateur (une version peut peser plusieurs centaines de Ko) ; les invités ne sont pas plus restreints que les comptes GitHub. | R10 |
| S-07 | Faible | Le jeton de partage est dans le chemin `/join/{token}` : ne jamais activer les journaux d'accès de Caddy sur ce chemin. | Le noter dans `DEPLOIEMENT.md` |
| S-08 | **Haute** | **Un seul client pouvait faire tomber le serveur temps réel**, sans même être authentifié : les WebSocket n'avaient aucun écouteur d'erreur, or `ws` émet `error` sur une trame invalide ou un message trop gros, et sans écouteur l'exception arrête le processus (donc tous les canvas). Trouvé en testant `maxPayload` pendant R2. | **Corrigé le 21/10** : écouteur d'erreur dans `realtime/src/index.js` ; un message de 4 Kio au-delà d'une limite de 1 Kio ferme la connexion (1009) et le serveur répond encore ensuite (test). |

### 5.3 Qualité, données, exploitation

| ID | Gravité | Constat | Correctif |
|---|---|---|---|
| Q-01 | **Haute** | **Trous de tests.** Aucun test pour les versions (création, liste, détail, restauration, 422), l'instantané, `RealtimeSnapshotClient`, la matrice de rôles (`READ` et `TRIAGE` refusés en écriture, non-membre en 404), la suppression de projet, le lien expiré. Côté Node : ni lecture seule, ni routes d'instantané et de restauration, ni rechargement depuis la base (tous vérifiés à la main pendant l'audit). **Aucun test ne traverse les deux processus**, d'où C-01 à C-04 passés inaperçus. | R1 (test de chaîne) et R5 |
| Q-02 | Moyenne | `CanvasValidator` n'applique qu'une partie de `schema-canvas.md` ([lignes 46-78](../backend/src/main/java/com/lonkoo/backend/canvas/CanvasValidator.java#L46)) : manquent l'unicité des `name` de blocs, d'entités (par base) et de champs (par entité), et les mots réservés pour entités, champs, pages, topics et gabarits ; le seed n'est validé au démarrage que par le schéma. | R5 |
| Q-03 | Moyenne | Index manquants : `project_members(user_id)` (liste des projets), `canvases(project_id)`, `share_links(canvas_id)`, `audit_log(target)`. | Migration `V3` (R6) |
| Q-04 | Moyenne | `CanvasVersionService.create` et `restore` sont `@Transactional` autour d'un appel HTTP pouvant durer 10 s : une connexion JDBC reste prise pendant l'attente. `CanvasVersionController.detail` relit **toute** la liste des versions pour en trouver une ([ligne 63](../backend/src/main/java/com/lonkoo/backend/canvas/CanvasVersionController.java#L63)). Pas de plafond de versions, pas de validation de l'instantané à la restauration. | R6 |
| Q-05 | Moyenne | `ShareLinkService.join` lit puis insère ([ligne 115](../backend/src/main/java/com/lonkoo/backend/project/ShareLinkService.java#L115)) : deux requêtes simultanées du même utilisateur donnent une violation de clé primaire (500). | `insert … on conflict do update` |
| Q-06 | Moyenne | Serveur temps réel : pas de gestion de `SIGTERM` (jusqu'à 3 s d'édition perdues à l'arrêt d'un conteneur : risque n° 8 du plan initial), pas de route de santé, aucune nouvelle tentative si `PUT …/state` échoue (simple `console.error`), `y-protocols` importé par les tests sans être déclaré, `engines` demande Node 24 (le poste a Node 22). | R6 |
| Q-07 | Faible | Un client en lecture seule modifie son document **localement** (9 blocs chez lui, 8 sur le serveur) : le front doit désactiver l'édition selon le `role` du ticket. | R9 |

### 5.4 Contrats, documentation, dépôt

| ID | Gravité | Constat | Correctif |
|---|---|---|---|
| D-01 | **Haute** | **Aucun commit.** `backend/`, `realtime/`, `docs/openapi.yaml`, `.env.example` et `docs/LICENCES-TIERCES.md` sont hors de git : la branche `backend` publiée ne contient que le front et le plan. Une perte de poste emporte le travail, et l'équipe ne peut rien relire. | **Corrigé le 21/10** : six commits locaux (§ 7.1), non poussés. Prévu à l'audit : R3 : commits par tranche (§ 7), poussés après relecture |
| D-02 | Moyenne | `docs/openapi.yaml` : cinq routes codées sont encore marquées `x-implemented: false` (instantané et quatre routes de versions) ; le schéma `CanvasVersion` exige `canvasId` et `snapshot` alors que la création et la liste renvoient un résumé sans eux (`authorId` peut être nul) ; les réponses 422 et 503 sont absentes ; la CI ne valide pas le fichier. | **Corrigé le 21/10** : routes de versions et d'instantané en implémentées, schémas `CanvasVersionSummary` (liste, création) et `CanvasVersionDetail`, réponses 422 (avec `errors`), 502, 503 et 504 ; le fichier est validé en CI (`openapi-spec-validator`). Prévu à l'audit : R3 |
| D-03 | Moyenne | `.env.example` : manquent `REALTIME_INTERNAL_URL` (lue par le backend), `SPRING_PROFILES_ACTIVE`, `GUEST_TTL_HOURS` (la propriété `lonkoo.guest-ttl-hours` n'est reliée à aucune variable) ; `BACKEND_INTERNAL_URL` sert au proxy du front (`localhost:8080`) et au serveur temps réel (`backend:8080` en conteneur) : deux valeurs pour un même nom ; les `GITHUB_OAUTH_*` ne sont lues par rien. | **Corrigé le 21/10** : `REALTIME_INTERNAL_URL`, `SPRING_PROFILES_ACTIVE`, `GUEST_TTL_HOURS` (relié à `lonkoo.guest-ttl-hours`), `GUEST_RATE_LIMIT_PER_HOUR` et les réglages du temps réel ajoutés ; les deux valeurs de `BACKEND_INTERNAL_URL` sont expliquées. Prévu à l'audit : R2 |
| D-04 | Moyenne | `docs/LICENCES-TIERCES.md` ignore les composants du temps réel (Hocuspocus 4.7.1, jose 6.2.13, ws, yjs 13.6.33 et leurs dépendances) ; Dependabot ne surveille ni `/backend` ni `/realtime` ; le contrôle de licences Maven de la CI reste informatif ; la CI ne construit aucune image Docker. | **Corrigé le 21/10** : Dependabot (Maven, npm du temps réel, Docker), composants du temps réel dans `LICENCES-TIERCES.md`, jobs CI « Image Docker » (construction, et démarrage de l'image du temps réel) et « Avis de sécurité » (informatif, `scripts/check_osv_maven.py`). Licences Maven bloquantes dans la CI depuis R3 (`scripts/check_licenses_maven.py`, une exception documentée : `jakarta.annotation-api`). Prévu à l'audit : R2 |
| D-05 | Faible | `docs/ROADMAP-BACKEND.md` : « point de situation » périmé ; `backend/HELP.md` (généré par Spring Initializr) et les `.gitkeep` de `backend/` et `realtime/` à supprimer. | **Corrigé le 21/10** : `HELP.md` et les `.gitkeep` supprimés, « point de situation » de `ROADMAP-BACKEND.md` mis à jour. Prévu à l'audit : R3 |

## 6. Feuille de route du reste à faire

Durées en heures de travail focalisé avec assistance IA, marge de 30 % non comprise. Ce qui est tout en haut passe avant ce qui est en dessous, sauf indication.

### 6.1 Principes

1. **Réparer avant d'ajouter.** Tant que C-01 à C-04 ne sont pas corrigés, WP7 est inutilisable et le front ne peut pas être branché : R1 passe avant WP4b.
2. **Un test qui traverse les deux processus** (backend Spring et serveur Node réels) est livré avec R1 : c'est lui qui aurait détecté C-01 à C-04.
3. **Commits locaux tout de suite, pousser après relecture** (R3).
4. **Déployable à tout moment** (règle du plan initial) : une image qui ne se construit pas est un défaut, d'où le job `docker build` en CI (R2).

### 6.2 Plan jour par jour

| Jour | Pouye | Autres |
|---|---|---|
| **Mer 21/10** (aujourd'hui) | R1 (matin), R2, R3 (commits locaux), début de R4 | Fall : trancher D11 et D2 (1 h) puis session en `live` ; Gaye et Diagne : R7 (VPS, compose, Caddy) ; Gaye : début de R8 |
| **Jeu 22/10** | fin de R4, R5, R6, R10 | Fall : R9 ; Gaye : R7 (pipeline) puis R8 ; Diagne : tests de fumée |
| **Ven 23/10** (gel du périmètre) | correctifs, R11 avec Diagne : bout en bout, sauvegarde et restauration, licences, SBOM, démo de secours | tous : ce qui ne marche pas est coupé |
| **Sam 24/10** (matin) | déploiement final, soumission avant midi | |

Dépendances à lever aujourd'hui : création des deux applications OAuth GitHub (Pouye, bloque R4) ; état du VPS, du domaine et de Docker sur le serveur (Diagne, Gaye, bloque R7 et la condition de recevabilité « projet en ligne »).

### 6.3 Lots

#### R1 — Réparer la chaîne temps réel (Pouye, avec Fall pour D11 ; 4,5 h ; aujourd'hui, avant tout) — **fait le 21/10**

- [x] C-01 : client HTTP/1.1 dans `RealtimeSnapshotClient` ; `upgrade` de Node limité aux WebSocket.
- [x] C-02 : jeton de service dans les deux sens (`Authorization: Bearer`), tests Java et Node.
- [x] C-03 : `handle_path /ws*` dans `infra/Caddyfile`.
- [x] C-04 / D11 : codec en `Y.Map` indexées par `id` (nœuds, liens, `meta`), instantané trié par `id` ; tests unitaires Node et test croisé avec un client qui écrit selon `schema-canvas.md` ; message à Fall avec la structure exacte.
- [x] C-05 et C-06 : `InvalidCanvasException` en 422 `problem+json` avec le détail des erreurs ; erreurs du temps réel en 503 ou 504.
- [x] **Test de chaîne permanent** (environ 150 lignes, classe Java démarrant Spring sur PostgreSQL embarqué et `node realtime/src/index.js`, ignoré si `node` est absent ; en CI, ajouter `actions/setup-node` en version 24 et `npm ci` dans `realtime/` au job « Backend ») : deux clients synchronisés, instantané, version (201), redémarrage du serveur Node puis rechargement depuis la base, restauration vue en direct, lecture seule, version refusée (422) pour un nom réservé, temps réel arrêté (503).

**Preuve :** `./mvnw clean test` (63 tests, dont 7 de chaîne qui lancent le vrai serveur Node) et `npm test` dans `realtime/` (29 tests) verts ; chaque correctif a été vérifié en le retirant (le test échoue, par exemple 500 au lieu de 422). La CI du backend installe maintenant Node 24 et les dépendances de `realtime/` pour ce test.

#### R2 — Dépendances et durcissement immédiat (Pouye ; 2 h) — **fait le 21/10**

- [x] S-01 : `tomcat.version` 11.0.25 et `jackson-bom.version` 3.1.7 dans `pom.xml`.
- [x] S-02 : `ws` 8.22.0 ; S-03 : `maxPayload`, plafond de `readJsonBody`.
- [x] S-05 : contrôle au démarrage en profil `prod` (secrets `change-me`, `APP_PUBLIC_URL` en `https`) avec test ; `SPRING_PROFILES_ACTIVE` dans `.env.example`.
- [x] D-03 : `.env.example` complété (`REALTIME_INTERNAL_URL`, `GUEST_TTL_HOURS` relié à `lonkoo.guest-ttl-hours`, deux `BACKEND_INTERNAL_URL` distincts documentés).
- [x] D-04 : Dependabot pour `/backend` (Maven) et `/realtime` (npm) ; composants du temps réel dans `LICENCES-TIERCES.md` ; jobs CI `docker build backend` et `docker build realtime` (les exécuteurs GitHub ont Docker) ; contrôle OSV ou `npm audit` informatif en CI.

**Preuve :** `./mvnw clean test` (71 tests) et `npm test` dans `realtime/` (31 tests) verts après la montée de versions ; `scripts/check_osv_maven.py` donne 1 sur l'ancienne liste de dépendances (10 avis) et 0 sur la nouvelle ; `npm audit --omit=dev` : 0. Les jobs « Image Docker » ne se verront qu'au premier push (Docker est absent du poste) : à surveiller.

#### R3 — Mettre le travail à l'abri (Pouye ; 1,5 h) — **fait le 21/10**

- [x] Commits locaux par tranche (§ 7) **sans pousser** ; pousser après relecture ; pull request vers `main` selon le flux du plan (§ 4), si possible plusieurs de moins de 300 lignes.
- [x] D-02 : `openapi.yaml` aligné sur le code (routes de versions et d'instantané en implémentées, schémas résumé et détail, 422 et 503) ; validation du fichier dans le job « Contrat du canvas » (`openapi-spec-validator`).
- [x] D-05 : supprimer `HELP.md` et les `.gitkeep` devenus inutiles ; mettre à jour le « point de situation » de `ROADMAP-BACKEND.md`.

**Preuve :** `git log` montre les six commits ; `git status` ne laisse que le PDF du cahier des charges, volontairement non suivi ; `openapi-spec-validator` et Redocly valident `docs/openapi.yaml` ; `scripts/check_licenses_maven.py` passe sur les 97 dépendances et refuse un POM GPL seul (essai sur un dépôt Maven factice). La CI n'a pas encore tourné : rien n'est poussé.

#### R4 — Connexion GitHub, WP4b (Pouye ; 3,5 h) — **code et tests faits le 21/10, essai réel en attente**

Pré-requis humain, seulement pour l'essai dans un vrai navigateur : l'application OAuth de développement et ses secrets, pas à pas dans [GITHUB-OAUTH.md](GITHUB-OAUTH.md). L'application de production attend l'étape de déploiement.

- [x] `GET /api/auth/github/login` (`state` aléatoire de 32 octets gardé en session, redirection vers GitHub avec `read:user public_repo`, adresse de retour issue de la configuration) et `GET /api/auth/github/callback` (état à usage unique vérifié en temps constant, échange du code, lecture du profil, compte créé ou mis à jour par `github_id`, session neuve, redirection vers `APP_PUBLIC_URL/dashboard`).
- [x] Le jeton GitHub reste **dans la session uniquement**, exposé par `GithubSession.token()` pour R8 ; un test parcourt toutes les tables et toutes les réponses : ni le jeton ni le secret de l'application n'y sont.
- [x] Un invité qui se connecte **rattache** son compte : ses projets, ses appartenances (rôle le plus élevé gardé), les auteurs de ses versions et ses liens de partage passent au compte GitHub, puis la ligne d'invité est supprimée, en une transaction, que le compte GitHub existe déjà ou non. Le brouillon initial perdait les projets de l'invité quand le compte existait déjà.
- [x] Erreurs en `problem+json` : 400 (état faux, absent ou rejoué, code manquant, invalide ou expiré), 502 (GitHub en erreur, réponse illisible, application OAuth refusée), 503 (GitHub injoignable, ou application non configurée : les routes répondent 503 au lieu d'envoyer vers GitHub avec `change-me`), 504 (GitHub trop lent). Les appels à GitHub se font hors de toute transaction.
- [x] Refus de l'utilisateur : redirection vers `APP_PUBLIC_URL/login?error=github`, sans session, et l'état abandonné n'est plus valable.
- [x] Audit `login.github` et `guest.merged` ; `ConfigurationCheck` refuse en profil `prod` les valeurs d'exemple des trois variables GitHub et une adresse de retour qui n'est pas en `https`.
- [x] Contrat d'API (`openapi.yaml`) et `.env.example` à jour.
- [ ] **Essai réel** : créer l'application OAuth de développement, remplir le `.env`, lancer le front en `NEXT_PUBLIC_API_MODE=live` et se connecter pour de vrai.
- [ ] **Front (Fall)** : la page de connexion ne lit pas encore `?error=github` ; elle devrait afficher « connexion GitHub refusée » dans ce cas.

**Preuve :** 14 tests contre un faux GitHub (`GithubOAuthIntegrationTest`), 8 tests du client (`GithubApiClientTest`), 2 sur l'application non configurée, 2 sur `ConfigurationCheck` ; le retrait de la fusion des comptes fait échouer 2 tests. L'essai avec le vrai GitHub reste à faire.

#### R5 — Tests, validateur, contrôles d'accès (Pouye ; 3,5 h)

- [ ] Q-01 : tests des versions (création, liste, détail, restauration, 404 sur la version d'un autre canvas) ; **matrice de rôles** : pour chaque route, « non connecté », « autre utilisateur » (404) et « mauvais rôle » (403) avec `READ`, `TRIAGE`, `WRITE`, `MAINTAINER`, `OWNER` ; suppression de projet ; lien expiré ; jonction idempotente.
- [ ] Tests Node : lecture seule, routes d'instantané et de restauration, rechargement depuis un état enregistré, jeton de service.
- [ ] Q-02 : `CanvasValidator` complet (unicité des `name` de blocs, d'entités par base, de champs par entité ; mots réservés pour tous les identifiants ; liste étendue) ; utilisé aussi pour le seed au démarrage ; tests avec l'exemple et des cas invalides.
- [ ] Q-05 : jonction concurrente (`on conflict`).

**Preuve :** chaque route a ses trois tests d'accès (critère de WP9) ; `./mvnw verify` vert.

#### R6 — Robustesse des données et du temps réel (Pouye ; 3 h)

- [ ] Q-03 : migration `V3__index.sql`.
- [ ] Q-04 : appels HTTP hors transaction ; requête unique pour le détail d'une version ; plafond de versions par canvas (D14) ; validation de l'instantané à la restauration.
- [ ] Q-06 : arrêt propre de Node (`SIGTERM` : enregistrer les documents ouverts puis fermer), route `GET /health`, nouvelle tentative avec attente croissante si `PUT …/state` échoue, `y-protocols` déclaré, `engines` aligné.
- [ ] S-04 : route interne de fermeture des connexions d'un canvas, appelée à la suppression d'un projet.
- [ ] `server.shutdown=graceful` côté Spring ; options JVM adaptées à un conteneur (`-XX:MaxRAMPercentage`).

**Preuve :** `docker stop realtime` pendant une édition ne perd rien (testé) ; les index apparaissent dans `\d` sur une base neuve.

#### R7 — Mise en ligne, WP11 (Gaye et Diagne ; Pouye relit ; 7 h ; mercredi et jeudi)

État à confirmer : VPS acheté, domaine, Docker autorisé, réponse de l'organisateur. Sans cela, la condition de recevabilité « projet en ligne » n'est pas remplie.

- [ ] `frontend/Dockerfile` (`output: "standalone"`, sans dossier `public/`, polices téléchargées au build).
- [ ] `infra/docker-compose.prod.yml` : Caddy, frontend, backend (`SPRING_PROFILES_ACTIVE=prod`), realtime, PostgreSQL (sans port publié, volume nommé, `healthcheck`, `restart: unless-stopped`) ; santé du backend sur `/api/actuator/health`, du temps réel sur `/health` (R6) ; `BACKEND_INTERNAL_URL` propre à chaque service.
- [ ] `infra/Caddyfile` : C-03, `request_body { max_size }` sur `/api`, pas de journal d'accès sur `/api/join/*` (S-07).
- [ ] Pipeline A (`DEPLOIEMENT.md`, étape 3) avec vérification de `https://<domaine>/api/actuator/health`.
- [ ] Sauvegarde `pg_dump` quotidienne et **restauration testée**.

**Preuve :** une fusion dans `main` met en ligne la version suivante sans intervention ; un navigateur sans session atteint le modèle d'exemple en moins de 30 secondes.

#### R8 — Génération, envoi sur GitHub, déploiement, WP8 (Gaye ; environ 12 h ; non commencé)

Fondations fournies par le backend : instantané validé (WP7), jeton GitHub de session (R4), `audit_log`, contrôles d'accès, migrations `V10` à `V19`. Détail des pièges dans `ROADMAP-BACKEND.md` § WP8.

- [ ] Génération asynchrone (`202`) par gabarits fixes, seuls les `ident` validés dans le code ; tests sur `marketplace-mobile`.
- [ ] Envoi sur GitHub : dépôt public, `auto_init`, un seul commit par l'API Git.
- [ ] Déploiement par SSH et `docker compose` ; **plan B** : l'interface affiche les commandes (voir § 6.6).

**Preuve :** l'exemple produit un dépôt GitHub qui démarre avec `docker compose up`.

#### R9 — Branchement du front, WP12 (Fall avec Pouye ; environ 7 h ; non commencé)

- [ ] `NEXT_PUBLIC_API_MODE=live` (au build, dans `frontend/.env.local`) ; remplacer `workspace.tsx` par `GET/POST/PATCH /projects`.
- [ ] Canvas : `HocuspocusProvider` et Yjs **selon D11**, ticket via `POST …/realtime-ticket` (renouvelé à la reconnexion), curseurs.
- [ ] **Mode lecture seule selon le `role` du ticket** (Q-07) : édition désactivée pour `READ` et `TRIAGE`.
- [ ] Versions : créer, lister, restaurer, export par `GET …/snapshot` ; page de jonction `/join/[token]`.
- [ ] Gestion des `401` (retour à la connexion), `422` (détail des erreurs du validateur) et `503` (« temps réel indisponible »).

**Preuve :** deux navigateurs éditent le même canvas via un lien de partage, avec curseurs ; une version est enregistrée puis restaurée.

#### R10 — Limites d'usage (Pouye avec Diagne ; 2 h)

- [ ] S-06 : plafonds par utilisateur (D14), plus bas pour les invités ; plafonds de taille (corps, état Yjs, instantané) ; tests de dépassement.

#### R11 — Gel, bout en bout, conformité, WP10 (Diagne avec Pouye ; 4,5 h ; vendredi)

- [ ] Trois tests de fumée et un test de bout en bout Playwright sur l'adresse de production.
- [ ] SBOM Maven et npm (CycloneDX, Apache 2.0), audit des licences, `LICENCES-TIERCES.md` et `IA.md` à jour.
- [ ] Redémarrage du serveur puis parcours complet ; restauration d'une sauvegarde ; démo de secours enregistrée ; rotation des secrets, aucune valeur `change-me` en production.

#### R12 — Raccordement de l'agent IA, WP13 (Pouye ; 1,5 h ; optionnel, coupé en premier)

- [ ] `AiClient` factice et routes `POST /canvases/{id}/ai/sketch`, `/ai/audit`, `/ai/complete` répondant 501. **L'agent lui-même n'entre pas dans cette feuille de route.**

### 6.4 Décisions à prendre

| # | Sujet | Recommandation | Qui | Avant |
|---|---|---|---|---|
| D11 | Représentation Yjs du canvas | suivre `schema-canvas.md` (`Y.Map` par `id`), adapter le codec ; coût faible tant que le front n'écrit rien | Pouye, Fall | tranchée et appliquée le 21/10 (à relire par Fall) |
| D2 | Modèle de blocs du front (12 formes) contre le contrat (8 types) | toujours ouverte ; **bloque** le front et le générateur ; voir `ROADMAP-BACKEND.md` § 11 | Fall, Pouye, Gaye | aujourd'hui |
| D12 | Chemin du WebSocket | `handle_path /ws*` dans Caddy ; le serveur accepte `/` et `/ws` | Pouye, Gaye | fait le 21/10 |
| D13 | Authentification backend vers temps réel | même jeton de service dans les deux sens | Pouye | fait le 21/10 |
| D14 | Plafonds d'usage | 50 versions par canvas, 20 projets par invité, 10 canvas par projet, 2 Mio par message WebSocket et par corps JSON (appliqué côté temps réel) | Pouye, Diagne | jeudi |
| D15 | Correctifs de dépendances | propriétés du parent Spring Boot en attendant une version 4.1.x corrigée | Pouye | fait le 21/10 |

### 6.5 Risques

| # | Risque | Probabilité / impact | Parade |
|---|---|---|---|
| 1 | Rien n'est en ligne ; état du VPS inconnu | élevée / critique | R7 en parallèle de R1, vérifier aujourd'hui |
| 2 | WP8 (génération, envoi GitHub, déploiement) non commencé, 12 h pour 2 jours | élevée / élevé | commencer aujourd'hui, plan B du déploiement décidé ce soir |
| 3 | Front non branché, D2 ouverte | élevée / élevé | D11 et D2 tranchées avant midi, R9 jeudi |
| 4 | Les images Docker n'ont jamais été construites | moyenne / élevé | jobs `docker build` en CI (R2) dès le premier push |
| 5 | Applications OAuth GitHub non créées | moyenne / élevé | à créer aujourd'hui (Pouye) |
| 6 | Travail non commité | moyenne / critique | R3 en premier de l'après-midi |
| 7 | Comportement de Caddy non vérifié (chemin `/ws`, limite de corps, redirection TLS) | moyenne / moyen | tester sur le VPS dès le squelette en ligne |
| 8 | Avis connus sur les dépendances | certaine / moyen | R2 |

### 6.6 Ordre de coupe (mis à jour)

À abandonner dans cet ordre si le calendrier glisse :

1. R12 (raccordement IA) et API de membres et de rôles fins.
2. Comparaison visuelle de deux versions.
3. Limites d'usage détaillées de R10 (garder les plafonds de taille et de versions).
4. Déploiement des applications générées de R8 : garder la génération et l'envoi sur GitHub, afficher les commandes.
5. S-04 (fermeture des connexions révoquées) : le documenter dans la soumission.

**À ne jamais couper :** R1, R2 (dépendances), R3 (commits), R7 (mise en ligne), le contrôle d'accès, l'absence de secrets dans les journaux, la sauvegarde et le redémarrage testés.

## 7. Annexe

### 7.1 Commits réalisés pour R3 (locaux, non poussés)

1. `chore(backend): squelette Spring Boot` : `pom.xml`, wrapper Maven, `Dockerfile`, profils, Log4j2, migrations `V1` et `V2`, classe principale.
2. `feat(backend): invité, session, projets, canvas, partage et temps réel côté API` : paquets `auth`, `project`, `security`, `model`, `web`, `support`, `realtime` (ticket, état interne), contrôle d'accès, seed, et leurs tests.
3. `feat(backend): versions nommées, validateur et client du serveur temps réel` : `CanvasVersion*`, `CanvasValidator`, `RealtimeSnapshotClient`, erreurs 422 et 502 à 504, et leurs tests.
4. `feat(realtime): serveur Hocuspocus` : tout `realtime/` (sauf `node_modules`), le test de chaîne du backend, le `Caddyfile` et la disposition Yjs précisée dans `schema-canvas.md`.
5. `ci: images Docker, avis de sécurité, licences Maven bloquantes, contrat d'API` : workflow, Dependabot, `scripts/check_osv_maven.py` et `scripts/check_licenses_maven.py`.
6. `docs: contrat d'API, audit et feuille de route du reste à faire, licences, variables d'environnement`.

### 7.2 Rejouer les vérifications

```bash
# Tests Java (le «clean» est nécessaire après un renommage de fichier de test)
cd backend && ./mvnw clean test

# Tests Node
cd realtime && npm test

# Licences npm du temps réel (même commande que la CI)
cd realtime && npx license-checker-rseidelsohn@5.0.1 --production --excludePrivatePackages \
  --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD;BlueOak-1.0.0;CC0-1.0;Unlicense;MIT-0;Python-2.0;CC-BY-4.0"

# Avis de sécurité du temps réel
cd realtime && npm audit --omit=dev

# Validation du contrat d'API
npx @redocly/cli@1.34.5 lint docs/openapi.yaml
```

Les avis sur les dépendances Maven ont été obtenus en interrogeant OSV.dev (`POST https://api.osv.dev/v1/querybatch`) avec la sortie de `./mvnw dependency:list -DincludeScope=runtime`.
