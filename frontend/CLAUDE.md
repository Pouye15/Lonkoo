# CLAUDE.md — Contexte et directives du front LONKOO

Ce fichier est la référence unique du **front** pour tout développeur ou agent IA. Il décrit le produit tel qu'il est implémenté, l'architecture du dossier `frontend/` et les règles de design à respecter.

Le front vit dans le monorepo (voir le `README.md` racine). Les documents partagés sont dans `../docs/` : contrat du canvas (`schema-canvas.md`, `canvas.schema.json`), architecture (`architecture.md`) et feuille de route du backend (`ROADMAP-BACKEND.md`, avec la correspondance écrans et API au § 8).

---

## 1. Identité et contexte

- **Nom de la plateforme** : **LONKOO**.
- **Cadre** : projet développé pour le hackathon organisé par Systalink.
- **Règle de marque importante** : LONKOO est une plateforme indépendante d'échange et de collaboration architecturale, et **non** une plateforme interne de Systalink. Toute mention la présentant comme « la plateforme de Systalink » est proscrite. La seule référence autorisée concerne le pont d'implémentation vers le constructeur de site **Orion** (aux côtés du serveur MCP). Le déploiement s'écrit donc « serveur cloud à Dakar » dans l'interface.
- **Proposition de valeur** : le studio où une équipe conçoit l'architecture de son application en temps réel, avec un copilote IA à la demande, puis la génère, la pousse sur GitHub et la déploie ; appliquer le modèle collaboratif et versionné de Git à la modélisation d'architecture et au choix des stacks.

---

## 2. État d'avancement

Les tâches de finition du 20/10 sont faites : landing page refaite dans l'esprit d'une landing SaaS moderne (la maquette Dribbble citée n'est pas consultable automatiquement : la direction s'inspire des conventions du genre), thème sombre, pages de connexion, navigation et barre latérale par projet, tableau blanc façon draw.io, suppression des étiquettes décoratives de version.

Reste à faire côté front (voir `../docs/ROADMAP-BACKEND.md`) :

- **API branchée (lot R9, 21/10)** : avec `NEXT_PUBLIC_API_MODE=live` (lu au build), `session.tsx`, `workspace.tsx` et `project-graph.ts` parlent à l'API et au document Yjs partagé ; sans, les données simulées du navigateur restent le comportement par défaut (la CI construit sans la variable). Voir § 3.5, § 3.10 et « Mode API » ci-dessous.
- **Modèle de blocs aligné sur le contrat** (décision D2, `../docs/PROPOSITION-MODELE-DE-BLOCS.md`) : 9 types dont `generic` (passerelle, cache, IA, utilisateur, bloc libre) ; la forme dessinée et tout champ propre au front vont dans la clé `ui` du document, hors contrat. La proposition et l'ajout du type `generic` au schéma attendent la relecture de l'équipe (pull request).
- **Panneau « Propriétés »** (21/10) : tables et champs d'une base, endpoints d'un service, pages d'une application web, topics d'une file, méthode d'authentification, canal, devise, flux, modèle de facturation. Ces champs du contrat sont portés par `ArchitectureNode.contract` (voir `canvas-model.ts`) : ils passent par le même chemin que le reste (annuler/rétablir, lecture seule, mode simulé). Les saisies sont validées comme le fait le backend (`canvas-contract.ts`) avant d'être écrites : une saisie refusée n'arrive jamais dans le document partagé.
- **Exports et comparateur de versions** (21/10) : bouton *Exporter* du Studio (Mermaid avec aperçu et copie prête pour un README GitHub, spécification JSON du contrat, image SVG, image PNG) et bouton *Comparer* de chaque version (voir § 3.5). Les formats sont produits par des modules purs (`canvas-export.ts`, `canvas-diff.ts`) ; le Mermaid est validé par l'analyseur Mermaid, le SVG est un fichier autonome (couleurs et polices du système, thème clair).
- **Reste à faire** : modification des gabarits de message d'un bloc de messagerie (ils sont conservés tels quels).
- **Équipe en mode API (24/10)** : l'onglet 6 liste les vrais membres (`GET /projects/{id}/members`), permet de retirer quelqu'un ou de quitter le projet, et montre les liens de partage actifs avec « Révoquer » (MAINTAINER et plus). Le serveur décide de ce qui est permis (`removable`) ; les boutons ne font que le suivre. Règles pures et leurs tests : `lib/members.ts`, appels : `lib/members-api.ts`, écran : `components/studio/live/LiveTeamPanel.tsx`.
- Écrans sans backend prévu (communauté, revues, MCP, Orion) : données fictives, à garder en démonstration ou à masquer avant la soumission.

