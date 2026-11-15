# Liste de contrôle de la soumission CADev 2026

**Date limite : lundi 16 novembre 2026, 23 h 59 GMT** (prolongée par l'organisation, message reçu le 15/11 : « face à la forte affluence de dernière minute » ; elle était fixée au dimanche 15 novembre, 17 h GMT, et avant au dimanche 25 octobre). Le projet est enregistré (même message). Aucune soumission après l'heure limite.
Visez la veille pour garder une marge.

**Adresse du site en ligne :** <https://lonkoo.site> (nom de domaine acheté chez Systalink, adresse principale depuis le 15/11). **Adresse donnée dans le formulaire de soumission :** <https://5.22.217.55.sslip.io> ; elle redirige vers le site (redirection temporaire) et continue de répondre tant que le serveur la garde dans `DOMAINS`. Si l'adresse principale change encore, la procédure est dans `DEPLOIEMENT.md`, « Changer l'adresse publique ».

## Recevabilité (sans ces points, le projet n'est pas noté)

- [ ] Équipe inscrite via la plateforme Datacloud (2 à 5 membres), représentant désigné, répartition du prix déclarée, pays de représentation choisi (définitif).
- [ ] Chaque membre : majeur, nationalité ou résidence en Afrique francophone, compte Datacloud, règlement accepté.
- [x] Projet **déployé et accessible en ligne** (article 6) : <https://lonkoo.site> (l'adresse du formulaire, <https://5.22.217.55.sslip.io>, y redirige), essayé le 15/11 : parcours d'un invité, connexion GitHub, IA, envoi d'un projet sur GitHub et redémarrage du serveur d'abord sur l'adresse sslip, avant le changement d'adresse ; puis refaits sur `lonkoo.site` : connexion GitHub depuis les deux adresses, parcours automatiques `e2e/`, les quatre fonctions de l'IA (un appel chacune), envoi d'un projet sur GitHub (sans le fichier de workflow : l'application n'a pas l'autorisation « workflow »), redémarrage du serveur (31 secondes de coupure, données intactes).
- [x] Au moins un **produit ou service Datacloud acheté** avant la soumission, avec le code promo de l'équipe : serveur cloud Systalink à **Madrid** (Datacloud ne propose pas Dakar). L'étape 4 « Produit Systalink actif » a été validée par Systalink le 15/11 (message du support) : **à revérifier sur le tableau de bord**. Les VPS hors Dakar sont exclus de la remise de 40 % (article 8) : pas de remise garantie.
- [ ] Aucun composant sous licence GPL, AGPL ou LGPL (voir `LICENCES-TIERCES.md`). **Point ouvert :** `certifi` (MPL-2.0), livré dans l'image du microservice IA, n'est ni dans la liste permissive de l'article 6 ni dans la liste interdite ; la question à l'organisateur est rédigée dans `QUESTIONS-ORGANISATEUR.md`, **pas encore envoyée**.
- [ ] Projet réalisé pour l'essentiel pendant le concours (à partir du 29 septembre). Rien d'antérieur, sauf code déclaré d'un membre.

## Déclarations demandées à la soumission

- [ ] **Titularité** : chaque membre déclare que le projet a été créé en dehors de toute mission confiée par un employeur, un client ou un établissement d'enseignement susceptible d'en revendiquer les droits. Sinon, autorisation écrite de cette personne. Une déclaration inexacte entraîne la disqualification.
- [ ] **Composants tiers** : tous les composants et leurs licences (reprendre `LICENCES-TIERCES.md`). Inventaire machine : les trois SBOM CycloneDX de `docs/sbom/` (voir son README).
- [ ] **Code antérieur** d'un membre, s'il y en a (reprendre la section 4 de `LICENCES-TIERCES.md`).
- [ ] **Intelligence artificielle** : outils utilisés et parties concernées (reprendre `IA.md`).
  - *IA intégrée au produit* (`IA.md`, § 2) : Google Gemini, appelé par le microservice interne `agent_ia`, **active sur le site en ligne depuis le 15/11**. Conseiller, audit, esquisse et complétion essayés avec une vraie clé. Modèle en service : `gemini-3.1-flash-lite` (le modèle prévu, `gemini-3.8-flash`, était saturé chez Google ce jour-là ; il se change dans le `.env` du serveur, sans reconstruire).
  - **Réserve à déclarer :** la clé est du niveau gratuit de Google AI Studio (Google l'a confirmé le 15/11 par une erreur de quota « FreeTier »). Avec une clé gratuite, Google peut réutiliser les textes envoyés (le cahier des charges saisi, l'instantané réduit du canvas, les messages du conseiller) pour améliorer ses produits. Le produit n'envoie aucune donnée de compte, mais une personne peut écrire ce qu'elle veut dans le texte : le dire aux jurés.
  - Limites : 5 propositions et 10 messages du conseiller par invité et par jour, 500 appels par jour pour tout le service. Le coût réel par appel n'est pas mesuré.

## Avant de cliquer sur « Soumettre »

- [x] Parcours complet testé de bout en bout sur l'adresse de production : à la main (invité, connexion GitHub, IA, génération et envoi d'un projet sur GitHub, le 15/11, sur l'adresse sslip puis sur `lonkoo.site` après le changement d'adresse) et par le parcours automatique `e2e/` (`cd e2e && E2E_BASE_URL=https://lonkoo.site npm run e2e` : 145 vérifications réussies sur 6 parcours le 15/11, d'abord sur l'adresse sslip, puis sur `lonkoo.site` après le changement d'adresse ; seule la galerie publique est ignorée, faute de projet public d'un compte GitHub).
- [ ] `docs/sbom/` à jour (`python3 scripts/make_sbom.py --verify`), la CI le vérifie.
- [ ] Compte de démonstration disponible, sans inscription.
- [ ] Première page claire en 30 secondes : une phrase, un exemple déjà rempli, un bouton.
- [ ] Vidéo de démonstration de secours enregistrée.
- [ ] Secrets absents du dépôt (gitleaks passe) et des journaux.
- [ ] README à jour, dépôt propre.
- [ ] Dépôt : <https://github.com/Pouye15/Lonkoo>, **à rendre public au moment de la soumission** (décision du 15/11 : le jury doit pouvoir lire le code ; pas avant, car d'autres équipes peuvent encore soumettre). Contrôles faits : gitleaks sans fuite sur les 140 commits de toutes les branches, aucune adresse personnelle. La question sur l'accès du jury reste à poser à l'organisateur (voir `QUESTIONS-ORGANISATEUR.md`).
- [ ] Les cinq membres peuvent expliquer n'importe quelle partie du code.

## Vote des pairs (obligatoire pour chaque membre)

**Du mardi 17 novembre 2026, 00 h 00, au mercredi 18 novembre, 23 h 59 GMT** (calendrier de l'organisation, reçu le 15/11).
Si un seul membre ne vote pas, **toute l'équipe est exclue**.

- [ ] Membre 1 a voté
- [ ] Membre 2 a voté
- [ ] Membre 3 a voté
- [ ] Membre 4 a voté
- [ ] Membre 5 a voté

## Suite du calendrier

Calendrier de l'organisation, reçu le 15/11 (il remplace les dates d'avant le report de l'échéance).

| Date (GMT) | Étape |
|---|---|
| Jeudi 19 novembre, 00 h 00, au vendredi 20 novembre, 23 h 59 | Campagne de l'équipe et vote du public (honnête, sans échange de votes) |
| 21 et 22 novembre | Notation par le jury. Préparez-vous à défendre l'architecture et la sécurité |
| Lundi 23 novembre | Proclamation des résultats (date inchangée) |
