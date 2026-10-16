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

## Étape 0 : acheter et préparer (une personne, à faire en premier)

- [ ] Acheter le VPS à Dakar avec le code promo. Noter l'adresse IP, le système et les ressources (mémoire, disque).
- [ ] Choisir l'adresse publique : un nom de domaine ou sous-domaine dont l'enregistrement A pointe vers l'IP. Sans domaine, repli possible avec un nom de type `IP.sslip.io` (service tiers, à tester).
- [ ] Lire la documentation Systalink (interface, API, MCP) et noter ce qui est réellement disponible dans `docs/` : l'avis sur l'option « MCP / API » en dépend.

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
- [ ] Le serveur a été redémarré une fois : tout repart seul, les données sont conservées.
- [ ] Sauvegarde `pg_dump` quotidienne en place et une restauration testée.
- [ ] Secrets de production différents de ceux de développement ; aucune valeur `change-me`.
- [ ] Journaux relus : aucun secret ni jeton.
- [ ] Compte de démonstration (invité) utilisable sans inscription, et vidéo de secours enregistrée.