---

## 3. Cahier des charges fonctionnel et écrans

### 3.1. Landing page (`/`)
- Navigation fixe opaque (Parcours, Fonctionnalités, Questions, thème, connexion). Tous les appels à l'action mènent à `/login`.
- Accroche, puis **section épinglée au défilement** (`src/components/landing/StudioDemo.tsx`) qui joue la démo du studio en quatre étapes : *Concevoir*, *Auditer*, *Générer*, *Déployer*. L'animation est un rendu canvas procédural (`sequence/render-frame.ts`, une fonction pure de l'index d'image), sans vidéo ni image à télécharger. `prefers-reduced-motion` : schéma complet, sans animation liée au défilement.
- Grille de fonctionnalités, questions fréquentes, bandeau d'appel à l'action, pied de page. Clair ou sombre selon le thème.
- Aucun chiffre ni témoignage inventé : ne pas en ajouter.

### 3.2. Connexion (`/login`)
- **Continuer avec GitHub** ou **Essayer sans compte** (espace de démonstration, invité de 24 h). Pas de mot de passe : c'est la décision d'architecture (session serveur, OAuth GitHub).
- `?next=` est validé (chemin interne uniquement). Un compte GitHub qui se connecte pour la première fois passe par `/onboarding` ; l'invité va directement aux projets.
- `src/lib/session.tsx` : contrat `GET /me`, `POST /auth/guest`, `GET /auth/github/login`, `POST /auth/logout`. Tant que `NEXT_PUBLIC_API_MODE` n'est pas `live`, une session simulée (localStorage) tient lieu de backend et la page l'indique.

### 3.3. Espace connecté (groupe de routes `src/app/(app)/`)
- **Shell persistant** (`components/layout/AppShell.tsx`) : monté une fois pour toutes les pages, il redirige vers `/login` sans session. Chaque page y dépose son titre et ses actions avec `<PageHeader title actions fullBleed />`.
- **Barre latérale** : sélecteur de projet (recherche, création), *Espace de travail* (Projets, Studio, Revues), *Réseau* (Communauté), *Ingénierie* (Déploiement, Paramètres). Studio et Déploiement conservent le projet actif (`?project=`). Repliable (icônes seules), tiroir sur petit écran, sélecteur de thème, menu du profil (configuration initiale, paramètres, connexion GitHub pour un invité, déconnexion).
- **En-tête réductible en bulle** (bouton « Réduire ») : fil d'Ariane `propriétaire / projet / page` en mode standard ; en mode réduit, une bulle flottante avec le logo, le fil d'Ariane et le bouton d'agrandissement. Les états replié et bulle sont mémorisés.
- Projet actif : `src/lib/workspace.tsx` (`useWorkspace`). Titre d'onglet : mis à jour par `PageHeader`.

### 3.4. Projets (`/dashboard`)
- Indicateurs calculés depuis les données (aucune valeur codée en dur), filtres *Tous / Publics / Privés / Forks*, recherche par nom ou technologie, état vide.
- Visibilité Public / Privé en un clic. Origine des forks, dépôt, branche, tag Git s'il existe, équipe, accès au Studio (`/studio?project=…`) et à l'équipe (`&tab=team`).
- Création de projet dans un dialogue accessible (`components/ui/Modal.tsx`) ; `?new=1` l'ouvre.

