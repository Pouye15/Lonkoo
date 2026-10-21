# Proposition : modèle de blocs du front et contrat du canvas (décision D2)

> Rédigée le 2026-10-21 par Pouye (backend). Destinataires : Fall (interface), Ngom (IA), Gaye (génération). Le contrat du canvas ne change que par une pull request relue par ces trois personnes et Pouye : ce document en est le texte, **rien n'a été modifié dans `canvas.schema.json`**.

## Le problème

Le contrat décrit 8 types de blocs (`webapp`, `service`, `database`, `auth`, `queue`, `mobile-payment`, `messaging`, `billing`), avec des `data` précis, et refuse tout champ inconnu (`additionalProperties: false`). Le front dessine 12 formes (`generic`, `cylinder`, `user`, `gateway`, `service`, `queue`, `cache`, `security`, `ai` et les trois blocs locaux) et porte beaucoup d'autres données : titre, stack, version, groupe, description, statut, métriques, latence, débit, réplicas, port, variables d'environnement.

Tant que les deux modèles ne sont pas reliés, **aucune version ne peut être enregistrée depuis un canvas dessiné par le front** (le validateur du backend répond 422), et le générateur n'a pas de base valide.

## Proposition : deux couches

Le contrat est un modèle **sémantique** (valider, générer du code). Le front est un modèle de **présentation et de simulation**. Ils ne sont pas identiques et n'ont pas à l'être.

1. **Dans le document partagé** (voir `schema-canvas.md`, « Précisions pour le front ») : une entrée de bloc porte `type`, `position` et `data`, qui suivent le contrat, et une clé facultative **`ui`** pour tout ce qui est propre au front (forme dessinée, statut, métriques, latence, débit, réplicas, port, variables d'environnement, version, groupe, description). Le serveur temps réel **ignore `ui` dans l'instantané** (déjà fait et testé) : les réglages du simulateur restent partagés entre utilisateurs sans toucher au contrat.
2. **Correspondance des formes** :

   | Forme du front | `type` du contrat | Remarque |
   |---|---|---|
   | `cylinder` | `database` | |
   | `security` | `auth` | `data.method` à choisir (`github`, `password`, `otp-sms`) |
   | `service` | `service` | |
   | `queue` | `queue` | |
   | `mobile-payment`, `messaging`, `billing` | identiques | |
   | `gateway`, `cache`, `ai`, `generic` | `generic` (nouveau) | ignoré par le générateur |
   | `user` | `generic` (nouveau) | un utilisateur n'est pas une application à générer |
   | (absent du front) | `webapp` | **à ajouter à la boîte à outils** : « Application web » |

   La forme dessinée est conservée dans `ui.shape`, pour qu'un `generic` s'affiche en passerelle, cache, IA ou utilisateur.
3. **Liens** : le protocole du front devient `kind` (`REST / HTTP3` et `gRPC` : `http` ; `Kafka / Events` et `Redis PubSub` : `event` ; `TCP / TLS` : `data`), son texte est gardé dans `label`, le débit dans `ui.throughput`.
4. **Identifiant technique** : `data.name` doit respecter `^[a-z][a-z0-9_]{0,30}$`, être unique dans le canvas et ne pas être un mot réservé Java, SQL ou YAML. Le front le déduit du titre (minuscules, `_`, suffixe numérique si doublon) ; le titre lui-même va dans `data.label`.

## Changements demandés au contrat (une seule pull request)

Autorisés en version 1 (`schema-canvas.md`, section « Évolution » : un champ facultatif ou un nouveau type de bloc), à faire dans la même pull request que l'exemple et le tableau des types :

- **Nouveau type `generic`**, avec `data` : `name` (identifiant), `label` facultatif, `tech` facultatif, `description` facultative (texte de 300 caractères au plus). Ignoré par le générateur.
- **Champ facultatif `tech`** (texte de 80 caractères au plus) sur chaque `data_*` : la stack choisie par l'utilisateur (« Spring Boot », « PostgreSQL 16 »…). **Jamais inséré dans du code, un nom de fichier ou une commande** (règle des libellés). Il permet de garder « aucune stack » (absent) ou une stack libre.

Le schéma n'est pas modifié ici : il le sera dans la pull request, après relecture.

## Ce que cela demande au front (Fall)

- Écrire dans Yjs selon `schema-canvas.md` : trois cartes de premier niveau, une `Y.Map` par entrée, valeurs simples remplacées en entier, suppression d'un bloc avec ses liens.
- Ranger tout champ propre au front dans `ui`.
- Ajouter le bloc « Application web ».
- Un éditeur de propriétés qui modifie les `data` du contrat. **L'éditeur d'entités et de champs d'une base est le plus important** : sans lui le projet généré n'a aucun modèle de données, et c'est ce que le jury verra.
- Désactiver l'édition pour les rôles `READ` et `TRIAGE` (champ `role` du ticket).

## Pourquoi pas les alternatives

- **Le front n'adopte que les 8 types** : il perd la passerelle, le cache, l'IA, l'utilisateur et le « bloc libre sans stack » (exigence de son `CLAUDE.md`).
- **Le contrat passe à 12 types** : le générateur et l'IA doivent traiter des types sans effet sur le code, et le contrat perd sa rigueur.
- **Ne rien changer** : le front reste une maquette, sans enregistrement de versions ni génération.

## Ce qui reste hors de cette proposition

La génération d'un éditeur d'entités par le générateur, le choix du moteur de gabarits et la liste des mots réservés du générateur (celle du validateur du backend est une base, à compléter par Gaye).

## Message à envoyer à Fall

> Fall, le serveur temps réel et le backend sont prêts à recevoir le canvas : tout est décrit dans `docs/schema-canvas.md` (section « Précisions pour le front »), et la proposition pour réconcilier ton modèle de blocs avec le contrat est dans `docs/PROPOSITION-MODELE-DE-BLOCS.md`. En résumé : le document Yjs ne contient que `type`, `position` et `data` du contrat, plus une clé `ui` pour tout ce qui est propre à ton interface (forme, simulateur, statut…) que le serveur ignore à l'enregistrement d'une version. Deux ajouts au contrat sont proposés (type `generic`, champ `tech`), à relire avec Ngom et Gaye. Peux-tu me dire aujourd'hui si ça te convient, et quand tu peux brancher le canvas sur `/ws` ?
