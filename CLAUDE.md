# CLAUDE.md — Contexte Complet & Directives du Projet LONKOO

Ce fichier centralise l'ensemble du contexte produit, fonctionnel, architectural et des règles de design du projet **LONKOO**. Il sert de référence unique pour tout développeur ou agent IA intervenant sur le dépôt.

---

## 1. Identité & Contexte du Projet

- **Nom de la plateforme** : **LONKOO**
- **Cadre** : Projet développé pour le hackathon organisé par Systalink.
- **Règle de marque importante** : LONKOO est une plateforme indépendante d'échange et de collaboration architecturale, et **non** une plateforme interne de Systalink. Toute mention la présentant comme « la plateforme de Systalink » est proscrite. La seule référence autorisée concerne le pont d'implémentation vers le constructeur de site **Orion** (aux côtés du serveur MCP).
- **Proposition de valeur** : Appliquer le modèle collaboratif et versionné de Git ainsi que la dynamique d'un réseau d'échange communautaire à la **modélisation d'architecture logicielle** et au choix des **stacks techniques**, assistés par l'IA.

---

## 2. Cahier des Charges Fonctionnel & Écrans

### 2.1. Landing Page (`/`)
- **Animation Canvas & Séquence vidéo par frames** :
  - Utilise les 120 frames extraites dans `public/frames-bg/frame_0001.jpg` à `frame_0120.jpg` pilotées au scroll via `src/components/FrameBackgroundCanvas.tsx`.
  - Le haut de page (Hero + Démonstration interactive) repose sur l'animation en arrière-plan avec un voile bleu profond maîtrisé et l'animation vectorielle interactive au premier plan (`src/components/HeroArchitectureCanvas.tsx`).
  - **Transition de thème au scroll** : À partir de la section *« Un cycle ingénieur complet »*, la page passe en **fond blanc clair** avec adaptation complète des contrastes typographiques.

### 2.2. Navigation Post-Connexion (`src/components/layout/AppSidebar.tsx`)
- **Sidebar gauche** : Navigation principale regroupée en *Espace de travail* (`Projets`, `Studio`, `Revues & Équipe`), *Réseau* (`Communauté & Profils`) et *Ingénierie* (`Déploiement & MCP`, `Configuration initiale`, `Paramètres`), avec rappel du dépôt actif (`payment-mesh-core · main · v2.4.0`) et sélecteur de thème (Clair actif, Sombre à venir).
- **Navbar réductible en bulle** :
  - En mode standard : affiche le fil d'Ariane du projet (`lonkoo-org / payment-mesh-core`), la page courante et les actions rapides.
  - En mode réduit (**bouton « Réduire »**) : se replie en une petite bulle flottante compacte contenant uniquement le logo **LONKOO**, le fil d'Ariane du fichier (`lonkoo-org / payment-mesh-core · v2.4.0`) et le bouton d'agrandissement.

### 2.3. Bibliothèque de Projets (`/dashboard`)
- Vue d'ensemble des dépôts d'architecture de l'utilisateur.
- Gestion de la visibilité **Public / Privé** (modèle Git) en un clic.
- Filtrage par visibilité (*Tous*, *Publics*, *Privés*, *Forks*) et recherche par nom ou technologie.
- Affichage de l'origine des forks, de la branche active, du tag Git associé et des membres de l'équipe avec accès direct au Studio (`/studio?project=...`) et à la gestion d'équipe (`/studio?project=...&tab=team`).

### 2.4. Studio de Modélisation & Ingénierie (`/studio`)
Organisé autour de 6 onglets compacts et responsives :
1. **Architecture (`src/components/studio/ArchitectureWhiteboard.tsx`)** :
   - **Canevas navigable type Draw.io** occupant tout l'espace central.
   - **Navigation au Trackpad & Souris** :
     - Glissement à deux doigts sur le trackpad (`wheel` sans modificateur) pour déplacer le canevas (*pan* 2D fluide).
     - Pincement sur le trackpad (*pinch-to-zoom* ou `Ctrl/Cmd + molette`) pour zoomer/dézoomer autour du curseur.
     - Glisser direct sur le fond du canevas ou outil *Main* pour naviguer.
   - **Conventions visuelles** :
     - `cylinder` : Base de données représentée par une pile de cylindres 3D.
     - `user` : Utilisateur / Client représenté par une silhouette (« bonhomme »).
     - `queue` : Bus d'événements représenté par un tuyau horizontal segmenté.
     - `gateway`, `service`, `cache`, `security`, `ai` : Passerelle, boîtier de service, cache mémoire, bouclier IAM, module IA.
     - `generic` : **Bloc libre** neutre.
   - **Indépendance entre bloc et stack technique** :
     - Tout composant déposé depuis la boîte à outils est créé **sans imposer de stack technique par défaut** (`tech: ""`).
     - L'utilisateur peut laisser un bloc purement logique/architectural (« Aucune stack / Bloc neutre ») ou lui attribuer une stack technique via les presets 1-clic (`STACK_PRESETS_BY_SHAPE`) ou en saisie libre.
   - **Liaisons directionnelles** : 4 points d'ancrage cardinaux (Haut, Droite, Bas, Gauche) sur chaque bloc permettant de relier les composants avec affichage du protocole (`REST`, `gRPC`, `Kafka`, etc.).
   - **Dock inférieur (Tool Box)** : Positionné en bas au centre du canevas, réductible, regroupant l'onglet **Composants** et l'onglet **Stack technique**.
