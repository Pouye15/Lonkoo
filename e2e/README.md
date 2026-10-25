# Parcours de bout en bout

Des personnes simulées dans un vrai navigateur (Chromium, via [Playwright](https://playwright.dev/), Apache 2.0) font ce
que ferait un visiteur : elles ouvrent l'application, dessinent à plusieurs, partagent, versionnent, retirent quelqu'un,
publient un projet. C'est le « parcours complet sur l'adresse de production » de la liste des tests de
[../docs/architecture.md](../docs/architecture.md), et la preuve que les écrans, l'API et le temps réel marchent
**ensemble**, ce que les tests de chaque morceau ne montrent pas.

Rien n'est livré avec l'application : ce dossier est un outil de vérification, jamais dans les images Docker ni dans le
SBOM.

## Lancer

Il faut une application qui tourne (les quatre morceaux : base, backend, temps réel, interface en mode API, voir « Démarrer
en local » du [README](../README.md)) et son adresse.

```bash
cd e2e
npm ci
npm run install-browser            # une fois : télécharge Chromium pour Playwright
E2E_BASE_URL=http://localhost:3000 npm run e2e
```

Contre un serveur en ligne : `E2E_BASE_URL=https://lonkoo.example.com npm run e2e`. Les parcours ne créent que des
**invités** : ils ne touchent à aucun compte GitHub et leurs données disparaissent avec les invités (24 h).

| Commande | Effet |
|---|---|
| `npm run e2e` | tous les parcours, l'un après l'autre ; code de sortie 0 si tout passe |
| `node run.mjs --only 01,03` | seulement ceux dont le fichier commence par `01` ou `03` |
| `npm run list` | les liste sans rien lancer |

## Les parcours

| Fichier | Ce qu'il montre | Durée |
|---|---|---|
| `01-parcours.mjs` | Un invité ouvre le modèle d'exemple ; deux autres le rejoignent par lien (écriture, lecture seule) ; curseurs et blocs en direct ; la lecture seule ne peut rien supprimer ; versions, restauration vue par tous ; lien inconnu | ~1 min |
| `02-equipe-et-liens.mjs` | Liste de l'équipe, retrait d'un membre (sa connexion temps réel est coupée, son ancien ticket refusé), retour par un lien encore actif, révocation, départ volontaire | ~2 min |
| `03-projets-publics.mjs` | Un projet public se lit en lecture seule ; le privé d'une autre personne est introuvable ; repasser en privé sort le visiteur et laisse le propriétaire connecté. La galerie n'est vérifiée que si un projet public de compte GitHub est indiqué (ci-dessous) | ~1 min |

## Réglages

| Variable | Rôle |
|---|---|
| `E2E_BASE_URL` | adresse de l'application (`http://localhost:3000` par défaut) |
| `E2E_GALLERY_PROJECT_ID`, `E2E_GALLERY_PROJECT_NAME` | un projet public d'un compte GitHub, pour vérifier la galerie (elle ne liste pas les projets d'invités, qu'un parcours ne peut donc pas créer) ; `E2E_GALLERY_OWNER_LOGIN` ajoute le contrôle du fil d'Ariane |
| `E2E_HOST_MAP` | règle de résolution de nom du navigateur, ex. `MAP lonkoo.internal 127.0.0.1` (répétition avec un faux nom de domaine) |
| `E2E_INSECURE_TLS=1` | accepte un certificat non reconnu (répétition avec un certificat local) |
| `E2E_BROWSER_CHANNEL` | utilise un navigateur déjà installé (`chrome`, `msedge`) au lieu de celui de Playwright |
| `E2E_HEADED=1` | montre le navigateur |
| `E2E_SHOTS` | dossier des captures d'écran (`e2e/captures`, ignoré par git, par défaut) |

## Ce qu'ils ne font pas

- Pas de connexion GitHub : elle demande un vrai compte et une application OAuth. À essayer à la main (voir
  [../docs/GITHUB-OAUTH.md](../docs/GITHUB-OAUTH.md)).
- Pas de génération, d'envoi sur GitHub ni de déploiement : ils passent par GitHub, et sont couverts par les tests du
  backend contre un faux GitHub.
- Pas de redémarrage du serveur : le test `PersistentSessionsIntegrationTest` du backend démarre deux fois l'application.
- Ils utilisent les textes de l'interface (« Partager », « Équipe du projet », « Retirer »…) : un changement de libellé
  peut les faire échouer sans que rien ne soit cassé. Le message d'échec dit quelle vérification, et la capture d'écran du
  moment aide à voir pourquoi.

## Ajouter un parcours

Un fichier `scenarios/NN-nom.mjs` qui exporte `title` et `async function run(h)`. Le socle (`lib/harness.mjs`) donne
`h.newGuest(label)` (un invité sur son tableau de bord), `h.newVisitor(label)` (une personne qui arrive par un lien),
`h.check(nom, ok, détail)`, `h.visible(locator)`, `h.shot(page, nom)` et `h.noScriptErrors()`. Une vérification qui échoue
n'arrête pas le parcours : on voit ainsi tout ce qui est cassé d'un coup.
