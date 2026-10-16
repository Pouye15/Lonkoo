# Backlog initial

À copier dans GitHub Projects (une ligne = un élément du tableau). Mettez une étiquette de priorité à chaque élément et un responsable.

**Priorités :** Indispensable, Important, À couper.

## Jalons

| Date | Jalon |
|---|---|
| Vendredi 16 octobre | Dépôt créé, décisions techniques prises, squelette du projet |
| Jeudi 22 octobre | Parcours indispensable de bout en bout |
| Vendredi 23 octobre | Gel du périmètre. Audit des licences, tests, sécurité, déclarations |
| Samedi 24 octobre | Soumission (marge d'un jour) |
| Dimanche 25 octobre, 17 h | Date limite absolue |

## Indispensable

- [ ] Frontend : canvas React Flow avec 6 à 8 types de blocs personnalisés
- [ ] Export du schéma en JSON et en Mermaid
- [ ] Temps réel : serveur y-websocket, présence, curseurs, synchronisation
- [ ] Temps réel : authentification des connexions et contrôle d'accès par canvas
- [ ] Backend : connexion avec GitHub, canvas, projets
- [ ] Backend : instantanés nommés (versions) et restauration
- [ ] IA : esquisse d'architecture depuis un cahier des charges
- [ ] IA : audit d'architecture (points de défaillance unique, failles, surcoûts)
- [ ] Génération du projet de démarrage : entités du schéma, docker-compose, README avec schémas Mermaid, openapi.yaml
- [ ] Envoi sur GitHub : création du dépôt et commit initial
- [ ] Déploiement réel sur un VPS Systalink (GitHub Actions, SSH, docker compose) avec suivi de l'état
- [ ] Sécurité de base : jetons non stockés ou chiffrés, pas de secret dans les journaux, quota IA, journal des actions
- [ ] Compte de démonstration et données d'exemple

## Important

- [ ] Comparaison visuelle de deux versions (ajouts en vert, suppressions en rouge, modifications en orange)
- [ ] IA : complétion de sous-graphe sur un bloc sélectionné
- [ ] Commentaires ancrés sur un bloc
- [ ] Galerie publique de modèles, copie d'un canvas, partage en lecture seule par lien
- [ ] Blocs et modèles locaux : paiement mobile, SMS / USSD, WhatsApp, facturation (blocs génériques, sans logo de marque, sans intégration réelle)
- [ ] Génération des DTO et des contrôleurs
- [ ] Annuler / rétablir, export SVG et PNG

## À couper ou à reporter

- [ ] SystaDrive (introuvable dans l'offre publique)
- [ ] Dimensionnement automatique des instances (garder au plus une recommandation simple)
- [ ] Branches d'expérimentation (garder les instantanés)
- [ ] Protocoles réseau détaillés (gRPC, etc.)
- [ ] Plus de 8 types de blocs

## Qualité et conformité (à faire en parallèle)

- [ ] Décision Hibernate (Spring Boot 4 ou sans JPA) et Logback (Log4j2) avant le premier code du backend
- [ ] Lire la documentation Systalink (MCP et API) et tester un déploiement
- [ ] Acheter le produit Datacloud avec le code promo
- [ ] Tenir `docs/IA.md` et `docs/LICENCES-TIERCES.md` à jour
- [ ] Audit complet des licences (22 et 23 octobre)
- [ ] Tests du parcours complet sur l'adresse de production
- [ ] Démo de secours enregistrée
- [ ] Soigner la première page (30 premières secondes)
- [ ] Rédiger les déclarations de soumission (titularité, composants, IA)
- [ ] Rappel : voter, les 5 membres, du 25 octobre 18 h au 26 octobre 23 h 59
