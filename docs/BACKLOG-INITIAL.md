# Backlog initial

À copier dans GitHub Projects (une ligne = un élément du tableau). Chaque élément a une priorité, un responsable et une date cible.

Le détail du backend (lots, ordre de travail, contrats, risques, ordre de coupe) est dans [ROADMAP-BACKEND.md](ROADMAP-BACKEND.md).

**Priorités :** Indispensable, Important, À couper.

**Responsables (proposition du 2026-10-16, à valider en équipe) :** Diagne = qualité, sécurité, démo ; Fall = interface et canvas ; Gaye = génération et déploiement ; Ngom = IA ; Pouye = backend et temps réel. Un élément « en binôme » nomme les deux personnes : la seconde relit et peut reprendre.

## Jalons

| Date | Jalon |
|---|---|
| Vendredi 16 octobre | Dépôt structuré et privé, décisions techniques prises, contrat du canvas, VPS acheté |
| Dimanche 18 octobre | **Squelette en ligne en HTTPS**, déployé par le pipeline (front, `/actuator/health`, PostgreSQL, serveur temps réel) |
| Mercredi 21 octobre | Trois tranches terminées : canvas collaboratif persistant ; connexion GitHub, versions, export ; IA, génération, envoi GitHub |
| Jeudi 22 octobre | Parcours indispensable de bout en bout **sur la production**. Ce qui ne marche pas est coupé |
| Vendredi 23 octobre | Gel du périmètre. Audit des licences, tests, sécurité, déclarations, vidéo de secours |
| Samedi 24 octobre, midi | Soumission (marge d'un jour) |
| Dimanche 25 octobre, 17 h | Date limite absolue |
| Dimanche 25, 18 h au lundi 26, 23 h 59 | Vote de chaque membre (5 sur 5) |

## Recevabilité (à faire en premier)

- [ ] Vérifier l'inscription de l'équipe sur Datacloud : membres, représentant, répartition du prix, pays — *Diagne, 16/10*
- [ ] Acheter le Serveur Cloud Business (2 vCPU, 8 Go) à Dakar avec le code promo, après la réponse sur Docker, root et remises — *Diagne, 17/10*
- [ ] Lire `docs.systalink.com` dans un navigateur (l'accès automatique est refusé) et compléter `docs/DEPLOIEMENT.md` : SSH, Docker, API, régions. Le relevé des pages publiques est déjà fait — *Gaye, 17/10*
- [ ] Envoyer le message prêt de `docs/QUESTIONS-ORGANISATEUR.md` à cadev@systalink.com et par WhatsApp (+221 76 660 40 41), puis noter les réponses — *Diagne, 16/10, aujourd'hui*
- [ ] Inviter les 4 autres membres au dépôt (rôle Write), désactiver le « squash » dans les réglages, chacun lance `pre-commit install` — *Pouye, 16/10*
- [ ] Squelette en ligne en HTTPS (étapes 1 à 3 de `docs/DEPLOIEMENT.md`) — *Gaye avec Pouye, 18/10*

## Contrats (avant d'écrire le code qui en dépend)

- [x] Contrat du canvas : `docs/schema-canvas.md` et `docs/canvas.schema.json` — *fait le 16/10, relecture par Fall, Pouye, Ngom, Gaye*
- [ ] `openapi.yaml` de l'API publique et de l'API interne (routes de `docs/architecture.md`) — *Pouye avec Fall, 17/10*
- [ ] Choix du fournisseur et du modèle d'IA, noté dans `docs/architecture.md` et `docs/IA.md` — *Ngom, 17/10*

## Indispensable

- [ ] Frontend : canvas React Flow avec les 8 types de blocs du contrat, dont les blocs locaux (paiement mobile, messagerie SMS / USSD / WhatsApp, facturation), génériques et sans logo de marque — *Fall, 20/10*
- [ ] Export du schéma en JSON (instantané conforme au contrat) et en Mermaid — *Fall, 21/10*
- [ ] Temps réel : serveur Hocuspocus, présence, curseurs, synchronisation, chargement et sauvegarde via le backend — *Pouye, 19/10*
- [ ] Temps réel : ticket court délivré par le backend, vérifié à la connexion, contrôle d'accès par canvas — *Pouye, 19/10*
- [ ] Backend : squelette Spring Boot (Log4j2, Spring Data JDBC, Flyway, `/actuator/health`) — *Pouye, 17/10*
- [ ] Backend : connexion GitHub côté serveur, projets, canvas, droits d'accès — *Pouye, 20/10*
- [ ] Backend : compte invité éphémère avec une copie du modèle d'exemple (`docs/exemples/`) — *Pouye, 20/10*
- [ ] Backend : instantanés nommés (versions) et restauration — *Pouye, 21/10*
- [ ] IA : esquisse d'architecture depuis un cahier des charges, sortie validée par le schéma — *Ngom, 21/10*
- [ ] IA : audit d'architecture (points de défaillance unique, failles, surcoûts), consultatif — *Ngom, 21/10*
- [ ] IA : quota par utilisateur, plafond de coût, délai maximal, démo enregistrée de secours — *Ngom avec Pouye, 21/10*
- [ ] Génération du projet de démarrage depuis un instantané : entités du schéma, docker-compose, README avec schémas Mermaid, `openapi.yaml` — *Gaye, 21/10*
- [ ] Envoi sur GitHub : création du dépôt et commit initial avec la session de l'utilisateur — *Gaye, 21/10*
- [ ] Déploiement des applications générées sur le VPS, avec suivi de l'état (si trop risqué au 21/10 : plan B de `docs/DEPLOIEMENT.md`) — *Gaye, 22/10*
- [ ] Sécurité de base : jetons non stockés, aucun secret dans les journaux, journal des actions, validation des identifiants du générateur — *Diagne avec Pouye, 22/10*
- [ ] Tests : trois tests de fumée et un test de bout en bout (`docs/architecture.md`) — *Diagne, 22/10*
- [ ] Compte de démonstration utilisable sans inscription, première page claire en 30 secondes — *Diagne avec Fall, 22/10*

## Important

- [ ] Comparaison visuelle de deux versions (ajouts en vert, suppressions en rouge, modifications en orange)
- [ ] IA : complétion de sous-graphe sur un bloc sélectionné
- [ ] Génération des DTO et des contrôleurs
- [ ] Partage en lecture seule par lien, copie d'un canvas
- [ ] Export SVG et PNG

## À couper ou à reporter (dans cet ordre si le calendrier glisse)

- [ ] Annuler / rétablir
- [ ] Commentaires ancrés sur un bloc
- [ ] Galerie publique de modèles
- [ ] SystaDrive (introuvable dans l'offre publique)
- [ ] Dimensionnement automatique des instances (garder au plus une recommandation simple)
- [ ] Branches d'expérimentation (garder les instantanés)
- [ ] Protocoles réseau détaillés (gRPC, etc.)
- [ ] Plus de 8 types de blocs

## Qualité et conformité (en continu)

- [ ] Tenir `docs/IA.md` et `docs/LICENCES-TIERCES.md` à jour dans chaque pull request — *tous*
- [ ] Rendre bloquant le contrôle de licences Maven dès que le `pom.xml` existe — *Pouye, dès le premier `pom.xml`*
- [x] Produire un SBOM (npm et Maven) pour la déclaration des composants — *Diagne, 23/10* : fait le 25/10, `docs/sbom/` (CycloneDX 1.6, vérifié par la CI)
- [ ] Audit complet des licences (22 et 23 octobre), y compris les images Docker — *Diagne*
- [ ] Sauvegarde quotidienne de PostgreSQL et restauration testée — *Gaye, 22/10*
- [ ] Tests du parcours complet sur l'adresse de production, après un redémarrage du serveur — *Diagne, 22/10*
- [ ] Démo de secours enregistrée — *Diagne, 23/10*
- [ ] Rédiger les déclarations de soumission (titularité de chaque membre, composants, IA) — *Diagne, chacun pour la sienne, 23/10*
- [ ] Nettoyer les textes de travail avant la soumission (`LICENSE`, `[à préciser]`, notes internes) — *Diagne, 23/10*
- [ ] Rappel : voter, les 5 membres, du 25 octobre 18 h au 26 octobre 23 h 59 — *tous*
