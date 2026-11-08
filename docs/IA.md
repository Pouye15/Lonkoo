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
| 2026-11-04 | Ibrahima Pouye | Claude Code (Sonnet 5.5) | Doc OAuth (`GITHUB-OAUTH.md`), mise à jour des actions GitHub (`PR-2`), relecture d'assistant de la pull request n° 2 hors IA (constats A-17 à A-20), correctif du Caddyfile et script `scripts/check_internal_routes.sh`, essai de la construction du projet généré (`DK-1`) et job de CI `projet-genere` (`DK-2`) | Lecture du code, essais (Caddy devant de faux serveurs, `actionlint`, `shellcheck`, `hadolint`), rédaction de fichiers de configuration, de documentation et d'un script de contrôle |
| 2026-11-04 à 2026-11-05 | Ibrahima Pouye | Claude Code (Sonnet 5.5) | Mises à jour de dépendances avec SBOM, restauration et déploiement sûrs (A-19, A-20), validation du projet généré (A-21), job de CI du projet généré, limites du canvas en direct (A-18) et leur affichage, discussion d'équipe par projet (backend, interface, parcours de bout en bout, mesure de charge), développement dans un Codespace (origine, relais du temps réel), essai de la connexion GitHub, documentation | Génération de code, de tests (dont tests de mutation : casser une règle pour vérifier qu'un test la protège) et de documentation ; mesures (charge, parcours dans un navigateur) ; diagnostic d'un problème de réseau à partir de résultats donnés par la personne ; fusion de pull requests sur délégation, sans relecture humaine |
| 2026-11-05 | Ibrahima Pouye | Claude Code (Sonnet 5.5) | Étude des plateformes similaires (`docs/ETUDE-PLATEFORMES-SIMILAIRES.md`) | Recherche web, lecture de pages d'éditeurs, vérification dans le code de ce que LONKOO fait déjà, rédaction. Les sources sont citées ; les outils comparés n'ont pas été essayés |
| 2026-11-07 | Ibrahima Pouye | Claude Code (Sonnet 5.5) | Modèles de départ à la création d'un projet : quatre canvas (clinique, école, tontine, livraison de colis), catalogue et API, choix dans l'interface, vérification des projets générés de chaque modèle (script et job de CI en matrice) | Génération de code, de tests (dont mutations) et de contenu (les quatre modèles) ; essais réels : backend de chaque projet généré compilé, démarré sur PostgreSQL et interrogé ; relecture à faire par une personne |
| 2026-11-07 | Ibrahima Pouye | Claude Code (Sonnet 5.5) | Relecture des quatre modèles de départ contre des références publiques (FHIR, Ed-Fi, liste ISO 4217, GSM 03.38, statuts de suivi de colis, loi sénégalaise 2008-12) : corrections des modèles de données, des routes et des canaux de messagerie, trois tests de structure (`docs/MODELES-DE-DEPART.md`) | Recherche et lecture de pages web, rédaction des corrections et du document ; les projets générés des quatre modèles ont été reconstruits et interrogés ; la lecture des sources est automatique (résumés), les articles de loi sont à confirmer ; relecture par une personne du domaine **non faite** |
| 2026-11-08 | Ibrahima Pouye | Claude Code (Sonnet 5.5) | Audit d'architecture par règles : dix règles pures et leurs tests (`frontend/src/lib/audit.ts`), composant de l'onglet « Audit » du Studio, parcours de bout en bout `06-audit.mjs`, remplacement du score constant | Génération de code et de tests (dont mutations : huit règles cassées une à une, chacune vue par un test) ; essais réels dans un navigateur : 390 px, thème sombre (contraste mesuré), trois personnes (écriture, lecture seule), mode démonstration ; relecture par Fall (propriétaire de l'onglet) **à faire** |
| | | | | |

> **Brouillon à relire et à corriger par la personne concernée.** Les lignes du 21 au 25/10 sont rédigées d'après l'historique du dépôt (`git log`) : elles disent ce que l'outil a produit, pas la relecture que chacun en a faite. **Modèle à vérifier :** la colonne « Outil » indique le modèle connu au moment de la rédaction ; la personne corrige si une session a utilisé un autre modèle. Chaque autre membre qui a utilisé un outil d'IA (génération de code, de maquettes ou de textes) ajoute ses propres lignes, en son nom.

Exemples de nature d'usage : génération de code, génération de tests, relecture, rédaction de documentation, génération de maquettes, recherche de bibliothèques.

## 2. IA intégrée au produit

| Fonction | Fournisseur et modèle | Déclenchement | Données envoyées | Garde-fous |
|---|---|---|---|---|
| Esquisse d'architecture depuis un cahier des charges (`POST /api/canvases/{id}/ai/sketch`) | **Aucun fournisseur choisi à ce jour** (décision de Serine Fallou Ngom). Point de raccordement prêt (`AiClient`) ; `AI_PROVIDER=fake` : réponses figées, sans appel externe | Sur demande de l'utilisateur, avec le droit d'écrire sur le canvas | Le texte saisi (8000 caractères au plus) | La proposition est validée contre le contrat du canvas (502 sinon) et jamais écrite sans acceptation ; journal sans le texte saisi ; quota par jour : 30 par personne connectée avec GitHub, 5 par invité, 500 pour tout le service (429 au-delà) |
| Complétion de sous-graphe (`.../ai/complete`) | idem | Sur demande de l'utilisateur, avec le droit d'écrire | L'état courant du canvas, les blocs sélectionnés, une consigne facultative | idem |
| Audit d'architecture (`.../ai/audit`) | idem | Sur demande d'un membre du projet (un visiteur d'un projet public n'y a pas droit) | L'état courant du canvas | Résultat consultatif, aucune modification ; les remarques sur des blocs absents sont écartées |

**État au 25/10.** Le produit ne fait aucun appel à un fournisseur d'IA : sans `AI_PROVIDER`, les routes répondent 501 ; avec `AI_PROVIDER=fake`, elles renvoient des réponses figées étiquetées `demo`. L'onglet « Analyse IA » de l'interface affiche des données de démonstration locales. Quand un fournisseur sera choisi, compléter ce tableau (fournisseur, modèle, conditions d'utilisation, données envoyées, coût) avant la soumission.

Points à vérifier avant la soumission :

- [ ] Les conditions d'utilisation de chaque outil et de chaque fournisseur d'IA autorisent cet usage.
- [ ] Aucune donnée personnelle réelle n'est envoyée au fournisseur d'IA.
- [ ] Le coût des appels IA pendant la période de notation est budgété.
- [ ] Une démo enregistrée existe au cas où l'IA est indisponible.

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
| Point de raccordement de l'IA et agent | À compléter par l'équipe |
| Parcours de bout en bout, SBOM, contrôle des licences | À compléter par l'équipe |
| | |
