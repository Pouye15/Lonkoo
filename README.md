# Lonkoo

> Le studio où une équipe de développeurs conçoit ensemble l'architecture de son application, en temps réel, avec un copilote IA, puis la génère, la pousse sur GitHub et la déploie.

Projet réalisé pour le concours **CADev 2026** (Systalink), sur le thème « Construire la plateforme d'échange africaine, pour les devs, par les devs ».

## En bref

Lonkoo est un studio collaboratif où une équipe de développeurs conçoit l'architecture d'une application à plusieurs, en temps réel, avec un copilote IA qui propose et audite sans jamais décider à leur place. Une fois le modèle validé, la plateforme génère le projet de démarrage, le pousse sur GitHub et le déploie sur Systalink.

## Parcours utilisateur

1. Créer un canvas partagé et y inviter son équipe.
2. Concevoir l'architecture à plusieurs (curseurs, sélection et modifications en direct).
3. Demander de l'aide à l'IA (esquisse, complétion, audit).
4. Enregistrer une version nommée de l'architecture.
5. Générer le projet de démarrage et le pousser sur GitHub.
6. Déployer sur Systalink et ouvrir l'application en ligne.

## Architecture

Voir [docs/architecture.md](docs/architecture.md). Format du canvas : [docs/schema-canvas.md](docs/schema-canvas.md). Mise en ligne : [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md). Feuille de route du backend : [docs/ROADMAP-BACKEND.md](docs/ROADMAP-BACKEND.md).

## Structure du dépôt

| Dossier | Contenu |
|---|---|
| `frontend/` | Interface web (Next.js, React Flow) |
| `backend/` | API et logique métier (Spring Boot) |
| `realtime/` | Serveur de collaboration en temps réel (Hocuspocus, Yjs) |
| `infra/` | Docker Compose, scripts de déploiement |
| `docs/` | Architecture, contrat du canvas, déploiement, déclarations de conformité, backlog |

## Démarrer en local

Quatre services tournent en local : la base PostgreSQL (5432), le backend (8080), le serveur temps réel (1234) et l'interface (3000). Ouvrez un terminal par service, à la racine du dépôt.

**Prérequis :** Java 21 ou plus récent, Node.js 22 ou plus récent, Docker (pour PostgreSQL), Git. Les commandes ci-dessous valent pour Git Bash, macOS et Linux ; les différences pour PowerShell sont indiquées.

### 1. Configuration

```bash
cp .env.example .env
```

Les valeurs d'exemple suffisent pour tout faire, **sauf se connecter avec GitHub** (voir plus bas). Le fichier `.env` n'est jamais commité. Pour essayer sans être arrêté, vous pouvez y mettre `GUEST_RATE_LIMIT_PER_HOUR=1000` (par défaut, 20 invités par heure et par adresse).

### 2. Les services

**Base de données** (une seule fois, elle reste lancée) :

```bash
docker compose -f infra/docker-compose.dev.yml --env-file .env up -d
```

**Backend** : le profil `dev` fait lire le `.env` de la racine. Sans lui, le démarrage échoue (`'url' must start with "jdbc"`).

```bash
cd backend
./mvnw spring-boot:run "-Dspring-boot.run.profiles=dev"
```

PowerShell : `.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"`. Sur un poste Windows, ajoutez `"-Dspring-boot.run.jvmArguments=-Djavax.net.ssl.trustStoreType=Windows-ROOT"` : sans cela, le backend ne joint pas GitHub en HTTPS (503 « GitHub est injoignable », voir [docs/GITHUB-OAUTH.md](docs/GITHUB-OAUTH.md) § 4).

**Serveur temps réel** : `npm run dev` lit lui aussi le `.env` de la racine (`npm start`, lui, n'en lit aucun : c'est la commande des conteneurs).

```bash
cd realtime
npm ci
npm run dev
```

