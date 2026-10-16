# Contrat du canvas (version 1)

Le canvas est la donnée centrale du projet : l'interface, le temps réel, le backend, l'IA et le générateur en dépendent tous. Ce document et [canvas.schema.json](canvas.schema.json) sont **la référence**. Toute modification passe par une pull request relue par les responsables de l'interface, du backend, de l'IA et de la génération.

Exemple complet : [exemples/marketplace-mobile.canvas.json](exemples/marketplace-mobile.canvas.json). Il sert aussi de modèle de démonstration.

## Principes

1. **Un seul format JSON**, versionné par `schemaVersion` (actuellement `1`). Une évolution incompatible crée la version 2 et une migration.
2. **Deux représentations, un même contenu.**
   - *État courant* : document Yjs, en base sous forme binaire. Il est modifié en direct par l'interface.
   - *Instantané* : ce JSON, validé par le schéma. Il sert aux versions nommées, à l'export, à l'entrée de l'IA et du générateur.
3. **Tout ce qui entre est validé** par le schéma : instantané enregistré, sortie de l'IA, import. Une sortie de l'IA qui ne valide pas est rejetée, jamais corrigée en silence.
4. **Seuls les identifiants techniques (`ident`) peuvent finir dans du code généré.** Règle : `^[a-z][a-z0-9_]{0,30}$`. Les libellés (`label`, `summary`, `text`) ne servent qu'à l'affichage et ne sont jamais insérés dans du code, un nom de fichier ou une commande.
5. **Limites** : 200 blocs, 500 liens, 40 entités par base, 40 champs par entité. Elles protègent le navigateur, l'IA et le générateur.

## Blocs (8 types)

| Type | Rôle | Données propres |
|---|---|---|
| `webapp` | Interface web | `pages` |
| `service` | API / logique métier | `endpoints` (méthode, chemin, résumé) |
| `database` | Base de données | `engine` (postgresql), `entities` et `fields` (types : string, text, integer, long, decimal, boolean, date, datetime, uuid, json) |
| `auth` | Authentification | `method` : github, password, otp-sms |
| `queue` | File de messages | `topics` |
| `mobile-payment` | Paiement mobile (générique) | `currency` (code ISO), `flow` : collect ou payout |
| `messaging` | SMS, USSD, WhatsApp, courriel (générique) | `channel`, `templates` |
| `billing` | Facturation | `model` : subscription, one-time, usage ; `currency` |

Les blocs `mobile-payment` et `messaging` sont volontairement **génériques : aucune marque, aucun logo, aucune intégration réelle** (règle du dépôt).

## Liens

Un lien relie deux blocs (`source` vers `target`) et porte un `kind` : `http`, `event`, `data` ou `auth`, et un `label` optionnel.

## Règles que le schéma ne peut pas exprimer

À contrôler côté backend, dans une même fonction de validation partagée (instantané, import, sortie de l'IA) :

- `source` et `target` d'un lien désignent des blocs existants ; pas de doublon d'identifiant de bloc ou de lien.
- Les `name` des blocs sont uniques dans le canvas ; ceux des entités sont uniques dans leur base ; ceux des champs, dans leur entité.
- Un `name` ne doit pas être un mot réservé Java, SQL ou YAML (liste à maintenir dans le code du générateur).

## Correspondance avec Yjs

Le document Yjs contient :

| Clé | Type Yjs | Contenu |
|---|---|---|
| `nodes` | `Y.Map` indexé par `id` | `type`, `position`, `data` |
| `edges` | `Y.Map` indexé par `id` | `source`, `target`, `kind`, `label` |
| `meta` | `Y.Map` | `name`, `description` |

Choix à respecter : des `Y.Map` indexées par identifiant et non des `Y.Array`, pour que deux personnes qui modifient des blocs différents ne se gênent pas. La présence et les curseurs passent par *awareness*, ils ne sont **jamais** enregistrés. L'instantané JSON est obtenu en lisant ces trois cartes.

## Évolution

- Ajouter un champ optionnel ou un nouveau type de bloc : autorisé en version 1 (mettre à jour le schéma, l'exemple et ce tableau dans la même pull request).
- Renommer ou supprimer un champ, changer un type : nouvelle version et migration des instantanés existants.
- Le schéma est testé par le fichier d'exemple : s'il ne valide plus, la pull request ne passe pas (contrôle `scripts/check_canvas_schema.py`, lancé par la CI).
