# Créer les applications OAuth GitHub

**Chaque personne qui lance LONKOO sur son poste crée sa propre application de développement** (§ 1) : les identifiants (`GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`) vivent dans le `.env` de chaque poste et ne se partagent pas. Sans eux, le backend répond 503 et l'interface affiche « La connexion GitHub n'est pas encore configurée sur ce serveur » : c'est normal, « Essayer sans compte » reste disponible (tout sauf l'envoi sur GitHub et le déploiement). L'application de **production** (§ 2) se crée **une seule fois**, par la personne qui possède le dépôt (compte `Pouye15`), quand l'adresse publique existe : sur le serveur, chacun se connecte avec son propre compte GitHub. Une application OAuth GitHub n'accepte qu'une seule adresse de retour : une application par environnement. Compter 10 minutes.

Ce que le backend demande aux utilisateurs : les portées `read:user` et `public_repo` à la connexion ordinaire (voir `architecture.md`). **Les portées ne se règlent pas ici** : le code les envoie à chaque connexion. Aucun jeton GitHub n'est stocké.

Une seconde connexion, **sur choix explicite de l'utilisateur** (`GET /api/auth/github/login?access=deploy`, bouton « Autoriser le déploiement » de la page Déployer), demande `read:user`, `repo` et `workflow` : c'est ce qui permet à LONKOO de lancer le workflow de déploiement du dépôt généré, d'y envoyer ce fichier de workflow et de créer un dépôt privé. L'écran de consentement de GitHub est alors bien plus large (accès complet aux dépôts) : l'interface le dit avant d'y envoyer l'utilisateur, et sans cette autorisation le déploiement reste possible à la main (étapes affichées). Au retour, le navigateur est renvoyé sur `/deploy` (adresse fixe, aucune adresse de retour n'est lue dans la requête).

## 1. Application de développement

1. Se connecter à GitHub avec le compte propriétaire, puis ouvrir <https://github.com/settings/developers> (Settings, Developer settings, OAuth Apps) et cliquer **New OAuth App**.
2. Remplir :

   | Champ | Valeur |
   |---|---|
   | Application name | `Lonkoo (développement)` |
   | Homepage URL | `http://localhost:3000` |
   | Application description | facultatif |
   | Authorization callback URL | `http://localhost:3000/api/auth/github/callback` |
   | Enable Device Flow | **laisser décoché** |

3. Cliquer **Register application**.
4. Sur la page de l'application : copier le **Client ID**, puis cliquer **Generate a new client secret** et copier le secret tout de suite (GitHub ne le réaffiche plus).
5. Dans le fichier `.env` à la racine (copié de `.env.example`, jamais commité) :

   ```
   GITHUB_OAUTH_CLIENT_ID=<le Client ID>
   GITHUB_OAUTH_CLIENT_SECRET=<le secret>
   GITHUB_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/github/callback
   ```

   L'adresse de retour du `.env` doit être **identique, caractère pour caractère**, à celle saisie sur GitHub. En local, le front sur le port 3000 redirige `/api` vers le backend (port 8080), c'est pourquoi l'adresse est celle du front.

### Sur un autre poste que celui du propriétaire

La procédure est celle ci-dessus, avec **votre** compte GitHub : l'application est créée sur votre compte (*Settings, Developer settings, OAuth Apps*) et ses identifiants vont dans **votre** `.env`. L'adresse de retour reste `http://localhost:3000/api/auth/github/callback` si vous lancez le front sur le port 3000. Redémarrez le backend après avoir modifié le `.env`. Ne demandez jamais le secret de quelqu'un d'autre et ne le collez dans aucun message ni fichier du dépôt.

### Dans un Codespace

L'adresse du site n'est plus `localhost:3000` mais celle du port redirigé (de la forme `https://<nom-du-codespace>-3000.app.github.dev`). Il faut **trois** valeurs identiques à cette adresse, **plus une quatrième** (voir sous le tableau), sinon la connexion ou la création d'un projet échoue :

| Où | Valeur |
|---|---|
| Application OAuth sur GitHub, *Authorization callback URL* | `https://<nom-du-codespace>-3000.app.github.dev/api/auth/github/callback` |
| `.env` : `GITHUB_OAUTH_REDIRECT_URI` | la même adresse |
| `.env` : `APP_PUBLIC_URL` | `https://<nom-du-codespace>-3000.app.github.dev` |

`APP_PUBLIC_URL` compte aussi sans GitHub : le backend refuse toute requête `POST` dont l'origine n'est pas cette adresse (403 « Origine non autorisée »), ce qui touche déjà « Essayer sans compte » et la déconnexion si elle vaut encore `http://localhost:3000`. Le nom d'un Codespace change d'un Codespace à l'autre : une adresse de retour à mettre à jour sur GitHub à chaque nouveau Codespace. **Quatrième valeur, constatée à l'essai du 05/11** : le relais de port de GitHub Codespaces **réécrit l'en-tête `Origin`** des requêtes du navigateur en `https://localhost:3000` (port privé) ou `http://localhost:3000` (port public) : les deux formes ont été vues, à quelques minutes d'écart, après le passage du port de privé à public. Le contrôle d'origine du backend le prend alors pour un autre site : la connexion GitHub passe (c'est une lecture) mais **créer un projet répond « Origine non autorisée »** (403). Le journal du backend le dit : `Origine refusée : « https://localhost:3000 » (attendue : « https://<nom>-3000.app.github.dev »)`. L'interface montre « Origine non autorisée » à la création d'un projet et, pour le Studio, « Ce canvas n'est pas accessible : Origine non autorisée » (la demande de ticket temps réel est une écriture elle aussi). Dans le `.env` du Codespace, **les deux formes** :

