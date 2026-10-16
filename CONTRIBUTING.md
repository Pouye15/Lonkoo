# Règles de travail de l'équipe

Ces règles remplacent la protection de branche (à activer dans les réglages GitHub : gratuite sur un dépôt public, indisponible sur un dépôt privé en offre gratuite). Elles reposent sur la discipline de chacun.

## Branches et pull requests

- **Personne ne pousse directement sur `main`.** Tout passe par une pull request.
- Une branche = une tâche, nom court : `feature/canvas-blocs`, `fix/curseurs`, `docs/licences`.
- Une pull request est relue par **au moins une autre personne** avant la fusion.
- `main` doit toujours compiler et pouvoir être déployé.
- Fusionnez au moins une fois par jour. Les branches longues créent des conflits.
- Ne jamais faire de `git push --force` sur `main`. Ne pas réécrire l'historique.

## Commits

- Chacun commite avec **son propre compte GitHub** (`git config user.name` et `user.email` liés à votre compte).
- Petits commits fréquents, message court et clair, par exemple `feat: ajoute le bloc base de données`.
- L'historique est une preuve que le projet a été réalisé pendant le concours. Ne le supprimez pas et ne le fusionnez pas en un seul commit.

## Secrets

- Jamais de clé, mot de passe ou jeton dans le code, les journaux ou les captures d'écran.
- Les vraies valeurs vont dans `.env` (local, ignoré par Git) ou dans GitHub Secrets (CI).
- Installez le hook gitleaks : `pip install pre-commit && pre-commit install` (à la racine du dépôt).
- Si un secret fuit : **révoquez-le immédiatement**, créez-en un nouveau, prévenez l'équipe.

## Nouvelles dépendances

Avant d'ajouter une bibliothèque, vérifiez sa licence. Le règlement n'accepte que les licences permissives (MIT, Apache 2.0, BSD). GPL, AGPL et LGPL rendent le projet irrecevable.

- Ajoutez la bibliothèque dans `docs/LICENCES-TIERCES.md` dans la même pull request.
- Dans le doute, demandez dans le canal de l'équipe avant de l'ajouter.

## Usage de l'IA

Chaque usage significatif d'un outil d'IA (génération de code, de texte, de maquettes) est noté dans `docs/IA.md`, avec la date, la personne et la partie concernée. Le règlement impose de déclarer ces informations à la soumission, et le jury interroge l'équipe sur chaque partie, y compris celles produites avec l'IA : **chacun doit pouvoir expliquer le code qu'il pousse.**

## À ne pas mettre dans le dépôt

- Logos et marques (Wave, Orange Money, WhatsApp, Systalink).
- Polices et icônes sans licence claire.
- Données personnelles réelles : utilisez des données fictives.
- Travaux de cours, code d'un employeur ou d'un client.
- Fichiers générés (`node_modules`, `target`, sauvegardes de base de données).