### 3.5. Studio (`/studio`)
Six onglets compacts (une seule ligne, défilement horizontal si l'écran est étroit), pilotés par l'URL (`?tab=canvas|scanner|simulator|docs|versions|team`) :

1. **Architecture** (`components/studio/ArchitectureWhiteboard.tsx` et `whiteboard/`) : canevas façon draw.io occupant toute la zone.
   - **Navigation** : glissement à deux doigts ou molette = déplacement 2D ; pincement du trackpad ou `Ctrl/Cmd + molette` = zoom autour du curseur ; `Maj + molette` = déplacement horizontal ; outil *Main*, `Espace` maintenu ou bouton du milieu + glisser = déplacer la vue ; deux doigts sur écran tactile (déplacement et pincement). Pendant un geste le DOM est mis à jour directement (`whiteboard/use-viewport.ts`), sans re-rendu des blocs.
   - **Sélection** : clic, `Maj`/`Ctrl` + clic pour ajouter, **cadre de sélection** en glissant sur le fond, `Ctrl+A`. Déplacement du groupe avec aimantation à la grille et guides d'alignement (bouton aimant).
   - **Liaisons** : quatre points d'ancrage par bloc (apparaissent au survol) ; glisser d'un point vers un autre bloc crée la liaison, ou outil *Relier* (clic source puis clic cible). Routage orthogonal à coins arrondis, étiquette du protocole, clic pour sélectionner (le protocole se change dans la barre d'outils).
   - **Raccourcis** : `V` sélection, `H` main, `C` relier, `Suppr`, `Ctrl+Z` / `Ctrl+Y` (annuler / rétablir), `Ctrl+D` dupliquer, `Ctrl+C` / `Ctrl+V`, flèches (pas de la grille, `Maj` = 1), `Entrée` ou double-clic = renommer, `+` / `-` zoom, `Ctrl+0` = 100 %, `Maj+1` ou `Ctrl+Maj+H` = ajuster à l'écran, `Échap`.
   - **Vue d'ensemble** (mini-carte, cliquable), fond points / grille / uni.
   - **Conventions visuelles** : `cylinder` = base de données en pile de cylindres ; `user` = silhouette ; `queue` = tuyau horizontal segmenté ; `gateway`, `service`, `cache`, `security`, `ai` = boîtes à icône ; `mobile-payment`, `messaging`, `billing` = blocs locaux génériques, sans marque (contrat du canvas) ; `generic` = **bloc libre** neutre.
   - **Indépendance entre bloc et stack** : un composant posé n'a **aucune stack imposée** (`tech: ""`). L'utilisateur le laisse neutre (« Aucune stack ») ou lui attribue un préréglage en un clic (`whiteboard/stencils.ts`) ou une saisie libre.
   - **Boîte à outils** (dock, en bas au centre, réductible) : onglets *Composants* (cliquer ou **glisser** sur le canevas) et *Stack technique* (propriétés du bloc sélectionné).
   - **Exporter** (en-tête du Studio) : code Mermaid (`flowchart LR`, copiable avec ses balises de code), spécification JSON du contrat (en mode API, l'instantané du serveur), image SVG et image PNG (fond blanc, résolution doublée). Le texte saisi par l'utilisateur est échappé dans chaque format.
   - **Propriétés** (bouton de la barre d'outils, panneau à droite qui réduit le tableau sans le recouvrir) : les champs du contrat propres au type du bloc sélectionné (tables et champs, endpoints, pages, topics…). C'est ce qui permet de générer les entités et les contrôleurs du projet.
2. **Analyse IA** : topologie, points uniques de défaillance, cohérence de stack ; correctifs applicables en un clic. *Maquette : l'IA réelle est un autre chantier.*
3. **Simulateur** : trafic de 1 000 à 20 000 req/s, charge et latence par bloc, ajout de répliques.
4. **Documentation** : synthèse, ADR et contrats générés à partir du graphe.
5. **Versions** : historique des versions et création d'une release (tag Git).
6. **Équipe** : collaborateurs, rôles (`Owner`, `Maintainer`, `Write`, `Triage`, `Read`), sous-équipes, règles de protection.

Le graphe vient de `useProjectGraph` (`src/lib/project-graph.ts`) : conservé par projet dans le navigateur en mode simulé, document Yjs partagé en mode API. Le tableau blanc est identique dans les deux cas : il reçoit et rend des tableaux.

### 3.6. Communauté (`/palabre`, `/palabre/[slug]`)
Architectures publiées, profils d'architectes, abonnements ; suivre / se désabonner ; fork complet ou partiel d'un modèle ; notes et commentaires. Données fictives, **sauf** la section « Galerie publique » en tête de page (mode API) : les vrais projets publics de comptes GitHub (`GET /projects/public`, `components/community/PublicGallery.tsx`). « Consulter » ouvre le projet en lecture seule dans le studio (`/studio?project=<identifiant>`) : un projet public d'une autre personne est gardé hors de « mes projets » (`visitor` dans `lib/workspace.tsx`), sans « Déployer » ni « Créer une revue », avec un bandeau « lecture seule ». Seul le propriétaire peut passer un projet en public ou en privé (le bouton de la liste des projets est inactif pour les autres). Le fork d'un projet public n'existe pas encore.

### 3.7. Revues (`/reviews`)
Propositions de modification d'architecture (différentiel, vérification de cohérence, approbations, fusion) et salons de discussion d'équipe. Données fictives.

### 3.8. Déploiement (`/deploy`)
Onglet *Déploiement* : **Générer le projet**, **Envoyer sur GitHub**, **Déployer** (état *En attente → En cours → Déployé*). En **mode API**, c'est `components/deploy/LivePipeline.tsx` contre l'API réelle (génération asynchrone suivie par interrogation toutes les 1,5 s, fichiers consultables, archive ZIP, envoi avec nom et visibilité validés comme le serveur, déploiement lancé par LONKOO ou étapes manuelles, bouton « Autoriser le déploiement depuis LONKOO » qui demande à GitHub `repo` et `workflow` sur choix explicite) ; les règles pures sont dans `lib/generation.ts` (testées), les appels dans `lib/generation-api.ts`. En **mode démonstration**, le parcours reste simulé et la page l'indique. Une adresse saisie par l'utilisateur n'est jamais mise telle quelle dans un lien : `safeHttpUrl` n'accepte que http et https sans identifiants. Onglet *MCP et Orion* : configuration du serveur MCP pour les agents, envoi vers Orion. Onglet *Releases* : association d'un tag Git.

### 3.9. Configuration initiale (`/onboarding`) et paramètres (`/settings`)
Organisation, visibilité par défaut, stacks favorites, intégrations ; membres, clés, apparence (thème clair, sombre ou système).

---

## 4. Architecture technique

### Stack
- **Next.js 16.4** (App Router, Turbopack), **React 19.3**, **TypeScript 6.0** (7 n'est pas supporté par typescript-eslint), **Tailwind CSS v4**.
- **Icônes** : `@phosphor-icons/react` (`/ssr` dans les composants serveur). **Polices** : Geist et Geist Mono (`next/font`).
- Aucune bibliothèque d'animation : CSS et canvas 2D. **Sharp n'est pas installé** (libvips est LGPL, interdit par le règlement) : `stubs/sharp` est un workspace npm factice et `images.unoptimized` est activé. Voir `../docs/LICENCES-TIERCES.md`.
- Avant d'ajouter une dépendance : licence permissive (MIT, Apache 2.0, BSD), et l'ajouter à `../docs/LICENCES-TIERCES.md`.

### Arborescence
```text
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Polices, métadonnées, ThemeProvider, SessionProvider
│   │   ├── globals.css           # Jetons de design (clair / sombre) et base Tailwind
│   │   ├── page.tsx              # Landing
│   │   ├── login/page.tsx        # Connexion
│   │   ├── not-found.tsx
│   │   └── (app)/                # Espace connecté : layout.tsx monte le shell
│   │       ├── dashboard/  studio/  reviews/  deploy/
│   │       ├── palabre/ (+ [slug])  settings/  onboarding/
│   ├── app/join/[token]/page.tsx # Rejoindre un projet par lien de partage (hors espace connecté)
│   ├── components/
│   │   ├── ui/                   # Button, Logo, Modal, Field, hooks (fermeture, préférences)
│   │   ├── theme/                # ThemeProvider (anti-flash), ThemeSegmented, ThemeIconButton
│   │   ├── layout/               # AppShell, PageHeader, ProjectSwitcher, UserMenu
│   │   ├── landing/              # Nav, StudioDemo (+ sequence/render-frame.ts), Features, Faq, bas de page
│   │   ├── studio/               # ArchitectureWhiteboard + whiteboard/ (geometry, use-viewport, NodeView, EdgesLayer, Dock, ContractInspector, Minimap, stencils)
│   │   ├── studio/ExportDialog.tsx   # Exports : Mermaid, JSON, SVG, PNG
│   │   │   └── live/             # Mode API : CanvasGate, ShareDialog, VersionsPanel (+ CompareDialog), LiveTeamPanel
│   │   ├── deploy/               # StepShell (étape numérotée), LivePipeline (génération, GitHub, déploiement en mode API)
│   │   └── palabre/              # BlueprintDetailClient
│   └── lib/
│       ├── session.tsx           # Session (adaptateur simulé ou API)
│       ├── workspace.tsx         # Projets et projet actif (simulés ou GET/POST/PATCH /api/projects)
│       ├── project-graph.ts      # Graphe d'architecture : simulé, ou document partagé
│       ├── api.ts                # Client de l'API : erreurs problem+json, 401, rôles
│       ├── canvas-session.ts     # Connexion d'un canvas au temps réel (ticket, présence, lecture seule)
│       ├── canvas-yjs.ts         # Lecture et écriture du document Yjs, par différences
│       ├── canvas-model.ts       # Bloc du front ↔ entrée du contrat (champs propres au front dans `ui`)
│       ├── canvas-contract.ts    # Champs du contrat par type (tables, endpoints…) : lecture tolérante, validation
│       ├── canvas-export.ts      # Instantané du contrat, Mermaid et SVG tirés du graphe
│       ├── canvas-diff.ts        # Différences entre deux instantanés (ajouté, supprimé, modifié, déplacé)
│       ├── download.ts           # Téléchargements (texte, JSON) et image PNG tirée d'un SVG
│       ├── generation.ts         # Formes des réponses de génération, d'envoi et de déploiement ; règles pures (noms de dépôt, liens sûrs, étapes)
│       ├── generation-api.ts     # Appels de l'API de génération, d'envoi sur GitHub et de déploiement
│       ├── reserved-words.ts     # Mots réservés Java, SQL, YAML (copie surveillée du backend)
│       ├── *.test.ts             # Tests (lanceur de Node : `npm test`)
│       ├── lonkoo-data.ts        # Types et données d'exemple
│       └── cn.ts
├── stubs/sharp/                  # Remplace sharp (licence)
├── eslint.config.mjs  next.config.ts  package.json
```

### Mode API (`NEXT_PUBLIC_API_MODE=live`)
- **Variables** (dans `frontend/.env.local`, inlinées au build) : `NEXT_PUBLIC_API_MODE=live` ; `NEXT_PUBLIC_REALTIME_URL=ws://localhost:1234` en local (la CSP de développement l'autorise), `/ws` en production (servi par Caddy sur l'origine du site). En local, Next relaie `/api` vers le backend.
- **Projets** : `useWorkspace` lit `GET /api/projects` pour la personne connectée (la liste suit la session), crée avec `POST` (le dialogue affiche l'erreur : limite atteinte en 409, session expirée…) et bascule la visibilité avec `PATCH`. `?project=` accepte le nom court ou l'identifiant, et se souvient de la demande tant que la liste n'est pas arrivée.
- **Canvas partagé** : `useProjectGraph` ouvre une connexion par canvas (ticket `POST …/realtime-ticket`, redemandé à chaque reconnexion), garde le tableau caché jusqu'au premier échange (jamais de tableau vide « en attendant »), montre un bandeau « Connexion perdue » sans retirer le tableau (les modifications partent au retour du réseau) et affiche la présence (avatars, curseurs).
- **Lecture seule** (rôles Read et Triage, ou refus du serveur) : pas de boîte à outils, ni déplacement, ni liaison, ni suppression, ni annulation ; la barre d'outils l'indique. Le serveur ignore de toute façon leurs écritures.
- **Document Yjs** : trois cartes (`nodes`, `edges`, `meta`), une `Y.Map` par entrée (`type`, `position`, `data`, `ui`). `data.name` est l'identifiant technique, déduit du titre à la création (sans accent, hors mots réservés, unique) puis **stable** ; `data.label` porte le titre, `data.tech` la stack (80 caractères au plus), le reste de `data` (tables, endpoints…) est `node.contract`. Ouvrir un canvas sans le modifier n'écrit rien dans le document.
- **Partage** : bouton *Partager* (rôles Owner et Maintainer) : rôle et durée au choix (72 h au plus). La page `/join/[token]` ouvre une session d'invité si besoin et rejoint le projet.
- **Versions** : onglet *Versions* en mode API : enregistrer (le serveur valide : 422 avec la liste des erreurs), restaurer (vu en direct par tous), exporter en JSON, **comparer** : le schéma des deux états superposés (ajouté en vert, supprimé en rouge pointillé, modifié en orange) et la liste de ce qui a changé (tables, champs, endpoints, pages, topics, titre, stack, liens). Un bloc seulement déplacé est compté à part, sans couleur. On compare une version au canvas actuel ou à une autre version.
- **Erreurs** : `api.ts` lit les `problem+json` ; un 401 renvoie à la connexion en gardant la page demandée.

### Thème
Les composants utilisent **uniquement des jetons sémantiques** définis dans `globals.css` et redéfinis sous `.dark` : surfaces `bg-canvas`, `bg-surface`, `bg-sunken`, `bg-subtle`, `bg-strong` ; texte `text-ink`, `text-ink-2`, `text-ink-3`, `text-ink-4` ; traits `border-edge`, `border-edge-soft`, `border-edge-strong` ; marque `bg-brand` (fonds pleins), `text-accent` (texte, liens) ; états `text-danger`, `text-warn`, `text-ok` ; boutons inversés `bg-inverse` + `text-inverse-ink`. **Ne pas écrire de couleur Tailwind en dur** (`bg-white`, `text-slate-900`, `#1265DD`…) : le thème sombre cesserait de fonctionner. Le choix (clair, sombre, système) est mémorisé ; un script dans `<head>` évite le flash.

---

## 5. Directives strictes de design et standards frontend

1. **Zéro esthétique « générée par IA »** (pas de bulles pastel ni de transparence diluée) :
   - **Interdit** : pastilles à fond teinté et bordure colorée (`rounded-full bg-sky-50 border border-sky-200 text-sky-700`), modificateurs d'opacité sur les surfaces (`bg-white/90`, `border-slate-200/80`), `backdrop-blur`.
   - **Requis** : surfaces **100 % opaques et nettes** via les jetons, dans l'esprit de Linear, GitHub, Vercel.
2. **Zéro méta-texte ni répétition du prompt dans l'interface** : jamais de libellé auto-descriptif (« Tableau blanc navigable Draw.io », « Modèle Git », « Boîte à outils (Tool Box) », « Conventions : BD = cylindre… », codes `[ECR-XX]`). Intitulés courts, orientés action (*Architecture*, *Composants*, *Stack technique*, *Équipe*, *Fusionner*, *Suivre*).
3. **Pas d'étiquettes décoratives** de version, de moteur ou de statut (« v2.4.0 », « Engine v4.2 », « MCP v1.0 », compteur d'images). Un tag Git n'apparaît que comme **donnée** (carte de projet, version, release).
4. **Pas de donnée inventée présentée comme réelle** (chiffres, témoignages, latences, clés d'API). Les valeurs d'exemple ne doivent pas ressembler à des secrets.
5. **Responsivité prioritaire sur écrans moyens** (`md` 768–1024 px et `lg` 1024–1280 px) : barres d'outils et d'onglets compactes, sur une seule ligne, avec `overflow-x-auto`, sans écraser le contenu.
6. **Thèmes** : clair (`#F8FAFC` / `#FFFFFF`) et sombre, accent bleu `#1265DD`. Contrastes AA, `focus-visible` partout, `prefers-reduced-motion` respecté.
7. **Hooks et rendu** : les règles « React Compiler » d'ESLint sont des erreurs (pas d'écriture de ref ni de `Date.now()` pendant le rendu, pas de `setState` synchrone dans un effet).

---

## 6. Commandes

```bash
# Vérification des types
npm run typecheck

# Lint (ESLint 9, doit passer sans erreur)
npm run lint

# Tests des modules purs (correspondance bloc ↔ contrat, document Yjs, mots réservés)
npm test

# Serveur de développement (port 3000 ; relaie /api vers BACKEND_INTERNAL_URL, localhost:8080 par défaut)
npm run dev

# Build de production
npm run build

# Serveur de production (port 3000)
npm run start

# Image Docker de production (mode API et chemin /ws par défaut ; voir l'en-tête du Dockerfile)
docker build -t lonkoo-frontend frontend
```

Les variables `NEXT_PUBLIC_*` sont fixées à la construction : `--build-arg NEXT_PUBLIC_API_MODE=…` et `--build-arg NEXT_PUBLIC_REALTIME_URL=…`, pas au démarrage du conteneur. Le mode choisi est lisible dans le HTML servi (`<html data-api-mode="live">`) ; la CI démarre l'image et refuse un mode autre que `live`.

`next dev` génère un `AGENTS.md` (consignes pour les agents IA, version Next.js) ; il est versionné pour garder l'arbre propre.
