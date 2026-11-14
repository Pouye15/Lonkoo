# Usage de l'intelligence artificielle

Le règlement CADev (article 6) autorise l'IA librement, mais impose de déclarer à la soumission les outils utilisés et les parties du projet concernées. Le jury évalue aussi la maîtrise de l'équipe sur ces parties (annexe 1).

**Règle d'équipe :** notez chaque usage significatif ici, le jour même.

## 1. Outils d'IA utilisés pour développer le projet

| Date | Personne | Outil | Partie du projet | Nature de l'usage |
|---|---|---|---|---|
| 2026-10-16 | Ibrahima Pouye | Claude (Sonnet 5.5) | Analyse du cahier des charges, kit de démarrage du dépôt | Conseil, rédaction de fichiers de base |
| 2026-10-16 | Ibrahima Pouye | Claude Code (Sonnet 5.5) | Dépôt entier : audit, restructuration, CI, architecture, contrat du canvas, déploiement, devcontainer, backlog | Audit, rédaction et correction de fichiers de configuration, de scripts de contrôle et de documentation |
| 2026-10-20 | Ibrahima Pouye | Claude Code (Sonnet 5.5) | Import du front dans `frontend/`, compatibilité avec la CI (licences, lint), finitions du front, feuille de route du backend (`docs/ROADMAP-BACKEND.md`) | Génération de code (interface), de configuration et de documentation ; relecture |
| 2026-10-21 à 2026-10-24 | Ibrahima Pouye | Claude Code (Sonnet 5.5) | Backend (API, droits d'accès, versions, validation du canvas), serveur temps réel, base, CI et tests | Génération de code et de tests, correction des défauts relevés à l'audit du 21/10, relecture |
| 2026-10-21 à 2026-10-24 | Ibrahima Pouye | Claude Code (Sonnet 5.5) | Interface : branchement sur l'API (session, projets, canvas partagé, versions, équipe, page de déploiement) | Génération de code et de tests |
| 2026-10-22 à 2026-10-24 | Ibrahima Pouye | Claude Code (Sonnet 5.5) | Génération du projet, envoi sur GitHub, déploiement ; mise en ligne (compose de production, Caddy, pipeline, sauvegarde : dossier `infra/`) | Génération de code, de scripts et de tests ; répétition hors serveur |
| 2026-10-24 à 2026-10-25 | Ibrahima Pouye | Claude Code (Sonnet 5.5) | Audit du travail et correctifs (constats A-01 à A-11), équipe et liens de partage, projets publics, sessions en base, SBOM, parcours de bout en bout (`e2e/`), point de raccordement de l'IA (`backend/.../ai/`) | Génération de code et de tests ; tests de mutation ; relecture |
| 2026-10-24 à 2026-10-25 | Ibrahima Pouye | Claude Code (Sonnet 5.5) | Documentation : guide des actions humaines, guide de défense devant le jury, mise à jour des documents du dépôt | Rédaction |
| 2026-10-29 | Serigne Fallou Ngom | Google Antigravity | Module `agent_ia` (FastAPI Python), intégration Spring Boot `AgentIaClient`, chatbot d'architecture | Développement, intégration de Gemini 3.8 Flash, validation du contrat |
| 2026-11-04 | Serigne Fallou Ngom | Claude Code (Opus 5.5) | `CLAUDE.md` : section sur la branche `ia_agent` ; découpage des commits | Rédaction de documentation |
| 2026-11-14 | Serigne Fallou Ngom | Claude Code (Opus 5, avec trois sous-agents en parallèle) | Correction de la partie IA après audit : microservice `agent_ia` (instantané envoyé en JSON, sortie d'audit inexploitable refusée en 502, chiffres de repli supprimés, jeton de service obligatoire, CORS retiré, bornes d'entrée, délimiteurs de données non fiables, reprise rejouant la conversation, client HTTP partagé, suggestions produites par le modèle, 65 tests créés) ; backend (`AiSnapshots`, `AiResponses`, `AiUntrusted`, quota de chat séparé et migration `V21`, délai d'attente du microservice, `ConfigurationCheck` par fournisseur, garde sur `complete`, 14 tests de `AgentIaClient`, correction du chat en mode `gemini`) ; interface (`lib/ai.ts`, `lib/ai-api.ts`, `AiPanel.tsx` : erreurs lisibles, score et correctifs inventés supprimés, aperçu en différences avant acceptation, lecture du flux SSE par tampon) ; dépendances Python verrouillées, SBOM `agent_ia`, contrôle automatique des licences Python | Audit, génération de code, de tests et de documentation ; relecture |

## 2. IA intégrée au produit

| Fonction | Fournisseur et modèle | Déclenchement | Données envoyées | Garde-fous |
|---|---|---|---|---|
| Esquisse d'architecture (`POST /api/canvases/{id}/ai/sketch`) | Google Gemini (`gemini-3.8-flash`) via le microservice interne `agent_ia` (ou mode `fake` en démo) | Sur demande de l'utilisateur, avec le droit d'écrire sur le canvas | Le texte saisi (8000 caractères au plus), encadré par des délimiteurs de **données non fiables** | La proposition est validée contre le contrat du canvas (502 sinon) et jamais écrite sans acceptation ; au plus une reprise, jamais de correction silencieuse ; journal sans le texte saisi ; quota par jour : 30 par personne connectée avec GitHub, 5 par invité, 500 pour tout le service (429 au-delà) |
| Complétion d'architecture (`.../ai/complete`) | Google Gemini (`gemini-3.8-flash`) via `agent_ia` | Sur demande de l'utilisateur, avec le droit d'écrire | L'instantané **réduit** du canvas (`AiSnapshots.prune` : ni positions, ni décorations, ni champ hors contrat), les blocs sélectionnés, une consigne facultative | idem, et les blocs que la proposition ferait disparaître sont signalés (`warnings`) avant toute acceptation |
| Audit d'architecture (`.../ai/audit`) | Google Gemini (`gemini-3.8-flash`) via `agent_ia` | Sur demande d'un membre du projet (un visiteur d'un projet public n'y a pas droit) | L'instantané **réduit** du canvas | Résultat consultatif, aucune modification ; les remarques sur des blocs absents sont écartées et comptées (`discarded`) ; une sortie inexploitable est refusée en **502** et jamais présentée comme « aucune remarque » ; aucun chiffre d'impact n'est fabriqué, ni par le service, ni par l'interface |
| Conseiller conversationnel Chatbot (`.../ai/chat`) | Google Gemini (`gemini-3.8-flash`) via `agent_ia` | Sur demande d'un membre du projet dans le volet d'assistance | L'instantané **réduit** du canvas et l'historique des messages (20 au plus, 8000 caractères chacun), les messages de la personne encadrés comme données non fiables | Consultatif uniquement ; aucune écriture directe ; ne conserve aucune donnée personnelle en base ; quota propre (60 échanges par jour, 10 pour un invité) pour qu'une conversation n'épuise pas le quota d'esquisses ; les actions suggérées viennent du modèle, aucune n'est fabriquée |

**État au 14/11.** Le service `agent_ia` (Python / FastAPI) tourne en conteneur interne non routé publiquement, authentifié par un jeton de service **obligatoire** (sans lui, il refuse de démarrer). Il consomme Google Gemini via l'endpoint compatible OpenAI. En l'absence de clé ou en profil local sans agent, `AI_PROVIDER=fake` fournit des réponses de secours figées valides, et toute réponse figée est étiquetée `demo` jusque dans l'interface.

Deux délais encadrent un appel : `AI_TIMEOUT_SECONDS` (30 s) pour **un** appel au modèle, `AI_AGENT_TIMEOUT_SECONDS` (70 s) pour l'attente du backend sur le microservice, qui doit couvrir la reprise. Une demande d'esquisse ou de complétion peut donc coûter **deux** appels au fournisseur : le plafond `AI_GLOBAL_DAILY_CAP` doit être calibré sur ce double coût.

**Non encore fait (`IA-6`)** : aucun essai avec une vraie clé n'a été mené, donc ni la latence, ni le coût réel par appel, ni la qualité des réponses ne sont mesurés ; les chiffres manquent dans ce document et le plafond journalier n'a pas été calibré sur une mesure. Tout ce qui précède est vérifié par des tests sans réseau (65 côté microservice, 420 côté backend (1 ignoré), 92 côté interface).

Points vérifiés :

- [x] Les conditions d'utilisation de Google Gemini autorisent cet usage (Google AI Studio Terms of Service).
- [x] Aucune donnée personnelle réelle n'est envoyée au fournisseur d'IA (uniquement structure de canvas technique et cahier des charges).
- [x] Le coût est borné par les quotas quotidiens stricts (`AI_DAILY_QUOTA`, `AI_CHAT_DAILY_QUOTA`, `AI_GLOBAL_DAILY_CAP`), comptés avant l'appel ; à calibrer sur une mesure réelle (`IA-6`).
- [x] Le mode démo local (`AI_PROVIDER=fake`) existe au cas où l'IA est indisponible ou non configurée.

## 3. Maîtrise du code produit avec l'IA

Pour chaque partie générée avec l'IA, au moins une personne de l'équipe doit pouvoir :

- expliquer ce que fait le code et pourquoi ce choix ;
- le modifier sans l'IA ;
- répondre aux questions du jury sur sa sécurité et ses limites.

| Partie | Personne qui la maîtrise |
|---|---|
| Droits d'accès, équipe, liens de partage, projets publics | Ibrahima Pouye |
| Sessions, ticket et serveur temps réel | Ibrahima Pouye |
| Versions et validation du canvas | Ibrahima Pouye |
| Canvas, blocs et interface | À compléter par l'équipe |
| Génération du projet, envoi sur GitHub, déploiement | Ibrahima Pouye |
| Agent IA, microservice `agent_ia`, prompts et Chatbot | Serigne Fallou Ngom |
| Parcours de bout en bout, SBOM, contrôle des licences | À compléter par l'équipe |
