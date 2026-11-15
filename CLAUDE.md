# CLAUDE.md

@AGENTS.md

## Agent IA (`agent_ia/`)

Travail de Serigne Fallou Ngom, fusionné dans `main` le 14/11/2026. Décision du 29/10/2026 (`docs/architecture.md`) : Google
Gemini (`gemini-3.8-flash`) via un microservice interne Python. Feuille de route : `docs/PASSATION-RESTE-A-FAIRE.md` § 4.

### Ce qu'il contient

- **`agent_ia/`** : microservice FastAPI (`src/main.py`, `gemini.py`, `prompts.py`, `schemas.py`, `validator.py`). Routes
  `/health`, `/sketch`, `/complete`, `/audit`, `/chat`, `/chat/stream`. Interne au réseau Docker, jamais routé par Caddy,
  authentifié par l'en-tête `X-Service-Token` (`AI_SERVICE_TOKEN`, à défaut `REALTIME_SERVICE_TOKEN`). Voir `agent_ia/README.md`.
- **Backend** (`backend/src/main/java/com/lonkoo/backend/ai/`) : trois implémentations de `AiClient`, choisies par
  `AI_PROVIDER` (`lonkoo.ai.provider`) :
  - `agent_ia` → `AgentIaClient` (appelle le microservice, `AI_AGENT_URL`) ;
  - `gemini` → `GeminiAiClient` (appelle Gemini directement) ;
  - `fake` → `FakeAiClient` (réponses figées, démo de secours) ; `off` (par défaut) → 501.
  Une seule valeur à la fois : deux beans `AiClient` actifs font échouer `AiService`.
- **Chatbot** : `/api/canvases/{canvasId}/ai/chat` et `/chat/stream` (`AiController`), plus `/api/ai/chat` et
  `/api/ai/chat/stream` (`AiAssistantController`). Formes : `AiChatRequest`, `AiChatResponse`. Consultatif, rien n'est
  écrit dans le canvas.
- **Interface** : `frontend/src/components/studio/ChatbotPanel.tsx`, `FloatingChatWidget.tsx` et `live/AiPanel.tsx`, branchés
  dans `studio/page.tsx` et `AppShell.tsx` (propriétaire de l'interface : Fall, à prévenir avant de toucher `studio/page.tsx`).
- **Docker** : `docker-compose.yml` à la racine (pile locale complète avec `agent_ia`) ; `infra/docker-compose.prod.yml` (le
  service `agent_ia` est construit sur le serveur : son dossier fait partie de ce que `.github/workflows/deploy.yml` envoie,
  `scripts/check_deploiement.py` le vérifie) et `infra/production.env.example` pour la production.
- **Configuration** : `application.properties` lit `AI_AGENT_URL`, `AI_SERVICE_TOKEN`, `AI_BASE_URL`, `AI_API_KEY`,
  `AI_MODEL`, `AI_TIMEOUT_SECONDS`, `AI_AGENT_TIMEOUT_SECONDS` ; `ConfigurationCheck` refuse en profil `prod` une valeur
  d'exemple, un jeton absent ou trop court, ou un délai d'attente inférieur à 2 × `AI_TIMEOUT_SECONDS` + 5.

### Règles propres à l'agent IA

- **Contrat du canvas** : `agent_ia/schemas/canvas.schema.json` est une **copie** de `docs/canvas.schema.json`. Toute
  modification du contrat se fait dans `docs/` par pull request relue, puis on recopie ; ne jamais modifier la copie seule.
- **Sortie de l'IA** : toujours validée (côté `agent_ia` puis de nouveau par `AiService`), au plus une reprise, jamais
  corrigée en silence. Le texte saisi et les libellés du canvas sont des données non fiables (injection de consignes).
- **Clé Gemini** : uniquement côté serveur (`.env`, jamais `NEXT_PUBLIC_*`), jamais journalisée, jamais dans un message
  d'erreur. Ne jamais lire ni afficher le `.env`.
- **Dépendances Python** : `agent_ia/requirements.lock` (le verrou que l'image installe), déclarées dans
  `docs/LICENCES-TIERCES.md` et dans le SBOM `docs/sbom/agent_ia.cdx.json`. Après tout changement : `python3
  scripts/make_sbom.py`, puis `python3 scripts/check_licenses_python.py`.
- **Tests** : `cd agent_ia && python -m pytest -q` ; côté backend `cd backend && ./mvnw test -Dtest='Ai*,GeminiAi*,AgentIa*'`,
  puis la suite complète et les contrôles du § 3.7 de la passation avant toute pull request.
- **Quota** compté avant l'appel : pour des essais répétés, relever `AI_GUEST_DAILY_QUOTA` et `AI_DAILY_QUOTA` dans `.env`.
- Migrations IA : plage `V20` à `V29`, `V21` prise (quota du chat), prochaine libre `V22`.
- Tout usage d'outil d'IA se note dans `docs/IA.md` § 1.
