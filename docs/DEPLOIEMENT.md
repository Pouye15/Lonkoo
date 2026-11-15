# Déploiement

Deux déploiements différents, à ne pas confondre :

| | Quoi | Qui le fait | Comment |
|---|---|---|---|
| **A** | Lonkoo lui-même (recevabilité du concours : projet en ligne) | GitHub Actions | Construction des images, envoi sur le VPS par SSH, `docker compose up -d` |
| **B** | Les applications générées par les utilisateurs (fonction du produit) | Le backend de Lonkoo (déclenchement et suivi), puis GitHub Actions | Lonkoo lance le workflow `deploy-systalink.yml` du dépôt de la personne (`workflow_dispatch`, avec son jeton) ; ce workflow se connecte en SSH au serveur de la personne avec les secrets de **son** dépôt et lance `docker compose` (mode manuel de repli) |

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
- **Option MCP.** Elle est pensée pour des agents IA et ne dit pas qu'elle lance un `docker compose` arbitraire. Notre décision reste **le workflow GitHub Actions qui se connecte en SSH puis lance `docker compose`** (voir `architecture.md`). Le MCP pourra servir pour la création du serveur et la supervision, à tester seulement si la documentation montre un gain.
- **À valider avant d'acheter** (questions dans `QUESTIONS-ORGANISATEUR.md`) : accès root ou sudo en SSH, Docker autorisé, ville du datacenter, application des remises.

## Étape 0 : acheter et préparer (une personne, à faire en premier)

- [ ] Lire `https://docs.systalink.com` dans un navigateur et noter dans ce fichier : accès SSH, Docker, API, régions.
- [ ] Obtenir la réponse de l'organisateur sur Docker, root et remises (message prêt dans `QUESTIONS-ORGANISATEUR.md`).
- [ ] Acheter le Serveur Cloud **Business** (ou équivalent), au meilleur prix avec le code promo, en vérifiant que la région est Dakar. Noter l'adresse IP, le système, les ressources.
- [ ] Choisir l'adresse publique : un nom de domaine ou sous-domaine dont l'enregistrement A pointe vers l'IP (le domaine est un achat séparé chez Systalink). Sans domaine, repli possible avec un nom de type `IP.sslip.io` (service tiers, à tester).
- [ ] Une fois l'adresse connue : créer l'**application OAuth GitHub de production** ([GITHUB-OAUTH.md](GITHUB-OAUTH.md), § 2), adresse de retour `https://<adresse>/api/auth/github/callback`. Le backend refuse de démarrer en production sans son identifiant et son secret.

## Ce qui est prêt dans le dépôt (lot R7)

| Fichier | Rôle |
|---|---|
| `infra/docker-compose.prod.yml` | Caddy, interface, backend, temps réel, PostgreSQL. Seuls les ports 80 et 443 sont publiés ; PostgreSQL n'est joignable que par le backend ; santé de chaque service ; droits Linux retirés aux services applicatifs ; mémoire bornée ; journaux en rotation |
| `infra/Caddyfile`, `infra/caddy.Dockerfile` | HTTPS automatique, `/api`, `/ws`, interface ; `/internal/*` jamais exposé ; corps limités à 2 Mio ; **aucun journal d'accès** (le jeton d'un lien de partage est dans l'adresse, S-07). Configuration intégrée à l'image : un déploiement la met toujours à jour |
| `infra/production.env.example` | Modèle du `.env` du serveur (secrets, domaine, réglages facultatifs) |
| `.github/workflows/deploy.yml` | Pipeline : envoi du code par SSH, construction sur le serveur, démarrage, vérification de l'extérieur |
| `infra/backup.sh`, `infra/restore.sh` | Sauvegarde `pg_dump` quotidienne vérifiée avec rotation ; restauration de test (sans toucher à la production) et restauration réelle |
| Job CI « Pile de production » | Démarre ce compose avec des secrets jetables, en HTTPS, et rejoue le parcours, un redémarrage, une sauvegarde et sa restauration à chaque pull request |

**Ce qui a été essayé avant le serveur :** le Caddyfile réel devant la pile locale (routes, `/internal` en 404, corps de 3 Mio en 413, WebSocket, aucun jeton de partage dans les journaux) ; le compose contre le schéma officiel de Compose ; la sauvegarde, la rotation, la restauration de test et une **restauration réelle après perte de données** avec PostgreSQL 16 ; les scripts avec `shellcheck`, les workflows avec `actionlint`. **Jamais essayé en vrai :** les images construites par Docker sur le serveur, le certificat Let's Encrypt, le pare-feu du VPS, la clé SSH de déploiement : c'est le but des étapes ci-dessous.

## Étape 1 : préparer et durcir le serveur

À faire une seule fois, en SSH sur le serveur (root ou sudo). **Gardez une seconde connexion ouverte** jusqu'à avoir testé celle de `deploy` : une erreur ici peut vous enfermer dehors.