**Interface** : créez d'abord `frontend/.env.local` (ignoré par Git). Sans lui, l'interface est en **mode démonstration** : session et projets simulés dans le navigateur, aucun appel au backend.

```bash
cd frontend
printf 'NEXT_PUBLIC_API_MODE=live\nNEXT_PUBLIC_REALTIME_URL=ws://localhost:1234\n' > .env.local
npm ci
npm run dev
```

PowerShell : `Set-Content .env.local "NEXT_PUBLIC_API_MODE=live","NEXT_PUBLIC_REALTIME_URL=ws://localhost:1234"`. Utilisez bien `npm run dev` : le relais de `/api` vers le backend n'existe qu'en mode développement (avec `npm start`, `/api` répond 404).

Ouvrez <http://localhost:3000> et choisissez « Essayer sans compte ».

### 3. Vérifier

```bash
curl http://localhost:8080/api/actuator/health   # {"status":"UP"}
curl http://localhost:1234/health                # {"status":"UP"}
```

### 4. Se connecter avec GitHub (facultatif)

Sans cela, tout fonctionne en invité : canvas partagé en temps réel, versions, génération du projet et téléchargement de l'archive. La connexion GitHub est nécessaire pour **envoyer le projet généré sur GitHub** et le déployer.

Le secret de l'application OAuth n'est pas dans le dépôt. Chacun crée la sienne (5 minutes, pas à pas dans [docs/GITHUB-OAUTH.md](docs/GITHUB-OAUTH.md)) avec l'adresse de retour `http://localhost:3000/api/auth/github/callback`, puis renseigne `GITHUB_OAUTH_CLIENT_ID` et `GITHUB_OAUTH_CLIENT_SECRET` dans son `.env` et redémarre le backend. Tant que ces deux valeurs valent `change-me`, le bouton répond « La connexion GitHub n'est pas encore configurée ».

### 5. Tests

```bash
cd backend && ./mvnw test                   # PostgreSQL embarqué : Docker n'est pas nécessaire
cd frontend && npm test && npm run lint && npm run typecheck
cd realtime && npm test
```

### Si ça ne démarre pas

| Symptôme | Cause probable |
|---|---|
| Backend : `'url' must start with "jdbc"` | Profil `dev` oublié, ou `.env` absent à la racine |
| Backend : connexion refusée sur le port 5432 | La base n'est pas lancée (`docker compose … up -d`) |
| Temps réel : `REALTIME_SERVICE_TOKEN et REALTIME_TICKET_SECRET sont requis` | `npm start` au lieu de `npm run dev`, ou `.env` absent |
| Temps réel : `../.env: not found` | `.env` absent à la racine du dépôt |
| L'interface propose des projets simulés, sans erreur | `frontend/.env.local` absent : mode démonstration |
| `/api` répond 404 depuis l'interface | Interface lancée avec `npm start` au lieu de `npm run dev` |
| Trop de demandes (429) en essayant sans compte | Limite d'invités par adresse : relevez `GUEST_RATE_LIMIT_PER_HOUR` dans `.env` |
| GitHub injoignable (503) sur Windows | Réglage du certificat (voir l'étape Backend) |

## Équipe

| Nom | Rôle |
|---|---|
| Mouhamadoul Moustapha Diagne | Qualité, sécurité, démo |
| Mamadou Ismaila Fall | Interface et canvas |
| Gnatam Gaye | Génération et déploiement |
| Serine fallou Ngom | IA |
| Ibrahima Pouye | Backend et temps réel |

## Conformité au règlement CADev

- Composants tiers et licences : [docs/LICENCES-TIERCES.md](docs/LICENCES-TIERCES.md)
- Usage de l'intelligence artificielle : [docs/IA.md](docs/IA.md)
- Déclarations de soumission : [docs/DECLARATIONS-SOUMISSION.md](docs/DECLARATIONS-SOUMISSION.md)

## Licence

© 2026 VISION X. Tous droits réservés. Voir [LICENSE](LICENSE).
