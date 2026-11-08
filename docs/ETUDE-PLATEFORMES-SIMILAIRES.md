# Plateformes similaires et fonctions à envisager

Étude du 5 novembre 2026, pour décider quoi ajouter à LONKOO avant la soumission du 20 novembre (15 jours). Elle compare LONKOO à des plateformes proches, relève ce qu'elles font et que nous ne faisons pas, et classe des propositions. **Rien ici n'est décidé** : ce sont des recommandations à discuter.

## En bref

1. **Aucune plateforme trouvée ne fait toute la chaîne de LONKOO** : modèle d'architecture partagé en temps réel, puis projet complet (backend, interface, base, documentation, workflow), puis GitHub, puis déploiement. Chacune couvre un morceau (§ 2). C'est notre différence, à défendre devant le jury.
2. **Nos écarts les plus visibles ne sont pas des fonctions absentes, ce sont des onglets qui sont encore des maquettes** (§ 3) : le score de l'« Analyse IA » est une constante, le « Simulateur » ne suit pas les liens du schéma. Un jury qui clique dessus le verra. Les rendre réels est le meilleur rapport effet/risque.
3. **Quatre fonctions que proposent des concurrents directs et qui nous manquent** : les commentaires ancrés sur un élément, les modèles de départ, la documentation et les décisions d'architecture (ADR) intégrées, et le suivi d'un collaborateur à l'écran.
4. **À ne pas faire maintenant** : branches et fusion de schémas, balayage d'un vrai compte cloud, génération Terraform, serveur MCP (sécurité). Raisons au § 6.

## 1. Méthode et limites