```bash
# Utilisateur de déploiement, accès par clé seulement.
adduser --disabled-password --gecos "" deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
echo "ssh-ed25519 AAAA… lonkoo-deploy" >> /home/deploy/.ssh/authorized_keys   # clé PUBLIQUE de l'étape 3
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys

# Docker (Compose v2.20 ou plus : l'option --wait est utilisée) et mises à jour de sécurité automatiques.
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
systemctl enable --now docker
docker compose version
apt-get install -y unattended-upgrades

# Dossiers de l'application.
install -d -o deploy -g deploy /opt/lonkoo /opt/lonkoo/backups

# Pare-feu : SSH, HTTP, HTTPS (et HTTP/3 en UDP). Docker contourne ufw pour les ports qu'il publie : seuls 80 et 443 le sont.
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
```

Depuis **un autre terminal**, vérifiez que `ssh -i lonkoo-deploy deploy@<adresse>` fonctionne, puis seulement alors interdisez le mot de passe et la connexion de root :

```bash
printf 'PasswordAuthentication no\nPermitRootLogin no\n' > /etc/ssh/sshd_config.d/10-lonkoo.conf
sshd -t && systemctl reload ssh
```

Rappel : un utilisateur du groupe `docker` équivaut à root sur la machine. La clé de déploiement ne vit que dans les secrets GitHub.

## Étape 2 : configuration du serveur et premier démarrage à la main

Le premier démarrage se fait à la main : les erreurs s'y lisent tout de suite, au lieu de passer par le pipeline.

1. **DNS** : l'enregistrement `A` de l'adresse pointe vers l'IP du serveur (`dig +short <adresse>`). Sans cela Caddy n'obtient pas de certificat.
2. **`.env` du serveur** (depuis votre poste, une seule fois ; ce fichier ne quitte plus le serveur) :

   ```bash
   scp infra/production.env.example deploy@<adresse>:/opt/lonkoo/.env
   ssh deploy@<adresse> "chmod 600 /opt/lonkoo/.env && nano /opt/lonkoo/.env"
   ```

   Remplir `DOMAIN`, `POSTGRES_PASSWORD`, `REALTIME_TICKET_SECRET`, `REALTIME_SERVICE_TOKEN` (trois secrets **différents**, `openssl rand -hex 32`), puis `GITHUB_OAUTH_CLIENT_ID` et `GITHUB_OAUTH_CLIENT_SECRET` de l'application de production (étape 0).

   **IA (facultative)** : sans `AI_PROVIDER`, les routes d'IA répondent 501 et l'interface l'indique ; il n'y a rien d'autre à faire. Pour l'activer, décommenter `AI_PROVIDER=agent_ia` et renseigner `AI_API_KEY` (la clé du fournisseur, qui ne vit que dans ce fichier). Ajouter `AI_SERVICE_TOKEN` (`openssl rand -hex 16`) est conseillé : à défaut, le jeton du temps réel sert aussi à l'IA. Le service `agent_ia` est construit et démarré dans tous les cas ; il ne répond qu'au backend.
3. **Envoi du code et démarrage** (depuis la racine du dépôt) :

   ```bash
   tar czf - backend realtime frontend agent_ia infra | ssh deploy@<adresse> "mkdir -p /opt/lonkoo/app && tar xzf - -C /opt/lonkoo/app"
   ssh deploy@<adresse> "cd /opt/lonkoo/app && docker compose -f infra/docker-compose.prod.yml --env-file /opt/lonkoo/.env up -d --build --wait"
   ```

   La première construction prend 5 à 10 minutes (les images Java et Next.js). Puis : `https://<adresse>/api/actuator/health` répond `{"status":"UP"}`, `https://<adresse>` affiche la page d'accueil, `http://<adresse>` redirige vers `https://`.

| Message ou symptôme | Cause probable |
|---|---|
| `Définir XXX dans le .env du serveur` | Variable absente ou vide : la commande nomme laquelle |
| Le backend redémarre en boucle, `Configuration de production refusée : …` | Valeur d'exemple (`change-me`), deux secrets identiques, secret trop court ou `DOMAIN` qui désigne la machine locale : le message nomme les variables, jamais leurs valeurs |
| Caddy ne sert que du `http`, ou répond une erreur TLS | DNS qui ne pointe pas encore vers le serveur, ou ports 80 et 443 fermés : `docker compose logs caddy` |
| La construction s'arrête avec `Killed` ou le code de sortie 137 | Mémoire insuffisante : Next.js demande plus de 2 Go à la construction, un serveur de 8 Go est prévu |
| La construction s'arrête sur `path … not found` (un dossier comme `agent_ia`) | Ce dossier n'a pas été envoyé au serveur : la liste de la commande `tar` doit contenir tous les dossiers que le compose construit (`scripts/check_deploiement.py` le vérifie) |