| Où | Valeur |
|---|---|
| `.env` : `EXTRA_ALLOWED_ORIGINS` | `https://localhost:3000,http://localhost:3000` |

Puis redémarrer le backend. Cette valeur affaiblit le contrôle contre les requêtes intersites (dans un Codespace, le relais donne la même origine à tous les sites) : **réservée au développement**, le backend refuse de démarrer en profil `prod` si elle est renseignée.

La connexion GitHub a été essayée dans un Codespace le 05/11 (compte créé, connexion au journal d'audit). **Le Studio (canvas en temps réel) demande une cinquième valeur** : sans elle il reste sur « Connexion au canvas partagé… », parce que le navigateur vise `ws://localhost:1234`, qui est **sa propre machine** et non le Codespace (et un `ws://` non chiffré est refusé depuis une page en https). Le serveur de développement de Next.js relaie le WebSocket sur la même adresse que le site (`/ws`, comme Caddy en production) ; il suffit de le demander dans `frontend/.env.local` :

```
NEXT_PUBLIC_API_MODE=live
NEXT_PUBLIC_REALTIME_URL=/ws
```

Puis redémarrer `npm run dev` (cette variable est lue au démarrage). Essayé en local avec les parcours de bout en bout (Studio, présence, curseurs, versions, discussion) ; **pas encore dans le navigateur d'un vrai Codespace**.

## 2. Application de production

**Reportée à l'étape de déploiement** (décision du 21/10) : rien à créer tant que l'adresse publique n'existe pas. À créer de la même façon **dès que l'adresse publique est connue** (voir `DEPLOIEMENT.md`, étape 0). Si elle n'est pas encore choisie, créer l'application avec une adresse provisoire : les deux adresses se modifient ensuite dans **Settings** de l'application.

| Champ | Valeur |
|---|---|
| Application name | `Lonkoo` |
| Homepage URL | `https://<domaine>` |
| Authorization callback URL | `https://<domaine>/api/auth/github/callback` |
| Enable Device Flow | décoché |

Les valeurs de production vont dans le `.env` **du serveur** (qui n'est pas dans le dépôt), avec `GITHUB_OAUTH_REDIRECT_URI=https://<domaine>/api/auth/github/callback`. Ne jamais les mettre dans un message, une issue ou un fichier du dépôt ; gitleaks bloque les commits qui en contiennent.

## 3. Vérifications

- Le secret n'apparaît ni dans `git status` ni dans `.env.example` (celui-ci garde `change-me`).
- En profil `prod`, le backend refuse de démarrer si une valeur `change-me` subsiste (`ConfigurationCheck`) , y compris pour les trois variables `GITHUB_OAUTH_*` (adresse de retour en `https`).
- La page de consentement GitHub montrera aux utilisateurs l'accès aux dépôts publics (`public_repo`) : c'est voulu, le dépôt généré est public par défaut. L'interface doit le dire avant l'envoi.
- Avec `access=deploy`, elle montre l'accès à tous les dépôts (`repo`) et aux workflows (`workflow`) : l'interface ne l'offre que dans un encadré qui l'explique, jamais à la première connexion.
- En cas de fuite du secret : **Generate a new client secret** sur GitHub, mise à jour du `.env`, puis suppression de l'ancien secret.

## 4. « GitHub est injoignable » (503) sur un poste Windows

Si, après avoir autorisé l'application, le navigateur affiche `{"detail":"GitHub est injoignable", … "status":503}`, le backend n'arrive pas à joindre `github.com` en HTTPS. Le journal du backend le dit : `SSLHandshakeException` (« unable to find valid certification path »). Cause fréquente : un antivirus ou un proxy d'entreprise qui inspecte le HTTPS avec son propre certificat, reconnu par Windows mais pas par Java.

Remède en développement : démarrer le backend avec le magasin de certificats de Windows.

```
cd backend
./mvnw spring-boot:run "-Dspring-boot.run.jvmArguments=-Djavax.net.ssl.trustStoreType=Windows-ROOT"
```

C'est un réglage de la machine, pas du code : il ne sert à rien sur le serveur Linux de production. Le même problème explique les avertissements « PKIX path building failed » de Maven ; la variable `MAVEN_OPTS=-Djavax.net.ssl.trustStoreType=Windows-ROOT` les supprime.

Pour vérifier sans passer par le navigateur : ouvrir `/api/auth/github/login`, puis appeler `/api/auth/github/callback?code=faux&state=<état reçu>` avec le même cookie. La réponse `400 … invalide ou expiré` prouve que GitHub est joignable et reconnaît l'application ; `502` signale un identifiant ou un secret faux ; `503`, le problème de certificat ci-dessus.

## 5. Ce que j'ai besoin de savoir ensuite

Rien de secret : une fois l'application de développement créée et le `.env` rempli, on peut tester la connexion de bout en bout en local. Le code de la connexion (lot R4) et ses tests contre un faux GitHub n'en dépendent pas : ils peuvent commencer avant. La connexion réelle a été essayée le 25/10 avec l'URL de rappel `http://localhost:3000/api/auth/github/callback` : elle fonctionne.
