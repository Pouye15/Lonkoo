# Composants tiers et licences

**Règle du règlement CADev (article 6) :** seuls les composants sous licence permissive (notamment MIT, Apache 2.0, BSD) sont admis. Les licences à réciprocité (GPL, AGPL, LGPL) rendent le projet **irrecevable**. Tous les composants et leurs licences sont déclarés à la soumission.

Mise à jour obligatoire à chaque nouvelle dépendance, dans la même pull request.

## 1. Composants utilisés

La colonne « Vérifié » se coche seulement après avoir lu la licence dans le dépôt ou le paquet du composant, et pas seulement ce tableau. Les licences indiquées sont à confirmer à la source avant de cocher « Vérifié ».

| Composant | Version | Licence | Permissive ? | Usage | Source | Vérifié |
|---|---|---|---|---|---|---|
| Next.js | 16.4.2 | MIT | Oui | Frontend | npm | [x] |
| React / React DOM | 19.3.1 | MIT | Oui | Frontend | npm | [x] |
| React Flow (@xyflow/react) | [x] | MIT | Oui | Canvas | npm | [ ] |
| Tailwind CSS (et @tailwindcss/postcss) | 4.3.3 | MIT | Oui | Style (build uniquement) | npm | [x] |
| @phosphor-icons/react | 2.1.10 | MIT | Oui | Icônes | npm | [x] |
| TypeScript | 6.0.3 | Apache 2.0 | Oui | Compilation et vérification des types (développement) | npm | [x] |
| ESLint, eslint-config-next | 9.39.5, 16.4.2 | MIT | Oui | Lint (développement) | npm | [x] |
| caniuse-lite (dépendance de next) | 1.0.30001816 | CC-BY-4.0 | Oui (données, attribution) | Table de compatibilité des navigateurs, livrée avec next | npm | [x] |
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
| Next.js : sharp / @img/sharp-libvips-* | LGPL-3.0-or-later, installé en dépendance optionnelle de `next` ; fait échouer le contrôle de licences | Fait : `frontend/stubs/sharp` (paquet privé, version 0.35.5) déclaré comme **workspace npm** (`"workspaces": ["stubs/sharp"]`) : il satisfait la plage demandée par `next`, donc npm le lie au lieu de télécharger sharp et libvips ; `images: { unoptimized: true }` dans `next.config.ts`. Vérifié le 2026-10-20 : `npm ci` n'installe aucun `@img/*`. Ne pas utiliser `overrides` avec `file:` : le chemin est résolu depuis `node_modules/next` et `npm ci` échoue. Si `next` change la plage de `sharp`, relever la version du stub (la CI le signale) |
| jakarta.annotation-api | EPL 2.0 ou GPL 2 avec exception Classpath, présent dans toute application Spring Boot | Question à l'organisateur (voir QUESTIONS-ORGANISATEUR.md) |
| tldraw | Licence propre, clé exigée en production | Ne pas utiliser |
| PlantUML | Plusieurs licences au choix, la version GPL est la plus complète | Si utilisé, télécharger la version MIT ou Apache |
| Jakarta EE (certaines API) | Double licence EPL 2.0 ou GPL 2 avec exception Classpath | Vérifier dans le rapport de licences |

## 3. Assets (icônes, polices, images)

| Asset | Licence | Source |
|---|---|---|
| Geist et Geist Mono (polices) | SIL Open Font License 1.1 | Google Fonts, chargées par `next/font/google` et auto-hébergées au build |

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