## Étape 3 : pipeline (déploiement A)

1. **Clé de déploiement**, sur votre poste (jamais sur le serveur) :

   ```bash
   ssh-keygen -t ed25519 -N "" -C lonkoo-deploy -f lonkoo-deploy
   ```

   La partie publique (`lonkoo-deploy.pub`) va dans `/home/deploy/.ssh/authorized_keys` (étape 1) ; la partie privée dans le secret GitHub, puis **supprimez le fichier de votre poste**.
2. **Secrets du dépôt** (Settings, Secrets and variables, Actions) :

   | Secret | Contenu |
   |---|---|
   | `SYSTALINK_SSH_HOST` | adresse du serveur |
   | `SYSTALINK_SSH_USER` | `deploy` |
   | `SYSTALINK_SSH_PRIVATE_KEY` | contenu de `lonkoo-deploy` |
   | `SYSTALINK_SSH_KNOWN_HOSTS` | résultat de `ssh-keyscan -t ed25519 <adresse>` (le pipeline vérifie l'identité du serveur) |
   | `PRODUCTION_DOMAIN` | l'adresse publique, sans `https://` |

   Les secrets de l'application (base, temps réel, GitHub) ne sont **pas** dans GitHub : ils sont dans `/opt/lonkoo/.env`, que le pipeline ne touche jamais.
3. **Lancer** : onglet Actions, workflow « Déploiement », *Run workflow*. Ensuite, chaque fusion dans `main` redéploie. Tant que les secrets manquent, une fusion ne déploie rien (un avis le dit) et un lancement manuel échoue en les nommant.
4. **Ce que fait le pipeline** : envoie `backend`, `realtime`, `frontend`, `agent_ia` et `infra` par SSH (le dossier remplace l'ancien d'un coup), reconstruit et relance la pile (`up -d --build --wait`), puis vérifie **de l'extérieur** : santé du backend et du temps réel, interface en mode API, route interne en 404, et un parcours d'invité (session, projet d'accueil, canvas, instantané lu à travers le temps réel). Il échoue, avec l'état et les derniers journaux de la pile, si l'une de ces vérifications échoue.
5. **Retour arrière** : *Run workflow* avec `ref` égal à un commit antérieur de `main`.

**À savoir : les sessions sont en base** (Spring Session JDBC, migration V13) : un déploiement ou un redémarrage ne déconnecte plus personne, et un invité garde son projet. Une seule chose est perdue : **le jeton GitHub, gardé en mémoire du serveur par choix** (le recopier dans la table des sessions le mettrait en clair dans les sauvegardes). Après un redémarrage, une personne reste connectée mais doit reconnecter GitHub avant d'envoyer un projet (l'interface le propose). Les données sont conservées (volume `pgdata`). Évitez malgré tout de déployer pendant la période de notation, et ne renommez ni ne déplacez la classe `CurrentUser` (voir `SessionCompatibilityTest`).

## Sauvegarde et restauration

```bash
# Une fois, sur le serveur, en tant que deploy : sauvegarde tous les jours à 2 h 15 (heure du serveur).
( crontab -l 2>/dev/null; echo '15 2 * * * /opt/lonkoo/app/infra/backup.sh >> /opt/lonkoo/backups/backup.log 2>&1' ) | crontab -

# Premier essai à la main, puis la PREUVE que la sauvegarde sert : restauration dans une base temporaire (la production n'est pas touchée).
/opt/lonkoo/app/infra/backup.sh
/opt/lonkoo/app/infra/restore.sh --test /opt/lonkoo/backups/lonkoo-AAAAMMJJ-HHMMSS.dump
```

`restore.sh --test` affiche le nombre d'utilisateurs et de projets retrouvés ; à refaire après chaque changement important. En cas de catastrophe : `CONFIRM=oui /opt/lonkoo/app/infra/restore.sh --live <fichier>` arrête le backend et le temps réel, **remplace** la base par la sauvegarde, puis les relance.

Les sauvegardes sont gardées 14 jours sur le serveur. Une sauvegarde sur la machine qu'elle protège ne couvre pas la perte du serveur : copiez régulièrement `/opt/lonkoo/backups` ailleurs (`scp`, `rsync`), en plus des sauvegardes automatiques du VPS.

## Exploitation

```bash
cd /opt/lonkoo/app
docker compose -f infra/docker-compose.prod.yml --env-file /opt/lonkoo/.env ps               # état et santé
docker compose -f infra/docker-compose.prod.yml --env-file /opt/lonkoo/.env logs -f backend  # journaux (aussi : realtime, caddy…)
docker compose -f infra/docker-compose.prod.yml --env-file /opt/lonkoo/.env restart backend
```

- **Jamais `docker compose down -v`** : le volume `caddy_data` garde le certificat (Let's Encrypt limite les émissions) et `pgdata` toutes les données.
- Le certificat se renouvelle seul : les ports 80 et 443 doivent rester ouverts.
- Redémarrage du serveur : Docker se relance au démarrage et `restart: unless-stopped` remonte la pile. À essayer une fois (`sudo reboot`) avant la soumission, puis vérifier la santé et les données.
- Disque : `docker system df`, puis `docker image prune -f` si besoin (le pipeline le fait après chaque déploiement).

### Limites du canvas en direct

Le serveur temps réel coupe deux abus (code `realtime/src/limits.js`) : une connexion qui envoie plus de 100 messages par seconde en moyenne (rafale de 300) ou plus de 4 Mio en 10 s est fermée avec le code **4429** ; une modification qui ferait dépasser 4 Mio à l'état d'un canvas est refusée et la connexion qui l'a envoyée est fermée avec le code **4413**. Un navigateur normal en est très loin (curseurs : 20 messages par seconde au plus). Au-dessus de 4 Mio seules les petites modifications (déplacer, supprimer) passent, pour qu'un canvas trop plein puisse être allégé, et au double plus rien ne passe : on le ramène alors à une version enregistrée avec « restaurer » dans l'application. Le backend refuse de son côté en 413 un état de plus de 16 Mio.

- **Voir les coupures** : `docker compose … logs realtime | grep "limite appliquée"` (au plus une ligne par minute et par cause).
- **Si une limite gêne de vraies personnes** : dans le `.env` du serveur, `REALTIME_LIMITS_MODE=log` (journalise sans rien refuser) ou `off`, puis `docker compose … up -d realtime`. Sans reconstruire d'image. Les valeurs se règlent par `REALTIME_MAX_MESSAGES_PER_SECOND`, `REALTIME_MAX_BYTES_PER_10S`, `REALTIME_MAX_STATE_BYTES` (0 désactive une limite), voir `infra/production.env.example`.
- **Ce que voit la personne** : après 4429, le bandeau « Connexion perdue, reconnexion en cours… » puis le retour du canvas. Après 4413, un bandeau rouge « Ce canvas est trop volumineux… » avec « Recharger », le canvas en lecture seule et aucune reconnexion (le navigateur garde la modification refusée et la renverrait à chaque reconnexion, une seconde après chaque coupure).
- **Canvas au double du plafond** (8 Mio par défaut, ce qui demande un usage délibéré) : même la poignée de main d'une personne qui peut écrire est refusée, donc le canvas se fige dès son ouverture en écriture. La lecture seule continue de marcher. Issue : restaurer une version (onglet Versions, qui passe par l'API et n'est pas soumis à la limite).

## Étape 4 : déploiement B (applications générées)

Le projet généré contient son propre workflow `.github/workflows/deploy-systalink.yml`. Lonkoo le lance dans le dépôt GitHub de la personne et suit son exécution ; **le serveur de Lonkoo ne se connecte à aucune machine** et ne détient aucune clé : l'hôte et la clé SSH sont des secrets du dépôt de la personne. Sans les autorisations GitHub nécessaires (`repo` et `workflow`) ou sans le fichier, le déploiement passe en **mode manuel** : Lonkoo affiche les étapes à suivre soi-même.

- Le gabarit `docker-compose` généré est fixe ; seuls les identifiants validés du schéma y sont insérés.
- Chaque application : limites de mémoire et de processeur, pas de mode privilégié, pas de montage de l'hôte, réseau dédié, `restart: unless-stopped`.
- Exposition : un sous-domaine par projet derrière Caddy (exige un DNS joker pour le certificat) ou une plage de ports publics pour la démo. **À décider après l'étape 2**, selon ce que permet le DNS de Systalink.
- Le backend suit l'exécution du workflow (en attente, en cours, déployé, échoué) et l'affiche à l'utilisateur ; il n'appelle jamais l'adresse publique saisie, il l'affiche seulement.
- Plan B si cette fonction n'est pas prête au gel du périmètre : la génération et l'envoi sur GitHub restent, et l'interface affiche les commandes de déploiement à exécuter à la main.

## Avant la soumission

- [ ] Parcours complet testé sur l'adresse de production, avec un navigateur sans session.
- [ ] Le serveur a été redémarré une fois : tout repart seul, les données sont conservées, et une personne connectée l'est toujours (les sessions sont en base ; seul le jeton GitHub est perdu : reconnecter GitHub avant un envoi).
- [ ] Sauvegarde `pg_dump` quotidienne en place et une restauration testée.
- [ ] Secrets de production différents de ceux de développement ; aucune valeur `change-me`.
- [ ] Journaux relus : aucun secret ni jeton.
- [ ] Compte de démonstration (invité) utilisable sans inscription, et vidéo de secours enregistrée.
