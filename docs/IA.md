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
| 2026-10-24 à 2026-10-25 | Ibrahima Pouye | Claude Code (Sonnet 5.5) | Audit du travail et correctifs (constats A-01 à A-11), équipe et liens de partage, projets publics, sessions en base, SBOM, parcours de bout en bout (`e2e/`), point de raccordement de l'IA (`backend/.../ai/`) | Génération de code et de tests ; tests de mutation (casser une règle pour vérifier qu'un test la protège) ; relecture |
| 2026-10-24 à 2026-10-25 | Ibrahima Pouye | Claude Code (Sonnet 5.5) | Documentation : guide des actions humaines, guide de défense devant le jury, mise à jour des documents du dépôt | Rédaction |
| 2026-10-29 | Serigne Fallou Ngom | Google Antigravity | Module `agent_ia` (FastAPI Python), intégration Spring Boot `AgentIaClient`, chatbot d'architecture | Développement, intégration de Gemini 3.8 Flash, validation du contrat |
| 2026-11-04 | Serigne Fallou Ngom | Claude Code (Opus 5.5) | `CLAUDE.md` : section sur la branche `ia_agent` ; découpage des commits | Rédaction de documentation |
| 2026-11-04 | Ibrahima Pouye | Claude Code (Sonnet 5.5) | Relecture de la pull request n° 3 (agent IA) et correctifs : jeton de service, audit et conseiller sans réponse ni chiffre inventés, tests de `agent_ia/`, dépendances figées, SBOM et licences Python, documentation | Relecture, génération de code et de tests, tests de mutation, lecture de la documentation de Google et de la page de Systalink |
| | | | | |

> **Brouillon à relire et à corriger par la personne concernée.** Les lignes du 21 au 25/10 sont rédigées d'après l'historique du dépôt (`git log`) : elles disent ce que l'outil a produit, pas la relecture que chacun en a faite. **Modèle à vérifier :** la colonne « Outil » indique le modèle connu au moment de la rédaction ; la personne corrige si une session a utilisé un autre modèle. Chaque autre membre qui a utilisé un outil d'IA (génération de code, de maquettes ou de textes) ajoute ses propres lignes, en son nom. Les lignes de Serigne Fallou Ngom sont celles qu'il a déclarées lui-même.

Exemples de nature d'usage : génération de code, génération de tests, relecture, rédaction de documentation, génération de maquettes, recherche de bibliothèques.

## 2. IA intégrée au produit

