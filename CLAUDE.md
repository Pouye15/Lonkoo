# CLAUDE.md

@AGENTS.md

## Branche en cours : `ia_agent` (mission A, l'agent IA)

Travail de Serigne Fallou Ngom. Feuille de route de la mission : `docs/PASSATION-RESTE-A-FAIRE.md` § 4 (étapes `IA-1` à
`IA-9`). Décision prise le 29/10/2026 (`docs/architecture.md`) : Google Gemini (`gemini-3.8-flash`) via un microservice
interne Python.

### Ce que contient la branche

- **`agent_ia/`** : microservice FastAPI (`src/main.py`, `gemini.py`, `prompts.py`, `schemas.py`, `validator.py`). Routes
  `/health`, `/sketch`, `/complete`, `/audit`, `/chat`, `/chat/stream`. Interne au réseau Docker, jamais routé par Caddy,
  authentifié par l'en-tête `X-Service-Token` (`AI_SERVICE_TOKEN`). Voir `agent_ia/README.md`.
- **Backend** (`backend/src/main/java/com/lonkoo/backend/ai/`) : trois implémentations de `AiClient`, choisies par
  `AI_PROVIDER` (`lonkoo.ai.provider`) :
  - `agent_ia` → `AgentIaClient` (appelle le microservice, `AI_AGENT_URL`) ;
  - `gemini` → `GeminiAiClient` (appelle Gemini directement) ;
  - `fake` → `FakeAiClient` (réponses figées, démo de secours) ; `off` → 501.
  Une seule valeur à la fois : deux beans `AiClient` actifs font échouer `AiService`.
- **Chatbot** : `/api/canvases/{canvasId}/ai/chat` et `/chat/stream` (`AiController`), plus `/api/ai/chat` et
  `/api/ai/chat/stream` (`AiAssistantController`). Formes : `AiChatRequest`, `AiChatResponse`. Consultatif, rien n'est
  écrit dans le canvas.
- **Interface** : `frontend/src/components/studio/ChatbotPanel.tsx`, `FloatingChatWidget.tsx`, branchés dans
  `studio/page.tsx` et `AppShell.tsx` (propriétaire de l'interface : Fall, à prévenir avant de toucher `studio/page.tsx`).
- **Docker** : `docker-compose.yml` à la racine (pile locale complète avec `agent_ia`) ; `infra/docker-compose.prod.yml`
  et `infra/production.env.example` pour la production.
- **Configuration** : `application.properties` lit `AI_AGENT_URL`, `AI_SERVICE_TOKEN`, `AI_BASE_URL`, `AI_API_KEY`,
  `AI_MODEL`, `AI_TIMEOUT_SECONDS` ; `ConfigurationCheck` refuse en profil `prod` les valeurs d'exemple.

### Règles propres à cette branche

- **Contrat du canvas** : `agent_ia/schemas/canvas.schema.json` est une **copie** de `docs/canvas.schema.json` (identique
  à ce jour). Toute modification du contrat se fait dans `docs/` par pull request relue, puis on recopie ; ne jamais
  modifier la copie seule.
- **Sortie de l'IA** : toujours validée (côté `agent_ia` puis de nouveau par `AiService`), au plus une reprise, jamais
  corrigée en silence. Le texte saisi et les libellés du canvas sont des données non fiables (injection de consignes).
- **Clé Gemini** : uniquement côté serveur (`.env`, jamais `NEXT_PUBLIC_*`), jamais journalisée, jamais dans un message
  d'erreur. Ne jamais lire ni afficher le `.env`.
- **Dépendances Python** (`agent_ia/requirements.txt` : fastapi, uvicorn, httpx, pydantic, jsonschema) : **pas encore
  déclarées** dans `docs/LICENCES-TIERCES.md` ni dans le SBOM. À faire avant la pull request (vérifier la licence de
  chacune, puis `python3 scripts/make_sbom.py`).
- **Tests** : `agent_ia/` n'a pas encore de tests. Côté backend : `cd backend && ./mvnw test -Dtest='Ai*,GeminiAi*'`, puis
  la suite complète et les contrôles du § 3.7 de la passation avant toute pull request.
- **Quota** compté avant l'appel : pour des essais répétés, relever `AI_GUEST_DAILY_QUOTA` et `AI_DAILY_QUOTA` dans `.env`.
- Migrations IA : plage `V20` à `V29`, prochaine libre `V21`.
- Tout usage d'outil d'IA sur cette branche se note dans `docs/IA.md` § 1.
