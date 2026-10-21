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

### Précisions pour le front et le serveur temps réel (21/10)

Ces règles sont celles que le serveur temps réel (`realtime/src/canvasCodec.js`) applique pour écrire le modèle d'exemple, restaurer une version et produire l'instantané. Un client qui s'y tient est relu sans perte ; un test de chaîne du backend (`RealtimeChainIntegrationTest`) écrit selon ces règles.

- **Trois cartes de premier niveau**, obtenues par `ydoc.getMap('nodes')`, `ydoc.getMap('edges')` et `ydoc.getMap('meta')`. Il n'y a pas d'autre racine.
- **L'`id` est la clé de la carte, pas un champ de l'entrée.** Ajouter un bloc : `nodes.set(id, entree)` où `entree` est une `Y.Map` portant `type`, `position` et `data`. Le supprimer : `nodes.delete(id)`. Si une entrée contient quand même un champ `id`, la clé fait foi.
- **Les valeurs d'une entrée sont du JSON simple** : `position` vaut `{ x, y }`, `data` est l'objet de données du bloc, `source` et `target` sont des textes. Pour modifier, **remplacer la valeur** (`entree.set('position', { x, y })`), jamais la modifier en place. Deux personnes qui déplacent un bloc et modifient ses données en même temps se fusionnent (clés différentes de l'entrée) ; deux modifications des `data` d'un même bloc se départagent par la dernière.
- **Clé facultative `ui` (présentation propre au front)** : une entrée de bloc ou de lien peut porter une clé `ui` (forme dessinée, réplicas, débit, statut, port…). Elle est partagée entre les utilisateurs mais **n'est jamais reprise dans l'instantané** (le contrat refuse les champs inconnus) ; une restauration de version la conserve pour les identifiants qui survivent. Tout champ du front qui n'est pas dans le contrat va dans `ui`, jamais à côté de `type`, `position` et `data`.
- **Lecture** : `entree.toJSON()` ou `ydoc.getMap('nodes').toJSON()` rendent du JSON simple, quelle que soit la façon dont l'entrée a été écrite (le serveur lit aussi des types Yjs imbriqués ou un objet JSON complet comme entrée).
- **Supprimer un bloc oblige à supprimer ses liens** (`edges` dont `source` ou `target` vaut son `id`) : un lien vers un bloc absent rend l'instantané invalide.
- **`schemaVersion` n'est pas stocké dans Yjs** : l'instantané porte toujours la version courante du contrat.
- **L'instantané est produit par le serveur temps réel** : `nodes` et `edges` sont des tableaux **triés par `id`** (ordre stable), `meta` n'apparaît que s'il n'est pas vide.
- **Lecture seule** : un client connecté avec le rôle `READ` ou `TRIAGE` (champ `role` du ticket) ne doit pas proposer d'édition ; le serveur ignore ses modifications, mais son document local, lui, les afficherait.
- Les documents enregistrés avant le 21/10 avec l'ancienne disposition (une carte `canvas` contenant des tableaux) sont convertis au chargement.

## Évolution

- Ajouter un champ optionnel ou un nouveau type de bloc : autorisé en version 1 (mettre à jour le schéma, l'exemple et ce tableau dans la même pull request).
- Renommer ou supprimer un champ, changer un type : nouvelle version et migration des instantanés existants.
- Le schéma est testé par le fichier d'exemple : s'il ne valide plus, la pull request ne passe pas (contrôle `scripts/check_canvas_schema.py`, lancé par la CI).