2. **Analyse IA (`scanner`)** :
   - Analyse de la topologie, détection des points uniques de défaillance (SPOF) et vérification de cohérence des versions de stack.
   - Application des correctifs suggérés en 1 clic directement sur le graphe.
3. **Simulateur (`simulator`)** :
   - Curseur d'injection de trafic (1 000 à 20 000 req/s) calculant en temps réel le taux de charge, la saturation et la latence de chaque bloc, avec ajout rapide de répliques.
4. **Documentation (`docs`)** :
   - Génération et mise à jour automatique de la documentation d'architecture, des *Architecture Decision Records* (ADR) et des contrats d'interface à partir de l'état du graphe.
5. **Versions (`versions`)** :
   - Historique des snapshots d'architecture liés aux commits et aux tags/releases GitHub (`v2.4.0`, `v2.3.1`, etc.) et création de nouvelles releases.
6. **Équipe (`team`)** :
   - Constitution d'équipe projet sur le modèle GitHub : recherche de profils de la communauté par `@handle`, invitation de collaborateurs, attribution des rôles (`Owner`, `Maintainer`, `Write`, `Triage`, `Read`), gestion des sous-équipes (`@lonkoo-org/core-architecture`, `@lonkoo-org/security-reviewers`, `@lonkoo-org/backend-squad`) et règles de protection de branche.

### 2.5. Communauté, Templates & Réseau d'Architectes (`/palabre` & `/palabre/[slug]`)
- **Trois vues complémentaires** :
  1. `Architectures` : Catalogue des architectures et templates publiés par la communauté.
  2. `Profils & Architectes` : Annuaire des utilisateurs avec recherche par nom, `@handle`, entreprise ou compétence technique.
  3. `Abonnements` : Flux filtré sur les architectes suivis par l'utilisateur.
- **Fonctionnalités sociales & d'échange** :
  - Compteurs d'**abonnés** (*followers*), d'**abonnements** (*following*), de modèles publiés et de forks reçus.
  - Bouton interactif **Suivre / Abonné** sur chaque carte et dans la fiche profil modale.
  - Invitation directe d'un profil communautaire dans une équipe projet.
- **Fork modulaire & Évaluations (`/palabre/[slug]`)** :
  - **Fork complet** de toute l'architecture ou **Fork partiel** en sélectionnant uniquement certains sous-graphes à greffer dans un projet existant ou nouveau (public ou privé).
  - Système de **notation (1 à 5 étoiles)** et de **commentaires** horodatés avec mention de la version testée.

### 2.6. Revues d'Architecture & Discussions (`/reviews`)
- **Modèle Pull Request appliqué à l'architecture** :
  - Examen des propositions de modification (`#42`, `#39`, `#35`), visualisation du différentiel d'architecture et de stack (`Ajout`, `Modification`), pré-vérification de cohérence, approbation par les pairs, demande de modifications et fusion avec tag Git.
- **Canal d'échange collaboratif** :
  - Messagerie d'équipe organisée par salons (`#architecture-core`, `#revue-stack`, `#releases-git`) avec référence directe aux composants et versions.

### 2.7. Déploiement : Serveur MCP, Orion & GitHub (`/deploy`)
- **Serveur MCP (Model Context Protocol)** : Génère la configuration SSE/JSON permettant aux agents IA (*Claude Code*, *Antigravity / Gemini*, *Cursor*) de lire la topologie, les versions de stack et les ADR pour implémenter le code dans le modèle choisi.
- **Constructeur Orion** : Synchronisation des briques architecturales vers le site builder Orion.
- **Liaison GitHub Releases** : Association de chaque version de l'architecture à une release ou un tag Git du dépôt.

---

## 3. Architecture Technique & Structure du Dépôt

### Stack Technique
- **Framework** : Next.js `16.4.2` (App Router, Turbopack)
- **UI & Rendu** : React `19.2.4`, TypeScript `5.9.3`
- **Styles** : Tailwind CSS `v4` (`src/styles/globals.css`)
- **Icônes** : `@phosphor-icons/react`
- **Animations Landing Page** : `gsap` + HTML5 `<canvas>` 2D haute densité