- 23 recherches web ; 14 pages officielles ou d'éditeur ouvertes et lues le 05/11/2026 (5 autres étaient inaccessibles ou redirigées) ; puis vérification dans notre code de ce que LONKOO fait déjà, et de la licence des bibliothèques citées (registre npm).
- **Plusieurs références ne sont connues que par les résultats de recherche, sans que la page ait été ouverte** : [13] (mode maintenance), [14], [15], [16], [17], [19], [21], [23], [24], [25], [26]. Elles sont signalées « selon des tiers » ou « résultats de recherche » dans le texte.
- **Les outils n'ont pas été essayés** : les fonctions décrites sont celles que leurs pages et leurs documentations annoncent.
- Beaucoup de sources sont des pages de vendeurs ou des comparatifs de tiers, parfois écrits par un concurrent (l'article « meilleurs outils 2026 » est publié par IcePanel). **Les tarifs ne sont pas vérifiés.**
- **Non trouvé** : les critères de notation de CADev 2026 (aucune page publique trouvée) ; le « mode suivi » de Miro (non confirmé par sa page) ; les commentaires et les modèles d'Excalidraw et de tldraw.
- Les **estimations d'effort** (§ 4) sont celles de l'assistant, d'après le code existant : à confirmer par la personne qui développerait.

## 2. Panorama : qui fait quoi

| Famille | Plateformes | Ce qui est remarquable | Ce qui leur manque par rapport à LONKOO |
|---|---|---|---|
| Modèle d'architecture partagé | **IcePanel** [1][12] | Un seul modèle (C4) dont les diagrammes sont des vues : « modifier un objet une fois, il change partout » ; **brouillons** pour concevoir l'architecture future avant de la fusionner ; **flux** (séquences de messages sur les diagrammes) ; **décisions** et commentaires de lecteurs ; liens de partage en lecture sans compte ; API, SDK et MCP | Ne génère aucun code |
| | **Structurizr**, **LikeC4** [5][7] | Architecture en tant que code ; **ADR** (identifiant, date, statut, graphe des liens entre décisions) ; vues interactives intégrables dans une documentation ; serveur MCP (LikeC4) | Pas de collaboration en temps réel ni de génération de projet |
| Diagrammes collaboratifs généralistes | **Miro**, **Lucidchart**, **draw.io** [1][8][23] | Commentaires, curseurs, vote, minuteur, **présentation**, plus de 7 000 modèles (Miro) ; draw.io : stockage dans GitHub, application hors ligne ; Lucid : génération par IA à partir d'un texte ou d'un fichier | Aucun modèle de données derrière le dessin : ni contrat, ni code |
| Diagrammes par texte et IA | **Eraser** [1][2][3] | Diagramme par prompt, par code ou **depuis un dépôt GitHub** ; diagram-as-code ; documents techniques avec diagrammes ; **Eraserbot** (intégration CI qui garde les diagrammes à jour) ; API et MCP | Pas de génération du projet |
| | **Mermaid Chart** | Diagrammes en code | (page officielle inaccessible : non étudié) |
| Cloud et infrastructure | **AWS Infrastructure Composer** [4], **Cloudcraft** [15], **Brainboard** [16] | Composer : **synchronisation dans les deux sens** entre le schéma et le code (CloudFormation) ; Cloudcraft : schéma lu depuis un compte réel, **estimation de coût**, comparaison prévu et déployé ; Brainboard : Terraform généré, détection de dérive, workflow Git | Limités à l'infrastructure cloud, pas à l'application |
| Modèle de données vers code | **JHipster** (JDL Studio) [17], **Amplication** [13] | JHipster : entités et relations dessinées puis application Spring Boot générée, régénération des seules entités modifiées (`--force` écrase les modifications locales) ; Amplication : modèle de données, code livré en **pull request** sur le dépôt de l'équipe, système de plugins. **Amplication est en mode maintenance** (son équipe travaille sur un autre produit) : source faible, à vérifier | Pas de collaboration en temps réel, pas de schéma d'architecture complet |
| Schéma de base de données | **ChartDB**, dbdiagram.io, drawSQL [18] | Import du schéma d'une base existante ; export SQL, DBML, image ; ChartDB annonce de l'IA (clés et index manquants) : annonce du site de ChartDB lui-même, non retrouvée dans sa documentation | Uniquement la base de données |
| Application par prompt | **Lovable**, **Bolt.new**, v0 [6][24] | Lovable : **synchronisation GitHub dans les deux sens**, une branche à la fois, commits attribués au membre ; v0 : interface seulement | Pas de modèle d'architecture : le prompt est la seule source |
| Revue d'architecture par IA | Agent de revue open source de Microsoft [10], Visual Paradigm [25] | **Points uniques de défaillance, goulots, anti-patterns** (base partagée, absence de passerelle), composants sans redondance, dépendances entrantes et sortantes de chaque composant, composants orphelins ; **risques classés de Critique à Faible** avec recommandation ; présenté comme un copilote, jamais comme un remplaçant | Ne dessine ni ne génère un projet complet |
| Simulation de charge | SystemDesignSim, simulateurs navigateur, systemInPain [19] | Capacité, latence et taux de panne par composant ; **composants surchargés signalés, avec la correction suggérée** (ajouter des répliques) ; p99, disponibilité, coût | Jouets d'apprentissage, sans lien avec un vrai projet |

**Positionnement.** LONKOO relie ce que les autres séparent : le schéma collaboratif (comme IcePanel, Miro), le modèle de données (comme JHipster, ChartDB), la génération du projet (comme Amplication, Lovable) et le déploiement. Notre différence n'est donc pas une fonction isolée mais la chaîne complète, sur un cloud local (Dakar), avec des blocs génériques adaptés au contexte (paiement mobile, SMS, USSD, WhatsApp).

## 3. Ce que LONKOO fait déjà, et ses écarts (vérifiés dans le code)

**Acquis** : édition en temps réel avec curseurs et présence, rôles, liens de partage révocables, projets publics, versions nommées avec **comparaison visuelle**, restauration, exports (Mermaid, JSON, SVG, PNG), panneau de propriétés (entités, champs, endpoints), discussion d'équipe par projet, génération d'un projet complet (backend Spring Boot, interface Next.js, migration, OpenAPI, Docker, workflow de déploiement, **documentation avec schémas Mermaid que GitHub affiche nativement** [11]), envoi sur GitHub, déploiement.

**Écarts constatés dans notre propre produit** (à connaître avant la défense) :

| Constat | Détail vérifié | Conséquence |
|---|---|---|
| Le **score de l'« Analyse IA » n'est pas calculé** | `aiHealthScore = min(100, 86 + 5 × suggestions appliquées)` dans `studio/page.tsx` ; les suggestions viennent d'une liste fixe | Un score de 86 est affiché pour n'importe quel schéma. Contraire à la règle « aucune donnée inventée présentée comme réelle » du front. **Corrigé le 8 novembre 2026 (A1).** |
| Le **simulateur** ne suit pas le graphe | Chaque bloc reçoit le même débit global (`simulatedRps / maxRpsCapacity`) ; les liens ne servent pas | Un goulot en aval n'est jamais vu comme la conséquence d'un amont |
| L'**envoi sur GitHub est unique** | `PublicationService` répond « Ce projet est déjà envoyé sur GitHub » | Après un changement du schéma, impossible de mettre à jour le dépôt : il faut tout refaire |
| Le **projet généré n'a aucun test** | Aucun `src/test` ni dépendance de test dans les écrivains du générateur | Le jury qui ouvre le dépôt généré ne voit pas de test |
| L'onglet **Documentation** de l'interface est une maquette | Il affiche des sections fixes (`AI_DOC_SECTIONS`) ; « Actualiser » fabrique un texte local après une attente simulée (`setTimeout`). La vraie documentation n'existe que dans le dépôt généré | L'interface montre autre chose que ce que le dépôt contiendra |
| Pas de **commentaires ancrés**, de **copie** d'un canvas, de **modèles** | Déjà dans « à couper » du backlog | Fonctions présentes chez tous les concurrents de la famille collaborative |

## 4. Fonctions candidates, avec les preuves du marché

Chaque ligne dit qui le fait (numéros entre crochets : voir les Sources), ce que cela donnerait chez nous, et la contrainte. **Effort** = estimation de l'assistant, en jours-personne.

### A. Rendre réel ce qui est une maquette

| ID | Fonction | Qui le fait | Chez nous | Effort | Contrainte et risque |
|---|---|---|---|---|---|
| A1 | **Audit d'architecture par règles** avec gravités | Agent Microsoft, Visual Paradigm [10] | Fonctions pures sur l'instantané : point unique de défaillance (une seule base, sans réplique), base partagée par plusieurs services, absence de bloc d'authentification devant une interface et une API, paiement mobile sans file de messages, blocs orphelins, dépendances entrantes et sortantes de chaque bloc ; chaque règle donne une gravité et une correction. L'IA (Fallou) explique et propose, elle ne décide pas du score | 2 à 3 | Aucun changement du contrat. Testable règle par règle, avec test « sans la règle ». Dire clairement « règles » et « IA ». **Remplace le score constant.** **Fait le 8 novembre 2026** : `frontend/src/lib/audit.ts` (10 règles), `components/studio/AuditPanel.tsx`, parcours `e2e/scenarios/06-audit.mjs` |
| A2 | **Simulateur qui suit les liens** | Simulateurs navigateur [19] | Le débit entre par l'interface, se propage aux blocs liés (partage et amplification éditables), chaque bloc a une capacité et une latence ; surcharges signalées avec la correction suggérée (répliques). Valeurs de départ éditables, stockées dans la clé `ui` | 3 à 4 | **Ne pas inventer de chiffres** : afficher « modèle simplifié, valeurs d'exemple modifiables ». Sinon, étiqueter l'onglet « démonstration » |
| A3 | **Documentation = aperçu du dépôt généré** | Eraser (documents et diagrammes), Structurizr [2][5] | L'onglet affiche ce que `DocsWriter` écrit (schéma Mermaid, modèle de données, OpenAPI) | 1 à 2 | Réutilise l'existant : aucun risque de divergence. Bibliothèque Mermaid : MIT |
| A4 | **Décisions d'architecture (ADR)** | Structurizr, IcePanel [5][12] | Liste de décisions par projet (titre, date, statut, texte), liées à des blocs, écrites dans `docs/adr/` du dépôt généré ; l'IA peut en rédiger (`lonkoo_generate_adr`, prévu dans `frontend/AGENT.md`) | 2 à 3 | Table et routes nouvelles, hors contrat du canvas |

### B. Collaboration

| ID | Fonction | Qui le fait | Chez nous | Effort | Contrainte et risque |
|---|---|---|---|---|---|
| B1 | **Commentaires ancrés sur un bloc**, avec résolution | Miro, Lucid, IcePanel (commentaires de lecteurs) [1][8][12] | Réutilise la table de la discussion avec un identifiant de bloc ; fil par bloc, « résolu » ; compteur sur le bloc | 3 à 4 | Déjà au backlog (« à couper »). S'appuie sur la discussion déjà faite |
| B2 | **Suivre un collaborateur** | tldraw (présence avec viewport, suivi) [9] | Ajouter la zone visible à la présence (awareness) et un bouton « Suivre » | 1 | Très visible en démonstration. Une nouvelle information de présence, rien d'enregistré |
| B3 | **Mode présentation** | Miro [8] | Plein écran en lecture seule, blocs parcourus un à un | 1 à 2 | Utile pour la défense. Sans changement de contrat |
| B4 | **Parcours (flows) superposés** | IcePanel [1][12] | Mettre en évidence une suite de liens (« le paiement d'une commande ») | 3 à 4 | **Touche au modèle** : où stocker un parcours ? À relire avec l'équipe si cela sort de la clé `ui` (le contrat ne change que par pull request relue) |
| B5 | **Fil d'activité** (qui a changé quoi) | Cloudcraft, Figma (historique) [14][15] | Afficher le journal d'audit déjà en base | 1 à 2 | Voir la confidentialité : ne montrer que des actions de projet |

### C. Importer, exporter, démarrer vite

| ID | Fonction | Qui le fait | Chez nous | Effort | Contrainte et risque |
|---|---|---|---|---|---|
| C1 | **Modèles de départ** (4 à 6) | Miro (plus de 7 000 modèles) [8] | Marché de proximité, paiement mobile, e-santé, école, tontine, logistique : des canvas validés par le schéma, choisis à la création du projet | 1 à 2 | Très faible risque, **fort effet en démonstration**. Respecter la règle : blocs génériques, aucune marque |
| C2 | **Copie d'un canvas** (fork) | pratique courante (Figma, GitHub), non vérifiée dans cette recherche | Copier l'état dans un nouveau canvas | 1 à 2 | Déjà au backlog |
| C3 | **Importer du SQL** (entités et champs d'un bloc base de données) ; **exporter SQL ou DBML** | dbdiagram.io, ChartDB [18] | Analyseur de DDL vers les entités du contrat ; export inverse | 2 | `node-sql-parser` : Apache 2.0 (vérifié). Les types hors contrat sont refusés avec un message |
| C4 | **Importer OpenAPI** (endpoints d'un service) | — (aucun outil trouvé qui combine OpenAPI et diagrammes) [21] | Analyser `openapi.yaml` vers les endpoints d'un bloc service | 1 à 2 | `@apidevtools/swagger-parser` : MIT, `yaml` : ISC (permissive, hors de notre liste écrite : à déclarer) |
| C5 | **Importer un `docker-compose.yml`** (blocs d'après les images) | bck-nd-hlpr, Infragenie [21] | Reconnaître base, file, interface, service d'après les noms d'images | 2 à 3 | Heuristique : toujours montrer ce qui a été deviné. Aucun outil n'est la référence |
| C6 | **Exporter en DSL Structurizr ou en `.drawio`** | Structurizr, draw.io [1][5] | Fonction pure sur l'instantané ; évite l'enfermement | 1 à 2 | Fort intérêt pour un public d'architectes |
| C7 | **Image à jour d'un schéma dans un README** | Eraser, selon un tutoriel de tiers (diagrammes intégrables au README, mis à jour avec Eraser) [26] | Route publique d'une image SVG pour un projet public | 2 | **Vie privée** : jamais pour un projet privé ; contrôle d'accès à tester |
| C8 | **Serveur MCP en lecture** | IcePanel, Eraser, LikeC4 [1][2][7] | Outils `lonkoo_get_architecture`, audit, export, déjà décrits dans `frontend/AGENT.md` | 2 à 3 | **Sécurité** : jetons par personne et par projet à concevoir ; `@modelcontextprotocol/sdk` : MIT. Pas avant que A1 existe |

### D. Génération

| ID | Fonction | Qui le fait | Chez nous | Effort | Contrainte et risque |
|---|---|---|---|---|---|
| D1 | **Tests dans le projet généré** | (constat interne, § 3) | Un test de fumée du backend généré et son exécution dans le job `projet-genere` | 1 à 2 | Le job vérifie déjà le démarrage ; ajouter `mvn test` |
| D2 | **Mettre à jour un dépôt existant par pull request** | Amplication (une pull request par changement, selon des tiers), Lovable (synchronisation dans les deux sens), JHipster (`--force` écrase) [6][13][17] | Regénérer et ouvrir une pull request sur le dépôt déjà envoyé, au lieu de l'écraser | 5 à 8 | **Trop gros pour 15 jours** : il faut fusionner avec le code que la personne a modifié. À garder pour la suite et à dire au jury |

### E. Réseau et accès

| ID | Fonction | Qui le fait | Chez nous | Effort | Contrainte et risque |
|---|---|---|---|---|---|
| E1 | **Persistance locale hors ligne** | tldraw (file d'attente locale, synchronisation au retour) [9] | `y-indexeddb` (MIT, vérifié) : un rechargement sans réseau garde les modifications | 1 | Pertinent pour les connexions instables. **À vérifier d'abord** : le comportement actuel au rechargement hors ligne n'a pas été testé |
| E2 | **Disposition automatique** des blocs | non vérifié dans cette recherche | `@dagrejs/dagre` (MIT) pour ranger un schéma importé ou généré par l'IA | 1 à 2 | **Pas `elkjs`** : licence EPL ou GPL, refusée par notre règle |

## 5. Recommandation pour les 15 jours

Priorité à ce qu'un jury **voit et clique**, avec des tests, sans toucher au contrat du canvas.

1. **A1** Audit par règles, qui remplace le score constant.
2. **C1** Modèles de départ (le meilleur effet en démonstration pour le moins d'effort).
3. **B1** Commentaires ancrés sur un bloc.
4. **A3** Documentation réelle (aperçu du dépôt), puis **A4** si le temps le permet.
5. **A2** Simulateur qui suit les liens, **ou**, si le temps manque, **étiqueter l'onglet « démonstration »** plutôt que laisser croire à un calcul.

Petites victoires, à glisser entre deux : **B2** (suivi), **B3** (présentation), **D1** (tests générés), **C6** (export DSL).

Effort cumulé des cinq premières : entre 10 et 15 jours-personne (sans A4), à répartir sur plusieurs personnes.

## 6. À ne pas faire maintenant

| Idée | Qui la fait | Pourquoi pas |
|---|---|---|
| Branches et fusion de schémas | Figma [14], IcePanel (brouillons) | Gros (conflits à résoudre) ; le backlog garde les versions nommées ; la comparaison visuelle existe déjà |
| Lire un vrai compte cloud pour dessiner l'existant | Cloudcraft, Lucidscale [15][23] | Demande des identifiants cloud : risque de sécurité et hors périmètre |
| Générer du Terraform | Brainboard [16] | Une autre promesse : notre déploiement passe par Docker Compose |
| Estimer le coût en argent | Cloudcraft [15] | Il faudrait des tarifs réels : règle « aucun chiffre inventé » |
| Analyse de menaces automatique (STRIDE) | outils open source et IA, par exemple STRIDE GPT [20] | Sans expert humain, les résultats trompent ; à citer comme piste, pas à promettre |
| 250 intégrations, milliers de modèles | Miro [8] | Hors d'échelle pour cinq personnes |
| `elkjs` | — | Licence refusée (EPL ou GPL) |

## 7. Questions à poser

- **À l'organisateur** (avec la question déjà écrite sur les projets générés, A-22) : quels sont les critères de notation du jury (originalité, complétude, qualité du code, défense) ? Je n'ai trouvé aucune page publique de CADev 2026. Les priorités du § 5 dépendent de la réponse.
- **À l'équipe** : A1 et A4 touchent à l'IA (Fallou) ; B1 et A3 touchent à l'interface (Fall) ; C1 est du contenu que tout le monde peut écrire.

## Sources

Pages consultées le 05/11/2026. Lues en entier : [1] à [12], [18] (documentation) ; les autres ne sont connues que par les résultats de recherche (voir § 1) :

1. IcePanel, comparatif 2026 (blog du concurrent) : <https://icepanel.io/blog/best-collaborative-software-architecture-diagramming-tools-2026>
2. Eraser AI : <https://eraser.io/ai>
3. Eraser, diagrammes de dépôt et Eraserbot : <https://docs.eraser.io/codebase-diagrams>
4. AWS Infrastructure Composer : <https://aws.amazon.com/application-composer/features>
5. Structurizr, décisions : <https://docs.structurizr.com/server/decisions>
6. Lovable, intégration GitHub : <https://docs.lovable.dev/integrations/github>
7. LikeC4 : <https://likec4.dev/>
8. Miro, fonctions : <https://miro.com/features/>
9. tldraw, collaboration : <https://tldraw.dev/sdk-features/collaboration>
10. Agent de revue d'architecture (Microsoft, blog) : <https://techcommunity.microsoft.com/t5/educator-developer-blog/stop-drawing-architecture-diagrams-manually-meet-the-open-source/ba-p/4496271>
11. GitHub, diagrammes dans Markdown : <https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams>
12. IcePanel, documentation : <https://docs.icepanel.io/getting-started>
13. Amplication, dépôt : <https://github.com/amplication/amplication> ; mode maintenance (source de tiers, faible) : <https://hn.jakechampion.name/reader/https://amplication.com/blog/plugging-into-mongodb>
14. Figma, branches : <https://www.figma.com/blog/introducing-branching-space-to-iterate-and-explore-freely/>
15. Cloudcraft (Datadog) : <https://datadoghq.com/product/cloudcraft> et <https://www.cloudcraft.co/solutions>
16. Brainboard (page de l'éditeur) : <https://www.brainboard.co/llms.txt>
17. JHipster, entités et JDL : <https://www.jhipster.tech/creating-an-entity>
18. ChartDB, documentation : <https://docs.chartdb.io/docs/welcome.md> ; comparatif du même éditeur : <https://www.chartdb.io/blog/dbdiagram-vs-drawio-vs-chartdb>
19. Simulateurs : <https://github.com/javanhut/SystemDesignSim>, <https://dev.to/code_sherpa/how-i-simulated-a-distributed-system-in-the-browser-40m4>, <https://www.producthunt.com/p/systeminpain/systeminpain>
20. STRIDE GPT (analyse de menaces par IA) : <https://pypi.org/project/stride_gpt>
21. Import depuis du code : <https://pypi.org/project/bck-nd-hlpr/1.0.5/>, <https://conf.researchr.org/details/ecsa-2025/ecsa-2025-tools---demos/2/Infragenie-Living-Software-Architecture-Diagrams-From-Docker-Compose-Files>
23. Lucid, diagrammes par IA : <https://app.lucid.co/platform/intelligent-diagramming>
24. Comparatif Lovable, Bolt, v0 (blog de tiers) : <https://dev.to/rupa_tiwari_dd308948d710f/lovable-vs-bolt-vs-v0-which-ai-app-builder-should-you-use-in-2026-15mp>
25. Visual Paradigm, critique de modèle par IA : <https://guides.visual-paradigm.com/?p=4081>
26. Eraser, tutoriel de tiers : <https://aiindigo.com/tutorials/getting-started-with-eraser-visualize-systems-via-code-and-ai>

Licences : relevées sur le registre npm le 05/11/2026 : `@dagrejs/dagre` MIT, `y-indexeddb` MIT, `@modelcontextprotocol/sdk` MIT, `mermaid` MIT, `jspdf` MIT, `@apidevtools/swagger-parser` MIT, `node-sql-parser` Apache-2.0, `yaml` ISC, `elkjs` EPL-2.0 ou GPL-3.0. Toute dépendance ajoutée se déclare dans `LICENCES-TIERCES.md` et se reporte dans le SBOM.
