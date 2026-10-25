# Déploiement

Deux déploiements différents, à ne pas confondre :

| | Quoi | Qui le fait | Comment |
|---|---|---|---|
| **A** | Lonkoo lui-même (recevabilité du concours : projet en ligne) | GitHub Actions | Construction des images, envoi sur le VPS par SSH, `docker compose up -d` |
| **B** | Les applications générées par les utilisateurs (fonction du produit) | Le backend de Lonkoo | SSH vers un hôte dédié, `docker compose` avec un gabarit fixe |

Le déploiement A passe en premier : sans lui, le projet n'est pas noté. Le B se construit ensuite sur la même base.

## Contraintes (d'après `DECLARATIONS-SOUMISSION.md`, à confirmer dans le règlement)

- Projet déployé et accessible en ligne avant la soumission.
- Au moins un produit Datacloud acheté avec le code promo de l'équipe ; un VPS à Dakar garde la remise (les VPS hors Dakar en sont exclus).

## Ce que Systalink publie (relevé du 2026-10-16)

Source : pages publiques de Systalink, lues le 16/10/2026. À revérifier au moment de l'achat. La documentation `https://docs.systalink.com` refuse l'accès automatique : **elle doit être lue dans un navigateur** par la personne responsable du déploiement.

| Sujet | Ce que dit la page | Source |
|---|---|---|
| Serveur Cloud (VPS) | Starter : 1 vCPU, 2 Go, 50 Go NVMe, 10 233 FCFA/mois. Business : 2 vCPU, 8 Go, 100 Go NVMe, 31 486 FCFA/mois. Performance : 6 vCPU, 16 Go, 320 Go, 75 566 FCFA/mois. Linux ou Windows. Sauvegardes automatiques incluses. Ressources modifiables à tout moment | [server-cloud](https://systalink.com/fr/server-cloud) |
| Non précisé sur cette page | Ville du datacenter (Dakar n'y est pas citée), accès SSH ou root, Docker, domaine et certificat inclus ou non | idem |
| Connexion MCP | Point d'accès `mcp.systalink.com`, clé d'API propre à la connexion, périmètre choisi par service et par action. Actions : déployer sur un service existant, provisionner un nouveau projet, configurer, surveiller, diagnostiquer. Services : application web, base de données, stockage d'objets, serveurs cloud, hébergement, domaine. Aucun exemple de code ni liste d'outils nommés | [connexion-mcp](https://systalink.com/fr/connexion-mcp) |
| Concours | Prix de 5 000 000 FCFA. « -40 % sur les produits DataCloud pour les équipes qui participent » et « -70 % pour tous les participants pendant toute l'année 2026 ». Règlement : lien « Voir les conditions générales » sans contenu visible. Contact : cadev@systalink.com, WhatsApp +221 76 660 40 41 | [page CADev](https://systalink.com/fr/coupe-afrique-des-developpeurs-cadev) |

Conséquences pour nous :

- **Taille du serveur.** Le Starter (2 Go) est trop juste pour PostgreSQL, Spring Boot, Next.js, le serveur temps réel et Caddy ensemble, et une construction d'image Next.js dépasse facilement 2 Go. **Estimation de l'équipe, à confirmer par un essai** : prendre le **Business (2 vCPU, 8 Go)**. Si les remises s'appliquent à ce produit : 31 486 FCFA/mois deviennent environ 18 900 FCFA (-40 %) ou 9 400 FCFA (-70 %). L'application des remises au Serveur Cloud, et à Dakar, n'est pas confirmée.
- **Option MCP.** Elle est pensée pour des agents IA et ne dit pas qu'elle lance un `docker compose` arbitraire. Notre décision reste **SSH puis `docker compose`** (voir `architecture.md`). Le MCP pourra servir pour la création du serveur et la supervision, à tester seulement si la documentation montre un gain.
- **À valider avant d'acheter** (questions dans `QUESTIONS-ORGANISATEUR.md`) : accès root ou sudo en SSH, Docker autorisé, ville du datacenter, application des remises.

## Étape 0 : acheter et préparer (une personne, à faire en premier)

- [ ] Lire `https://docs.systalink.com` dans un navigateur et noter dans ce fichier : accès SSH, Docker, API, régions.
- [ ] Obtenir la réponse de l'organisateur sur Docker, root et remises (message prêt dans `QUESTIONS-ORGANISATEUR.md`).
- [ ] Acheter le Serveur Cloud **Business** (ou équivalent), au meilleur prix avec le code promo, en vérifiant que la région est Dakar. Noter l'adresse IP, le système, les ressources.
- [ ] Choisir l'adresse publique : un nom de domaine ou sous-domaine dont l'enregistrement A pointe vers l'IP (le domaine est un achat séparé chez Systalink). Sans domaine, repli possible avec un nom de type `IP.sslip.io` (service tiers, à tester).

## Étape 1 : durcir le VPS

- [ ] Créer un utilisateur `deploy`, accès SSH par clé uniquement, connexion root et mot de passe désactivés.
- [ ] Pare-feu : seuls les ports 22, 80 et 443 sont ouverts.
- [ ] Installer Docker et Docker Compose ; mises à jour de sécurité automatiques.
- [ ] Attention : un utilisateur du groupe `docker` équivaut à root sur la machine. La clé SSH de déploiement n'est donc stockée que dans les secrets GitHub (déploiement A) et dans l'environnement du backend (déploiement B), jamais dans le dépôt.

## Étape 2 : « hello world » en HTTPS

But : valider le domaine, le certificat, le pare-feu et le pipeline avant d'écrire du code métier.

- [ ] Déposer [infra/Caddyfile](../infra/Caddyfile) sur le VPS avec `DOMAIN=<votre adresse>`.
- [ ] Un service de test derrière Caddy répond sur `/` (par exemple une page statique), puis le certificat est obtenu automatiquement.
- [ ] Vérifier : `https://<adresse>` répond avec un certificat valide, `http://` redirige vers `https://`, un port fermé n'est pas joignable.

## Étape 3 : pipeline du déploiement A

1. À la fusion dans `main`, un workflow GitHub Actions construit les images (frontend, backend, temps réel).
2. Il les envoie sur un registre (GitHub Container Registry : **vérifier les quotas du dépôt privé**) ou, à défaut, les images sont construites sur le VPS.
3. Il se connecte en SSH (secrets `SYSTALINK_SSH_HOST`, `SYSTALINK_SSH_USER`, `SYSTALINK_SSH_PRIVATE_KEY`) et lance `docker compose -f infra/docker-compose.prod.yml pull && up -d`.
4. Il vérifie `/actuator/health` et échoue si l'application ne répond pas.

`infra/docker-compose.prod.yml` et les Dockerfiles sont à écrire avec le premier code de chaque service : PostgreSQL sans port publié, volume nommé, `healthcheck`, `restart: unless-stopped`, les secrets venant d'un `.env` présent sur le serveur uniquement.

## Étape 4 : déploiement B (applications générées)

- Le gabarit `docker-compose` généré est fixe ; seuls les identifiants validés du schéma y sont insérés.
- Chaque application : limites de mémoire et de processeur, pas de mode privilégié, pas de montage de l'hôte, réseau dédié, `restart: unless-stopped`.
- Exposition : un sous-domaine par projet derrière Caddy (exige un DNS joker pour le certificat) ou une plage de ports publics pour la démo. **À décider après l'étape 2**, selon ce que permet le DNS de Systalink.
- Le backend suit l'état (conteneur démarré, santé de l'application) et l'affiche à l'utilisateur.
- Plan B si cette fonction n'est pas prête au gel du périmètre : la génération et l'envoi sur GitHub restent, et l'interface affiche les commandes de déploiement à exécuter à la main.

## Avant la soumission

- [ ] Parcours complet testé sur l'adresse de production, avec un navigateur sans session.
- [ ] Le serveur a été redémarré une fois : tout repart seul, les données sont conservées, et une personne connectée l'est toujours (les sessions sont en base ; seul le jeton GitHub est perdu : reconnecter GitHub avant un envoi).
- [ ] Sauvegarde `pg_dump` quotidienne en place et une restauration testée.
- [ ] Secrets de production différents de ceux de développement ; aucune valeur `change-me`.
- [ ] Journaux relus : aucun secret ni jeton.
- [ ] Compte de démonstration (invité) utilisable sans inscription, et vidéo de secours enregistrée.