### Arborescence Principale
```text
Lonkoo-front/
├── public/
│   └── frames-bg/                         # 120 frames JPG pour l'animation scroll de la landing page
├── src/
│   ├── app/
│   │   ├── layout.tsx                     # Root layout (polices Space Grotesk, Plus Jakarta Sans, JetBrains Mono)
│   │   ├── page.tsx                       # Landing page animée (sombre en haut -> blanc dès le cycle ingénieur)
│   │   ├── dashboard/page.tsx             # Bibliothèque de projets (Public/Privé, Forks, accès Équipe & Studio)
│   │   ├── studio/page.tsx                # Studio (Architecture, Analyse IA, Simulateur, Docs, Versions, Équipe)
│   │   ├── palabre/
│   │   │   ├── page.tsx                   # Communauté (Architectures, Profils & Architectes, Abonnements)
│   │   │   └── [slug]/page.tsx            # Route dynamique SSG d'un template communautaire
│   │   ├── reviews/page.tsx               # Revues d'architecture (Pull Requests) & Canal de discussion d'équipe
│   │   ├── deploy/page.tsx                # Pont d'implémentation MCP, Orion Site Builder & Releases GitHub
│   │   ├── onboarding/page.tsx            # Configuration initiale de l'organisation et des stacks favorites
│   │   └── settings/page.tsx              # Paramètres d'organisation, membres, clés MCP et webhooks
│   ├── components/
│   │   ├── FrameBackgroundCanvas.tsx      # Rendu canvas interpolé des frames au scroll sur la landing page
│   │   ├── HeroArchitectureCanvas.tsx     # Animation vectorielle interactive au premier plan du Hero
│   │   ├── layout/
│   │   │   └── AppSidebar.tsx             # Shell applicatif : Sidebar gauche + Navbar réductible en bulle
│   │   ├── studio/
│   │   │   └── ArchitectureWhiteboard.tsx # Tableau blanc navigable (Trackpad pan/zoom, formes, dock inférieur)
│   │   └── palabre/
│   │       └── BlueprintDetailClient.tsx  # Vue détaillée d'un modèle, fork complet/partiel, notes et avis
│   ├── lib/
│   │   └── lonkoo-data.ts                 # Modèles de données typés et état initial (nœuds, projets, profils, PR)
│   └── styles/
│       └── globals.css                    # Configuration Tailwind v4 et variables CSS
├── package.json
└── tsconfig.json
```

---

## 4. Directives Strictes de Design & Standards Frontend

Ces règles doivent être respectées sans exception lors de toute modification :

1. **Zéro esthétique « générée par IA » (Pas de bulles pastel ni de transparence diluée)** :
   - **Interdit** : Les pilules/bulles à fond teinté et bordure colorée du type `rounded-full bg-sky-50 border border-sky-200 text-sky-700`, `bg-emerald-50 border-emerald-200`, ainsi que les modificateurs d'opacité diluée (`bg-white/90`, `bg-sky-50/80`, `border-slate-200/80`, `backdrop-blur`).
   - **Standard requis** : Utiliser des surfaces **100 % opaques, franches et nettes** (`bg-white`, `bg-slate-50`, `bg-slate-100`, `border-slate-200`, `bg-[#1265DD]`, `bg-slate-900`) dans l'esprit des standards industriels modernes (Linear, GitHub, Vercel).
2. **Zéro méta-texte ou répétition du prompt dans l'interface** :
   - Ne jamais afficher de libellés auto-descriptifs tels que *« Tableau blanc navigable Draw.io »*, *« Modèle Git »*, *« Modèle Pull Request »*, *« Boîte à Outils (Tool Box) »*, *« Conventions : BD = cylindre... »* ou des codes `[ECR-XX]`.
   - Les intitulés doivent être courts, directs et orientés action (*Architecture*, *Composants*, *Stack technique*, *Équipe*, *Fusionner*, *Suivre*).
3. **Responsivité prioritaire sur écrans moyens (`md: 768px–1024px` et `lg: 1024px–1280px`)** :
   - Les barres d'outils et d'onglets doivent rester compactes sur une seule ligne avec défilement horizontal fluide (`overflow-x-auto`) sans écraser le contenu ni provoquer de retours à la ligne disgracieux sur tablette et portable 13".
4. **Thème post-connexion** :
   - Thème clair (`#F8FAFC` / `#FFFFFF`) avec accent bleu (`#1265DD`).

---

## 5. Commandes Utiles

```bash
# Vérification stricte du typage TypeScript
npm run typecheck

# Lancement du serveur de développement (port 3001)
npm run dev

# Compilation de production (arrêter le serveur actif avant de lancer le build sous Windows)
npm run build

# Démarrage du serveur de production (port 3001)
npm run start
```
