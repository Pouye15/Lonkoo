# Liste de contrôle de la soumission CADev 2026

**Date limite : dimanche 15 novembre 2026, 17 h GMT** (tableau de bord Datacloud : « 29 sept. au 15 nov. 2026 » ; règlement). L'ancienne échéance était le dimanche 25 octobre, 17 h 00, heure de Dakar (GMT). Aucune soumission après l'heure limite.
Visez la veille pour garder une marge.

**Adresse du site en ligne :** <https://5.22.217.55.sslip.io> (provisoire ; la procédure pour la remplacer par un nom de domaine est dans `DEPLOIEMENT.md`, « Changer l'adresse publique »). Si l'adresse change, la modifier aussi dans le formulaire de soumission.

## Recevabilité (sans ces points, le projet n'est pas noté)

- [ ] Équipe inscrite via la plateforme Datacloud (2 à 5 membres), représentant désigné, répartition du prix déclarée, pays de représentation choisi (définitif).
- [ ] Chaque membre : majeur, nationalité ou résidence en Afrique francophone, compte Datacloud, règlement accepté.
- [x] Projet **déployé et accessible en ligne** (article 6) : <https://5.22.217.55.sslip.io>, essayé le 15/11 (parcours d'un invité, connexion GitHub, IA, redémarrage du serveur). Le parcours automatique `e2e/` contre cette adresse reste à lancer.
- [x] Au moins un **produit ou service Datacloud acheté** avant la soumission, avec le code promo de l'équipe : serveur cloud Systalink à **Madrid** (Datacloud ne propose pas Dakar). L'étape 4 « Produit Systalink actif » a été validée par Systalink le 15/11 (message du support) : **à revérifier sur le tableau de bord**. Les VPS hors Dakar sont exclus de la remise de 40 % (article 8) : pas de remise garantie.
- [ ] Aucun composant sous licence GPL, AGPL ou LGPL (voir `LICENCES-TIERCES.md`). **Point ouvert :** `certifi` (MPL-2.0), livré dans l'image du microservice IA, n'est ni dans la liste permissive de l'article 6 ni dans la liste interdite ; la question à l'organisateur est rédigée dans `QUESTIONS-ORGANISATEUR.md`, **pas encore envoyée**.
- [ ] Projet réalisé pour l'essentiel pendant le concours (à partir du 29 septembre). Rien d'antérieur, sauf code déclaré d'un membre.

## Déclarations demandées à la soumission

- [ ] **Titularité** : chaque membre déclare que le projet a été créé en dehors de toute mission confiée par un employeur, un client ou un établissement d'enseignement susceptible d'en revendiquer les droits. Sinon, autorisation écrite de cette personne. Une déclaration inexacte entraîne la disqualification.
- [ ] **Composants tiers** : tous les composants et leurs licences (reprendre `LICENCES-TIERCES.md`). Inventaire machine : les trois SBOM CycloneDX de `docs/sbom/` (voir son README).
- [ ] **Code antérieur** d'un membre, s'il y en a (reprendre la section 4 de `LICENCES-TIERCES.md`).
- [ ] **Intelligence artificielle** : outils utilisés et parties concernées (reprendre `IA.md`).
  - *IA intégrée au produit* (`IA.md`, § 2) : Google Gemini, appelé par le microservice interne `agent_ia`, **active sur le site en ligne depuis le 15/11**. Conseiller, audit et esquisse essayés avec une vraie clé ; la complétion n'a pas été essayée en vrai. Modèle en service : `gemini-3-flash-preview` (le modèle prévu, `gemini-3.8-flash`, était saturé chez Google ce jour-là ; il se change dans le `.env` du serveur, sans reconstruire).
  - **Réserve à déclarer :** la clé semble être du niveau gratuit de Google AI Studio (à confirmer avec la personne qui l'a créée). Avec une clé gratuite, Google peut réutiliser les textes envoyés (le cahier des charges saisi, l'instantané réduit du canvas, les messages du conseiller) pour améliorer ses produits. Le produit n'envoie aucune donnée de compte, mais une personne peut écrire ce qu'elle veut dans le texte : le dire aux jurés.
  - Limites : 5 propositions et 10 messages du conseiller par invité et par jour, 500 appels par jour pour tout le service. Le coût réel par appel n'est pas mesuré.

## Avant de cliquer sur « Soumettre »

- [ ] Parcours complet testé de bout en bout sur l'adresse de production : à la main (invité, connexion GitHub et IA essayés le 15/11), et par le parcours automatique (`cd e2e && E2E_BASE_URL=https://5.22.217.55.sslip.io npm run e2e`, voir `e2e/README.md` ; **pas encore lancé**).
- [ ] `docs/sbom/` à jour (`python3 scripts/make_sbom.py --verify`), la CI le vérifie.
- [ ] Compte de démonstration disponible, sans inscription.
- [ ] Première page claire en 30 secondes : une phrase, un exemple déjà rempli, un bouton.
- [ ] Vidéo de démonstration de secours enregistrée.
- [ ] Secrets absents du dépôt (gitleaks passe) et des journaux.
- [ ] README à jour, dépôt propre.
- [ ] Dépôt privé : accès donné au jury selon la réponse de l'organisateur (voir `QUESTIONS-ORGANISATEUR.md`).
- [ ] Les cinq membres peuvent expliquer n'importe quelle partie du code.

## Vote des pairs (obligatoire pour chaque membre)

**Dates à confirmer** (avant le report de l'échéance, le vote était fixé du dimanche 25 octobre 18 h 00 au lundi 26 octobre 23 h 59).
Si un seul membre ne vote pas, **toute l'équipe est exclue**.

- [ ] Membre 1 a voté
- [ ] Membre 2 a voté
- [ ] Membre 3 a voté
- [ ] Membre 4 a voté
- [ ] Membre 5 a voté

## Suite du calendrier

Les dates ci-dessous sont celles d'**avant** le report de l'échéance : **à confirmer**.

| Ancienne date (à confirmer) | Étape |
|---|---|
| 27 au 30 octobre | Campagne de l'équipe et vote du public (honnête, sans échange de votes) |
| 31 octobre au 1er novembre | Notation par le jury. Préparez-vous à défendre l'architecture et la sécurité |
| 2 novembre | Proclamation des résultats |
