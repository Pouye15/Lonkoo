# Consignes pour les assistants IA (et pour qui les utilise)

LONKOO : studio collaboratif d'architecture en temps réel (backend Spring Boot 4.1 et Java 21, serveur temps réel Node,
interface Next.js 16). Projet de l'équipe VISION X pour CADev 2026.

**Avant toute action, lis `docs/PASSATION-RESTE-A-FAIRE.md`** : l'état réel du projet, ce qui reste à faire avant la démo, les
règles et les pièges. L'état détaillé et les preuves sont dans `docs/AUDIT-ET-ROADMAP-BACKEND.md`.
**Si `docs/SUITE-PR3-POUR-FALLOU.md` existe, lis-le aussi** : il détaille la suite de la pull request n° 3 (agent IA), tâche par tâche.

Règles non négociables (détail : `CONTRIBUTING.md` et le § 0.3 du document de passation) :

- Ne pousse jamais, n'ouvre jamais de pull request sans l'accord explicite de la personne. Rien directement sur `main` ;
  fusion par « merge commit », jamais par « squash ».
- Aucun secret : n'affiche, ne copie et ne commite jamais un fichier `.env` ni une clé. Le hook gitleaks ne se contourne pas.
- Licences permissives seulement (MIT, Apache 2.0, BSD). Une dépendance nouvelle se déclare dans `docs/LICENCES-TIERCES.md`
  et se reporte dans le SBOM (`python3 scripts/make_sbom.py`).
- N'invente rien : ni date, ni chiffre, ni résultat de test. Dis ce qui n'a pas été essayé en vrai.
- Chaque changement a son test ; lance les contrôles du § 3.7 du document de passation avant de proposer une pull request.
- Le contrat du canvas (`docs/schema-canvas.md`, `docs/canvas.schema.json`) ne change que par pull request relue par
  l'interface, le backend, l'IA et la génération.
- Note tout usage d'IA dans `docs/IA.md` ; la personne doit pouvoir expliquer ce qu'elle pousse.
- Commentaires, messages d'erreur et documents en français ; identifiants de code en anglais.
- Interface : `frontend/CLAUDE.md` (règles de design) et `frontend/AGENTS.md` (version de Next.js).

Pièges de version : Spring Boot 4.1 (starters modulaires), Jackson 3 (`tools.jackson.*`), Next.js 16, React 19. Ne te fie pas à
ta mémoire : lis le code et la documentation du dépôt.
