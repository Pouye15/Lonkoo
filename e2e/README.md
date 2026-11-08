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
| `04-discussion.mjs` | Trois personnes d'un même projet (propriétaire, écriture, lecture seule du canvas) discutent dans la page Revues : les messages arrivent chez les autres sans recharger, la lecture seule du canvas n'empêche pas d'écrire, un texte avec des balises HTML s'affiche tel quel (aucun script ne s'exécute), l'historique revient au rechargement, la pastille de « Revues » compte les vrais messages non lus, et sur un téléphone (écran tactile de 390 px) la discussion est en haut de page, Entrée va à la ligne et le bouton envoie | ~2 min |
| `05-modeles.mjs` | Le dialogue « Nouveau projet » offre « Projet vide » (choisi par défaut) et les cinq modèles de départ avec leur taille ; un projet créé depuis la tontine s'ouvre dans le Studio avec tous ses blocs ; sans modèle le canvas reste vide ; le projet du modèle se génère jusqu'à `DONE` avec ses entités | ~1 min |
| `06-audit.mjs` | L'onglet « Audit » donne un score calculé sur le schéma (plus le score constant d'avant) ; « Passer à 2 répliques » fait disparaître le constat et monter le score de 10 points, et le résultat reste après rechargement ; le contraste de chaque texte de l'audit atteint AA en thème clair puis sombre (mesuré sur les couleurs affichées) ; à trois personnes, celle qui peut modifier voit le bouton de correction, celle en lecture seule ne l'a pas, et la correction de l'une arrive chez l'autre sans recharger ; un nom de bloc ouvre le tableau blanc ; un canvas vide n'a pas de score ; à 390 px la page ne déborde pas | ~1 min |

## Mesure de charge de la discussion

`charge/discussion.mjs` simule N personnes d'un même projet qui lisent la conversation toutes les 3 s (comme l'interface) et écrivent à intervalles irréguliers. Il s'adresse au backend directement (ce que Caddy lui relaie sous `/api`) et a besoin d'invités en nombre (`GUEST_RATE_LIMIT_PER_HOUR` élevé dans le `.env` du backend).

```bash
E2E_API=http://localhost:8080 CHARGE_PERSONNES=100 CHARGE_SECONDES=60 CHARGE_MESSAGES_PAR_MINUTE=3 npm run charge
```

Il vérifie que **rien ne manque chez personne** et qu'il n'y a aucune erreur du serveur (code de sortie 1 sinon), et rapporte le délai d'arrivée des messages (borné par la lecture toutes les 3 s), la durée des appels et le retard de l'outil lui-même.

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

## Le parcours manuel : le vrai GitHub

`manuel/github-reel.mjs` n'est **pas** lancé par `npm run e2e` : il crée un dépôt sur un vrai compte GitHub et demande
qu'une personne se connecte elle-même dans la fenêtre qui s'ouvre (il ne lit jamais une page de github.com).

```bash
cd e2e
E2E_BASE_URL=https://votre-adresse npm run github-reel      # E2E_VISIBILITY=public, E2E_REPO_NAME=… facultatifs
```

Il enchaîne : invité, génération du projet d'exemple, connexion GitHub réelle (autorisations `read:user repo workflow`),
création du dépôt, envoi des fichiers, lancement du workflow de déploiement, suivi de l'exécution jusqu'à son verdict.
Sur un dépôt neuf, **le workflow échoue** à l'étape « Vérifier les secrets » (aucun secret `SYSTALINK_*`) : c'est le
résultat attendu, il prouve la chaîne. À faire une fois sur l'adresse de production (application OAuth de production), puis
**supprimer le dépôt de test** (Settings, Delete this repository). Essai à blanc sans fenêtre : `E2E_HEADED=0
E2E_LOGIN_TIMEOUT_SECONDS=8` (il s'arrête à l'écran de connexion).

## Le mode démonstration (sans API)

`manuel/mode-demonstration.mjs` vérifie l'onglet Audit du Studio quand l'interface tourne **sans API** (le repli de la démo si le
backend ne démarre pas). Ce mode est fixé à la construction de l'interface : `npm run e2e` ne peut pas le couvrir. Il faut donc
arrêter l'interface en mode API, la lancer avec `NEXT_PUBLIC_API_MODE=demo npm run dev` dans `frontend/`, puis :

```bash
cd e2e
E2E_BASE_URL=http://localhost:3000 npm run demo-mode      # code de sortie 2 si l'interface n'est pas en mode démonstration
```

Il ne crée qu'une session simulée dans le navigateur (aucun serveur, aucun compte). Capture : `e2e/captures/mode-demonstration.png`.

## La vidéo de démonstration

`manuel/demo-video.mjs` enregistre, en 2 minutes environ, une vidéo sous-titrée (WebM, sans son) de ce que l'application affiche
quand tout marche : accueil, espace de démonstration, studio, une deuxième personne qui rejoint par un lien (curseur et blocs en
direct), versions, export, génération du projet. Elle montre à quelqu'un qui n'arrive pas à lancer le projet en local à quoi
ressemble un démarrage réussi, et elle est la base de la démo de secours du jury.

```bash
cd e2e
E2E_BASE_URL=http://localhost:3000 npm run demo-video      # écrit e2e/captures/demo-lonkoo.webm (ignoré par git)
```

Avant d'enregistrer, le script vérifie que l'interface, le backend et le serveur temps réel répondent ; sinon il s'arrête sans
rien filmer et dit quoi lancer. Il ne crée que des invités. Pour un MP4 (téléphone, WhatsApp) :
`ffmpeg -i demo-lonkoo.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart demo-lonkoo.mp4`.

## Ce qu'ils ne font pas

- Pas de connexion GitHub : elle demande un vrai compte et une application OAuth (voir
  [../docs/GITHUB-OAUTH.md](../docs/GITHUB-OAUTH.md)). Elle a son propre parcours, **manuel**, plus bas.
- Pas de génération, d'envoi sur GitHub ni de déploiement : ils passent par GitHub, et sont couverts par les tests du
  backend contre un faux GitHub, et, pour le vrai GitHub, par le parcours manuel plus bas.
- Pas de redémarrage du serveur : le test `PersistentSessionsIntegrationTest` du backend démarre deux fois l'application.
- Ils utilisent les textes de l'interface (« Partager », « Équipe du projet », « Retirer »…) : un changement de libellé
  peut les faire échouer sans que rien ne soit cassé. Le message d'échec dit quelle vérification, et la capture d'écran du
  moment aide à voir pourquoi.

## Ajouter un parcours

Un fichier `scenarios/NN-nom.mjs` qui exporte `title` et `async function run(h)`. Le socle (`lib/harness.mjs`) donne
`h.newGuest(label)` (un invité sur son tableau de bord), `h.newVisitor(label)` (une personne qui arrive par un lien),
`h.check(nom, ok, détail)`, `h.visible(locator)`, `h.shot(page, nom)` et `h.noScriptErrors()`. Une vérification qui échoue
n'arrête pas le parcours : on voit ainsi tout ce qui est cassé d'un coup.
