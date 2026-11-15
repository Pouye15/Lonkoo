# Questions à l'organisateur

Journal des questions posées au comité CADev. Une ligne par question : date d'envoi, réponse, date de réponse.

| Question | Envoyée le | Réponse | Reçue le |
|---|---|---|---|
| Le règlement vise-t-il uniquement les bibliothèques liées au code, ou aussi l'environnement d'exécution (OpenJDK, images Docker, système) ? | | | |
| Les licences à double option (EPL 2.0 ou GPL 2 avec exception Classpath, ex. `jakarta.annotation-api` présent dans toute application Spring Boot) sont-elles admises ? | | | |
| Logback (EPL 2.0 ou LGPL 2.1) est-il admis, ou faut-il Log4j2 ? | | | |
| Les dépendances de développement et de build (MPL-2.0 : lightningcss, axe-core) entrent-elles dans le périmètre ? | | | |
| Une dépendance **livrée** sous MPL-2.0 est-elle admise ? Cas concret : `certifi` (magasin de certificats TLS, tiré par `httpx` dans le microservice IA), livré tel quel et jamais modifié — le copyleft de MPL-2.0 s'applique par fichier, et MPL n'est ni dans la liste permissive de l'article 6 ni dans la liste rédhibitoire (GPL, AGPL, LGPL). | | | |
| Quels droits le lauréat cède-t-il (choix de la licence finale du dépôt) ? | | | |
| Le dépôt est privé : comment donner accès au jury (invitation de comptes précis, ou passage en public à la soumission) ? | | | |

## Contact

- Courriel : cadev@systalink.com
- WhatsApp : +221 76 660 40 41
- Source : [page du concours](https://systalink.com/fr/coupe-afrique-des-developpeurs-cadev) (consultée le 16/10/2026). Aucun formulaire de contact visible.

## Questions supplémentaires nées de la lecture des pages Systalink

| Question | Envoyée le | Réponse | Reçue le |
|---|---|---|---|
| Où trouver le texte intégral du règlement (le lien « conditions générales » est vide) ? | | | |
| Remises : la page annonce « -40 % pour les équipes qui participent » et « -70 % pour tous les participants en 2026 ». Se cumulent-elles ? S'appliquent-elles au Serveur Cloud, à Dakar ? | | | |
| Le Serveur Cloud est-il hébergé à Dakar ? Donne-t-il un accès root ou sudo en SSH et autorise-t-il Docker ? | | | |
| Un domaine ou sous-domaine est-il fourni avec le produit acheté pour le concours ? | | | |
| La plateforme affiche une clôture le 15 novembre 2026 : est-ce bien à 17 h GMT ? Quelles sont les nouvelles dates du vote des pairs, de la campagne et de la notation par le jury ? | non posée : calendrier communiqué par l'organisation (message du 15/11) | Soumission prolongée jusqu'au lundi 16 novembre, 23 h 59 GMT. Vote des pairs : du mardi 17 novembre 00 h 00 au mercredi 18 novembre 23 h 59 GMT. Campagne des équipes et vote du public : du jeudi 19 novembre 00 h 00 au vendredi 20 novembre 23 h 59 GMT. Notation par le jury : 21 et 22 novembre. Résultats : lundi 23 novembre (inchangé) | 15/11 |
| Les projets que notre plateforme génère pour ses utilisateurs (du code livré, qui dépend par exemple d'Hibernate 6 sous LGPL et de Logback) entrent-ils dans le périmètre de l'interdiction des licences à réciprocité, ou seulement le code de la plateforme elle-même ? | | | |

## Message prêt à envoyer (version du 15/11, courriel ou WhatsApp)

> **Note du 15/11 (soir) :** la question 2 (calendrier) a reçu sa réponse (voir le tableau ci-dessus) : à retirer avant l'envoi. Le message dit encore « avant notre soumission » et que le dépôt est privé, alors que le projet est enregistré (message de l'organisation du 15/11) et le dépôt public : à réécrire avant tout envoi.

> **Objet : CADev 2026, équipe VISION X, 5 questions avant la clôture**
>
> Bonjour,
>
> Nous sommes l'équipe VISION X (5 membres), projet Lonkoo, en ligne sur https://lonkoo.site (adresse donnée dans notre soumission : https://5.22.217.55.sslip.io, qui y redirige). Avant notre soumission, merci de répondre par écrit :
>
> 1. **Dépôt :** le dépôt GitHub est privé aujourd'hui. Comment donner accès au jury (invitation de comptes précis, lesquels ? ou passage en public à la soumission) ?
> 2. **Calendrier :** la clôture est-elle bien le dimanche 15 novembre 2026 à 17 h GMT ? Quelles sont les dates et heures du vote des pairs (chaque membre doit-il voter, jusqu'à quand ?), de la campagne et de la notation par le jury ?
> 3. **Licences :** (a) une dépendance livrée sous MPL-2.0 et non modifiée (le magasin de certificats `certifi`, dans un microservice Python) est-elle admise ? (b) l'interdiction de GPL, AGPL et LGPL vise-t-elle seulement les bibliothèques liées à notre code, ou aussi l'environnement d'exécution (OpenJDK, images Docker) et les licences à double option (EPL 2.0 ou GPL 2 avec exception Classpath) ? (c) notre plateforme génère des projets de démarrage dont le code dépend d'Hibernate (LGPL) : entrent-ils dans le périmètre ?
> 4. **Hébergement :** notre serveur cloud Systalink est à Madrid (Datacloud ne propose pas Dakar), acheté avec le code promo CADEV. Votre support a validé l'étape 4 « Produit Systalink actif » le 15/11. Confirmez-vous que cet achat satisfait l'exigence du règlement, sans pénalité hors Dakar ?
> 5. **Déclarations :** la déclaration d'usage de l'IA est-elle de forme libre, et en faut-il une par membre ?
>
> Merci d'avance.
> L'équipe VISION X, représentée par [nom du représentant].
