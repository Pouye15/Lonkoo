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

Voir [docs/architecture.md].

## Structure du dépôt

| Dossier | Contenu |
|---|---|
| `frontend/` | Interface web (Next.js, React Flow) |
| `backend/` | API et logique métier (Spring Boot) |
| `realtime/` | Serveur de collaboration en temps réel (y-websocket) |
| `infra/` | Docker Compose, scripts de déploiement |
| `docs/` | Architecture, déclarations de conformité, backlog |

## Démarrer en local

À compléter au fur et à mesure que le code arrive.

Prérequis : Java 21, Node.js 20, Docker.

```bash
cp .env.example .env            # puis remplir les valeurs
docker compose -f infra/docker-compose.dev.yml up -d   # base PostgreSQL

# Backend
cd backend && ./mvnw spring-boot:run

# Frontend
cd frontend && npm ci && npm run dev

# Temps réel
cd realtime && npm ci && npm start
```

## Équipe

| Nom | Rôle |
|---|---|
| Mouhamadoul Moustapha Diagne |  Qualité, sécurité, démo |
| Mamadou Ismaila Fall | Interface et canvas |
| Gnatam Gaye | Génération et déploiement |
| Serine fallou Ngom | IA |
| Ibrahima Pouye | Backend et temps réel |

## Conformité au règlement CADev

- Composants tiers et licences : [docs/LICENCES-TIERCES.md]
- Usage de l'intelligence artificielle : [docs/IA.md]
- Déclarations de soumission : [docs/DECLARATIONS-SOUMISSION.md]

## Licence

© 2026 VISION X. Tous droits réservés. Voir [LICENSE].
