# Composants tiers et licences

**Règle du règlement CADev (article 6) :** seuls les composants sous licence permissive (notamment MIT, Apache 2.0, BSD) sont admis. Les licences à réciprocité (GPL, AGPL, LGPL) rendent le projet **irrecevable**. Tous les composants et leurs licences sont déclarés à la soumission.

Mise à jour obligatoire à chaque nouvelle dépendance, dans la même pull request.

## 1. Composants utilisés

La colonne « Vérifié » se coche seulement après avoir lu la licence dans le dépôt ou le paquet du composant, et pas seulement ce tableau. Les licences indiquées sont celles que je connais, à confirmer.

| Composant | Version | Licence | Permissive ? | Usage | Source | Vérifié |
|---|---|---|---|---|---|---|
| Next.js | [x] | MIT | Oui | Frontend | npm | [ ] |
| React | [x] | MIT | Oui | Frontend | npm | [ ] |
| React Flow (@xyflow/react) | [x] | MIT | Oui | Canvas | npm | [ ] |
| Tailwind CSS | [x] | MIT | Oui | Style | npm | [ ] |
| Yjs | [x] | MIT | Oui | Synchronisation temps réel | npm | [ ] |
| y-websocket (client) / serveur à choisir (Hocuspocus, MIT) | [x] | MIT | Oui | Synchronisation et serveur temps réel | npm | [ ] |
| Spring Boot | [x] | Apache 2.0 | Oui | Backend | Maven | [ ] |
| PostgreSQL | 16 | Licence PostgreSQL | Oui | Base de données | Docker | [ ] |
| [Bibliothèque d'icônes] | [x] | [à vérifier] | [ ] | Icônes | [ ] | [ ] |
| | | | | | | |

## 2. Composants à surveiller (pièges connus)

| Composant | Problème | Action |
|---|---|---|
| Hibernate ORM (avant la version 7) | LGPL 2.1. La relicence Apache 2.0 ne s'applique qu'à partir de la 7.0 | Utiliser Hibernate 7 ou ne pas utiliser JPA. Vérifier avec `mvn dependency:tree` |
| Logback (journaux par défaut de Spring Boot) | Double licence EPL 2.0 ou LGPL 2.1 (1.5.x) | Remplacer par Log4j2, ou obtenir la confirmation de l'organisateur |
| OpenJDK | GPL 2 avec exception Classpath | Question posée à l'organisateur. Usage courant, à confirmer |
| Next.js : sharp / @img/sharp-libvips-* | LGPL-3.0-or-later, installé en dépendance optionnelle de `next` ; fait échouer le contrôle de licences | `"overrides": {"sharp": "file:./stubs/sharp"}` (stub local privé) et `images: { unoptimized: true }` dans next.config |
| jakarta.annotation-api | EPL 2.0 ou GPL 2 avec exception Classpath, présent dans toute application Spring Boot | Question à l'organisateur (voir QUESTIONS-ORGANISATEUR.md) |
| tldraw | Licence propre, clé exigée en production | Ne pas utiliser |
| PlantUML | Plusieurs licences au choix, la version GPL est la plus complète | Si utilisé, télécharger la version MIT ou Apache |
| Jakarta EE (certaines API) | Double licence EPL 2.0 ou GPL 2 avec exception Classpath | Vérifier dans le rapport de licences |

## 3. Assets (icônes, polices, images)

| Asset | Licence | Source |
|---|---|---|
| [ex. jeu d'icônes] | [MIT, ISC ou OFL] | [lien] |

Pas de logos de marques (Wave, Orange Money, WhatsApp, Systalink) sans autorisation.

## 4. Code antérieur au concours

Le règlement permet d'intégrer du code appartenant à un membre de l'équipe et antérieur au concours, à condition de le déclarer.

| Fichier ou dossier | Propriétaire | Date de création | Raison |
|---|---|---|---|
| Aucun | | | |

## 5. Vérification automatique

La CI (`.github/workflows/ci.yml`) contrôle les licences npm de façon bloquante et produit un rapport informatif pour Maven. Lancer aussi à la main avant la soumission :

```bash
# Java
cd backend && mvn org.codehaus.mojo:license-maven-plugin:2.4.0:add-third-party
# puis lire backend/target/generated-sources/license/THIRD-PARTY.txt

# Node
cd frontend && npx license-checker-rseidelsohn --production --summary
```
