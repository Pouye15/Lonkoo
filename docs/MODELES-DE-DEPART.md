# Modèles de départ : ce qu'ils représentent, d'où viennent les choix, ce qui n'est pas vérifié

Cinq modèles sont proposés à la création d'un projet : `marketplace-mobile` (l'exemple du contrat) et quatre cas d'usage
pour l'Afrique de l'Ouest, `clinique-rendez-vous`, `ecole-inscriptions`, `tontine-numerique` et `livraison-colis`.
Les fichiers sont dans [docs/exemples/](exemples/) ; leurs copies dans `backend/src/main/resources/seed/` sont celles que lit le
serveur (`SeedDriftTest` refuse toute différence).

Les quatre cas d'usage ont été **relus contre des références publiques le 7 novembre 2026**, par Claude Code, à la demande
d'Ibrahima Pouye. Cette relecture corrige des défauts de modélisation ; elle **ne remplace ni l'avis d'une personne du
domaine ni un avis juridique** (voir « Ce qui n'a pas été fait »).

## Choix communs aux quatre modèles

L'onglet « Audit » du Studio applique aussi trois de ces règles à n'importe quel canvas (paiement sans référence unique, entité qu'aucune route ne crée, SMS hors limite) : `frontend/src/lib/audit.ts`.

| Sujet | Choix | Pourquoi |
|---|---|---|
| Montants en francs CFA | Type `long`, en francs | Dans la liste ISO 4217, le franc CFA (XOF, comme le XAF) a 0 décimale : un montant à virgule n'a pas de sens et aucun opérateur ne le traitera. Le modèle marketplace garde `decimal` pour `prix` et `total` (c'est l'exemple du contrat, non modifié). |
| Paiement | Une référence **unique** (`reference`, `reference_paiement`, `reference_versement`) et une date (`paye_le`, `recu_le`, `verse_le`) | L'opérateur peut rappeler deux fois pour le même paiement, dans le désordre. Avec une référence unique, le doublon est refusé (409) au lieu d'être compté deux fois. Un test (`TemplateCatalogTest`) exige cette référence dans tout modèle qui a un bloc de paiement. |
| Statut | Texte libre dans `statut` ; vocabulaire proposé plus bas | Le contrat du canvas n'a pas d'énumération. |
| SMS | Un message tient en 160 caractères, tous dans le jeu GSM 7 bits | Un seul caractère hors du jeu (ê, â, ô, û, î, ï, ë, œ, apostrophe typographique, guillemets « ») fait passer tout le SMS en UCS-2 : 70 caractères, coupé en morceaux de 67. Un test le vérifie. |
| USSD | Écrans de 160 caractères au plus, menu à plat, confirmation avant un paiement | Voir la section sur la tontine. |
| Identité d'une personne | Un numéro de dossier (patient) ou un matricule (élève), pas le téléphone. Exception : le membre d'une tontine, qui se connecte par code SMS et paie depuis son numéro | Un téléphone est une coordonnée, pas une identité (FHIR les distingue et autorise plusieurs de chaque). |
| Création | Chaque entité désignée par un champ `xxx_id` peut être créée par un `POST` | Sans cela, le champ n'aurait jamais de valeur. Un test le vérifie. |

## Clinique : rendez-vous et rappels par SMS

Entités : `patient`, `medecin`, `rendez_vous`, `consultation`, `facture`.

- **Créneau.** Un rendez-vous a un `debut` et une `fin`. Dans FHIR (ressource `Appointment`), début et fin sont soit tous les deux
  présents, soit tous les deux absents. Sans fin, on ne peut pas détecter deux rendez-vous qui se chevauchent. Refuser le
  chevauchement est une règle du service ; le contrat du canvas ne peut pas l'exprimer.
- **Statuts proposés** pour `rendez_vous.statut` : `reserve`, `arrive`, `termine`, `annule`, `absent` (FHIR : `booked`, `arrived`,
  `fulfilled`, `cancelled`, `noshow`). FHIR en connaît cinq autres, non retenus ici : `proposed`, `pending`, `waitlist`,
  `checked-in`, `entered-in-error`.
- **Patient.** Identifié par `numero_dossier` (unique). Le téléphone n'est pas unique : rien n'oblige deux patients à avoir des
  numéros différents, et une contrainte aurait bloqué l'enregistrement du second.
- **Clinique et facturation séparées.** Le compte rendu (`consultation.compte_rendu`) est dans une autre ligne que le montant et
  l'état du paiement (`facture`) : le retour du paiement mobile n'a pas à toucher une ligne qui contient des notes médicales. C'est un
  choix de conception, pas une norme.
- **Rappels.** Les deux SMS ne disent ni la spécialité ni le motif de la visite.

## École : inscriptions, notes et frais de scolarité

Entités : `tuteur`, `eleve`, `classe`, `inscription`, `note`, `frais`.

- **Tuteur à part.** Ed-Fi range parents et tuteurs dans une entité distincte de l'élève, reliée par une association, pour que le contact soit
  tenu à jour une seule fois quand un parent a plusieurs enfants. Le modèle garde une simplification : un seul tuteur par élève
  (`eleve.tuteur_id`), alors que chez Ed-Fi c'est l'association entre l'élève et le parent qui porte la nature du lien.
- **`classe.libelle` n'est pas unique.** Une classe porte une année : « 6e A » existe chaque année. Le contrat n'a pas de contrainte
  composite (libellé et année), donc aucune contrainte.
- **`note.periode` est obligatoire** : une note sans période ne dit pas à quel bulletin elle appartient.
- **`eleve.matricule`** (unique) identifie l'élève ; deux élèves peuvent porter le même nom.
- **WhatsApp.** Hors de la fenêtre de 24 heures qui suit le dernier message d'une personne, une entreprise ne peut envoyer qu'un
  modèle de message approuvé. Les deux textes du bloc « Messages parents » sont à faire approuver chez le fournisseur retenu.

## Tontine numérique : cotisations et tours

Entités : `membre`, `cercle`, `participation`, `tour`, `cotisation`.

- **Mécanique retenue** : chaque membre verse une somme fixe à intervalle régulier ; à chaque tour, toute la cagnotte va à un seul
  membre ; l'ordre se décide par accord ou par tirage ; un cycle compte autant de tours que de membres ; les règles (montant, fréquence,
  ordre, durée, paiements manqués) se fixent à l'avance.
- **Modèle** : `cercle` (montant par membre, fréquence), `participation` (qui est dans quel cercle), `tour` (numéro, échéance,
  bénéficiaire, cagnotte, versement), `cotisation` (rattachée à un tour). On sait ainsi qui est dans quel cercle, dans quel ordre on
  reçoit, quel tour finance chaque cotisation et qui n'a pas payé.
- **Règle à coder** : ne verser le tour que lorsque toutes les cotisations de ce tour sont reçues, ou appliquer la règle des paiements
  manqués fixée par le cercle. Le lien du canvas la nomme ; le code reste à écrire.
- **`tour.reference_versement` unique** : un versement ne doit pas partir deux fois.
- **Deux canaux, deux rôles.** Le SMS prévient (rappel, tour versé). Le menu USSD sert au membre qui paie ou consulte : la session est
  ouverte par le membre, qui compose un code ; l'écran fait environ 160 caractères ; la session expire vers 30 secondes d'inactivité ;
  on confirme avant un paiement et on envoie le reçu par SMS. Les rappels, que le membre n'a pas demandés, partent donc par SMS.
- **Droit : non vérifié.** Collecter puis reverser de l'argent pour des tiers peut relever de la réglementation des services de paiement.
  Aucune source trouvée ne traite des tontines numériques. À demander à un juriste avant toute mise en service.

## Livraison de colis : suivi et notifications

Entités : `colis`, `livreur`, `tournee`, `livraison`, `evenement`.

- **Historique de suivi.** `evenement` garde une ligne par changement (statut, motif, lieu, heure) ; le statut courant du colis est celui
  du dernier événement. Les services de suivi exposent des statuts successifs, et certains peuvent se répéter.
- **Statuts proposés** pour `colis.statut` et `evenement.statut` : `enregistre`, `en_transit`, `en_livraison`, `livre`,
  `echec_livraison`, `retourne`. Repères : DHL (`pre-transit`, `transit`, `delivered`, `failure`, `unknown`) et TrackMage
  (`pre_transit`, `in_transit`, `delivery_in_progress`, `delivered`, `unsuccessful_delivery`, `return_to_sender`, `available_for_pickup`,
  `exception`, et d'autres).
- **`colis.telephone_destinataire`** est obligatoire : sans lui, ni SMS « votre colis est en route » ni appel du livreur.
- **Paiement à la livraison.** `colis.montant_a_encaisser` (vide si déjà payé) et `livraison.reference_paiement` (unique).
- **`livraison.preuve`** remplace `signature` : signature, photo ou code de remise. Les seules sources trouvées sur les preuves de remise
  sont des pages d'éditeurs, pas une norme : le nom reste volontairement général.

## Ce qui n'a pas été fait

- **Relecture par une personne du domaine** (médecin, enseignant, animateur de tontine, livreur) : non faite. Elle reste utile et facultative.
- **Avis juridique** : non demandé. Ce que la loi sénégalaise n° 2008-12 dit des données de santé est lu d'après le texte publié par l'OMPI, par un
  outil de lecture qui résume : les articles cités ci-dessous sont à confirmer. La santé y est une donnée sensible (art. 4) ; traiter des données de
  santé est interdit sauf exceptions, dont le consentement écrit (art. 40 et 41) ; un traitement à des fins de soins se fait sous la surveillance d'un
  professionnel de santé tenu au secret (art. 43) ; le patient a un droit d'accès (art. 65). La loi ne semble pas contenir de règle propre aux mineurs ; le
  consentement peut être donné par un représentant (art. 4). Rien de cela n'a été traduit en exigence pour le Studio ni pour un projet généré.
- **Consentement aux SMS** : aucun champ ne le porte. La loi demande un consentement préalable pour la prospection (art. 47) ; un rappel de rendez-vous n'en est
  pas forcément une, ce qui reste à trancher.
- **Rôles et droits d'accès** (qui lit un compte rendu, qui saisit une note) : le contrat du canvas ne les représente pas.
- **Statuts** : ce sont des propositions, rien ne les impose.
- **Le modèle marketplace** garde `decimal` pour des montants en XOF.

## Sources (consultées le 7 novembre 2026)

Les pages ont été lues par un outil de lecture automatique qui résume ; les deux pages FHIR et la page GSM 03.38 n'ont été lues que
dans leur première partie (les listes de codes citées s'y trouvent).

| Sujet | Source |
|---|---|
| Rendez-vous : statuts, début et fin | [HL7 FHIR R4, Appointment](https://hl7.org/fhir/R4/appointment.html) |
| Patient : identifiant et coordonnées distincts et répétables | [HL7 FHIR R4, Patient](https://hl7.org/fhir/R4/patient.html) |
| Parent ou tuteur à part de l'élève | [Ed-Fi, Student Identification and Demographics](https://docs.ed-fi.org/reference/data-exchange/data-standard/4/model-reference/student-identification-and-demographics-domain/overview) |
| Franc CFA : 0 décimale (XOF 952, XAF 950) | [Liste ISO 4217 tenue par SIX](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml) |
| SMS : 160, 70, 153 et 67 caractères ; un caractère hors jeu change tout le message | [Twilio, limite de caractères d'un SMS](https://www.twilio.com/docs/glossary/what-sms-character-limit) |
| Jeu de caractères GSM 7 bits | [GSM 03.38](https://en.wikipedia.org/wiki/GSM_03.38) |
| USSD : session ouverte par l'utilisateur, 160 caractères, 30 secondes, confirmation, reçu par SMS | [Comment fonctionne l'USSD](https://mctaba.com/kb/how-ussd-works) (cette page ne traite pas de l'USSD déclenché par le réseau) |
| Statuts de suivi de colis | [DHL, API de suivi unifiée](https://support-developer.dhl.com/support/solutions/articles/47001197243-what-are-the-different-status-codes-available-in-the-dhl-shipment-tracking-unified-api-) et [TrackMage](https://docs.trackmage.com/docs/shipment/tracking-statuses.html) |
| Mécanique d'une tontine | [Low Impact, Rotating savings and credit associations](https://www.lowimpact.org/posts/topics/rotating-savings-credit-associations-roscas/) |
| Un même événement peut arriver deux fois, dans le désordre | [Stripe, webhooks](https://docs.stripe.com/webhooks) (section « Handle duplicate events ») |
| Clé d'idempotence pour un `POST` (brouillon, pas encore une norme) | [IETF, Idempotency-Key header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) |
| WhatsApp : modèles approuvés hors de la fenêtre de 24 heures | [Twilio, WhatsApp](https://www.twilio.com/docs/whatsapp/key-concepts) |
| Protection des données personnelles au Sénégal | [Loi n° 2008-12, texte publié par l'OMPI](https://www.wipo.int/wipolex/edocs/lexdocs/laws/fr/sn/sn009fr.pdf) |
