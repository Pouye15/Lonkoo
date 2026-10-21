# Créer les applications OAuth GitHub

À faire une fois, par la personne qui possède le dépôt (compte `Pouye15`). Il en faut **deux** : une application OAuth GitHub n'accepte qu'une seule adresse de retour, donc une pour le développement et une pour la production. Compter 10 minutes.

Ce que le backend demandera aux utilisateurs : les portées `read:user` et `public_repo` seulement (voir `architecture.md`). **Les portées ne se règlent pas ici** : le code les envoie à chaque connexion. Aucun jeton GitHub n'est stocké.

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
- En profil `prod`, le backend refuse de démarrer si une valeur `change-me` subsiste (`ConfigurationCheck`) ; une fois la connexion GitHub codée (lot R4), il contrôlera aussi ces trois variables.
- La page de consentement GitHub montrera aux utilisateurs l'accès aux dépôts publics (`public_repo`) : c'est voulu, le dépôt généré est public. L'interface doit le dire avant l'envoi.
- En cas de fuite du secret : **Generate a new client secret** sur GitHub, mise à jour du `.env`, puis suppression de l'ancien secret.

## 4. Ce que j'ai besoin de savoir ensuite

Rien de secret : une fois l'application de développement créée et le `.env` rempli, on peut tester la connexion de bout en bout en local. Le code de la connexion (lot R4) et ses tests contre un faux GitHub n'en dépendent pas : ils peuvent commencer avant.