| Fonction | Fournisseur et modèle | Déclenchement | Données envoyées | Garde-fous |
|---|---|---|---|---|
| Esquisse d'architecture (`POST /api/canvases/{id}/ai/sketch`) | Google Gemini (`gemini-3.8-flash`) via le microservice interne `agent_ia` (ou mode `fake` en démo) | Sur demande de l'utilisateur, avec le droit d'écrire sur le canvas | Le texte saisi (8000 caractères au plus) | La proposition est validée contre le contrat du canvas (502 sinon) et jamais écrite sans acceptation ; journal sans le texte saisi ; quota par jour : 30 par personne connectée avec GitHub, 5 par invité, 500 pour tout le service (429 au-delà) |
| Complétion d'architecture (`.../ai/complete`) | Google Gemini (`gemini-3.8-flash`) via `agent_ia` | Sur demande de l'utilisateur, avec le droit d'écrire | L'état courant du canvas, les blocs sélectionnés, une consigne facultative | idem |
| Audit d'architecture (`.../ai/audit`) | Google Gemini (`gemini-3.8-flash`) via `agent_ia` | Sur demande d'un membre du projet (un visiteur d'un projet public n'y a pas droit) | L'état courant du canvas | Résultat consultatif, aucune modification, aucun score ni chiffre ajouté ; les remarques sur des blocs absents, sans titre, ou de gravité ou catégorie inconnue sont écartées |
| Conseiller conversationnel Chatbot (`.../ai/chat`) | Google Gemini (`gemini-3.8-flash`) via `agent_ia` | Sur demande d'un membre du projet dans le volet d'assistance | L'état courant du canvas et l'historique des derniers messages | Consultatif : rien n'est écrit dans le canvas ; le texte des messages n'est conservé nulle part (le journal d'audit garde qui a appelé et quand, pas ce qui a été écrit) ; compte dans le quota du jour |
| Conseiller global (widget flottant, `POST /api/ai/chat` et `/api/ai/chat/stream`) | idem | Sur demande de toute personne connectée, invité compris | L'historique des derniers messages (20 au plus, 8000 caractères chacun) ; aucun canvas | idem ; compte dans le quota du jour |

**État au 04/11/2026.** Le service `agent_ia` (Python, FastAPI) tourne dans un conteneur sur un réseau réservé au backend et à lui, sans route publique ; il appelle Google Gemini par l'endpoint compatible OpenAI et refuse tout appel sans son jeton de service. `AI_PROVIDER=fake` (réponses figées, étiquetées `demo`) se choisit à la main : il ne s'active pas tout seul quand l'IA est en panne, et l'interface affiche alors une erreur, jamais une réponse fabriquée. **Aucun appel à Gemini n'a encore été essayé avec une vraie clé** (étape `IA-6`) ; les tests simulent le fournisseur.

Points à vérifier avant la soumission :

- [ ] **Conditions d'utilisation de Google.** Lues le 04/11/2026 (conditions de l'API Gemini, « en vigueur le 23 mars 2026 », https://ai.google.dev/gemini-api/terms) : sur le niveau gratuit, Google peut utiliser ce qu'on envoie et les réponses pour améliorer ses produits, des relecteurs humains peuvent les lire, et il est demandé de ne pas envoyer d'information sensible, confidentielle ou personnelle ; sur le niveau payant, Google dit ne pas s'en servir à cette fin. L'utilisateur de l'API doit avoir 18 ans. **À décider** : une clé liée à un compte avec facturation pour la production et la démo. **À faire** : une personne de l'équipe relit ces conditions (cette lecture est un résumé fait par un outil, pas mot à mot).
- [ ] **Données personnelles.** Ce que la personne écrit (cahier des charges, consigne, messages du conseiller) part tel quel chez Google, avec l'état du canvas (noms de blocs, de champs, libellés) ; rien ne le filtre. Le serveur n'envoie pas l'identité de la personne (compte, adresse). Un avertissement dans l'interface (« ne saisissez pas de données personnelles ») reste à écrire.
- [x] **Coût borné** : 30 appels par jour et par personne connectée avec GitHub, 5 par invité, 500 pour tout le service (réglables : `AI_DAILY_QUOTA`, `AI_GUEST_DAILY_QUOTA`, `AI_GLOBAL_DAILY_CAP`), vérifiés par des tests. Le coût en argent d'un appel n'est pas mesuré (étape `IA-6`).
- [x] **Démo de secours** : `AI_PROVIDER=fake` existe. Une démo enregistrée (captures ou vidéo) reste à faire (étape `IA-9`).
- [ ] **Modèle.** `gemini-3.8-flash` figure sur la page des modèles de Google (relevé du 04/11/2026), avec l'étiquette « New » et non « Stable » : son nom ou son comportement peut changer. À revérifier la veille de la démo.
- [ ] **Mode JSON.** Les appels demandent `response_format: json_object`. La page de compatibilité OpenAI de Google ne le documente pas (elle montre les sorties structurées par schéma). À essayer en premier avec une vraie clé ; la validation du contrat et la reprise protègent déjà la sortie.
- [ ] **Descriptions de Systalink.** L'assistant n'affirme que ce que https://systalink.com/fr affichait le 04/11/2026 : serveur cloud (région Dakar, tarifs en FCFA), Orion, Connexion MCP, Yokk. Les chiffres de latence, la réplication, les sauvegardes, l'anti-DDoS, Kubernetes, SystaDrive et les GPU n'y figuraient pas : à ne réintroduire qu'avec une source de Systalink.

## 3. Maîtrise du code produit avec l'IA

Pour chaque partie générée avec l'IA, au moins une personne de l'équipe doit pouvoir :

- expliquer ce que fait le code et pourquoi ce choix ;
- le modifier sans l'IA ;
- répondre aux questions du jury sur sa sécurité et ses limites.

| Partie | Personne qui la maîtrise |
|---|---|
| Droits d'accès, équipe, liens de partage, projets publics | Ibrahima Pouye (à confirmer) |
| Sessions, ticket et serveur temps réel | Ibrahima Pouye (à confirmer) |
| Versions et validation du canvas | Ibrahima Pouye (à confirmer) |
| Canvas, blocs et interface | À compléter par l'équipe |
| Génération du projet, envoi sur GitHub, déploiement (le lot R8 a été écrit avec Claude Code par Ibrahima Pouye) | À compléter par l'équipe |
| Agent IA, microservice `agent_ia`, prompts et Chatbot | Serigne Fallou Ngom (à confirmer) |
| Parcours de bout en bout, SBOM, contrôle des licences | À compléter par l'équipe |
