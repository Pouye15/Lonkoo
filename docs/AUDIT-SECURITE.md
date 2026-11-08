# Audit de sécurité avant le jury (8 novembre 2026)

Le jury annonce des **tests d'intrusion** (on essaie d'attaquer la plateforme pour trouver ses failles). Ce document dit ce qui
a été vérifié, comment, ce qui a été corrigé, les risques que l'équipe accepte et doit savoir expliquer, et ce qui n'a **pas**
été fait. Audit mené par Claude Code à la demande d'Ibrahima Pouye : revue du code et de la configuration, vérifications sur la
pile locale (`localhost`), avis de sécurité des dépendances. Il ne remplace pas un test d'intrusion fait par une autre personne.

## En bref

- **Aucune faille grave trouvée.** Le contrôle d'accès, la session, les routes internes, la configuration de production et les
  dépendances tiennent, et la plupart sont déjà gardés par des tests.
- **Deux corrections** dans cette pull request :
  1. **Ticket du temps réel** : l'algorithme de signature n'était pas imposé. Un ticket signé en HS512 avec le bon secret était
     accepté (vérifié : le test échoue sans le correctif). Gravité faible, car il faut déjà connaître le secret. Le serveur
     n'accepte plus que HS256, celui que signe le backend ; trois tests ajoutés (autre algorithme, ticket expiré, ticket non signé).
  2. **Projet généré** : son API n'a aucune authentification, et le projet contient un workflow de déploiement. Le README généré
     le disait au milieu d'une liste ; il le dit maintenant **en tête**, avant « Démarrer » (testé sur les cinq modèles).
- **Risques acceptés**, à savoir expliquer : voir plus bas (CSP avec `'unsafe-inline'`, API générée ouverte, invités sans compte).
- **À faire avant la démo** : la liste en fin de document (serveur en profil `prod`, secrets régénérés, relecture de la PR n° 3).

## Ce qui a été vérifié

| Famille de failles (OWASP Top 10) | Ce qui est en place | Preuve |
|---|---|---|
| **Contrôle d'accès** (lire ou modifier le projet d'un autre en changeant un identifiant) | Chaque route vérifie le rôle sur l'objet demandé, dans le service : `requireRead`, `requireMemberRead`, `requireWrite`, `requireManageMembers` (canvas, versions, générations, IA, liens), `requireMember`, `requireManager`, `requireOwner` (projets, membres, discussion). Un non-membre reçoit 404 (le projet n'existe pas pour lui), un rôle insuffisant 403, sans session 401 | `AccessMatrixIntegrationTest` : chaque route sans session, par un non-membre et avec chaque rôle ; un refus ne laisse aucune trace. Générations, envoi sur GitHub et déploiements : `GenerationApiIntegrationTest`, `GithubPushIntegrationTest`, `DeploymentIntegrationTest` (non-membre 404, lecteur 403). Relu service par service le 08/11 |
| **Session et cookies** | Session serveur gardée en base ; cookie `HttpOnly`, `SameSite=Lax`, `Secure` en profil `prod` | `application*.properties` |
| **Requêtes intersites (CSRF)** | Pas de jeton CSRF : contrôle de l'en-tête `Origin` sur toute écriture, plus `SameSite=Lax`. Origines supplémentaires refusées au démarrage en profil `prod` | Essai local : une écriture depuis une autre origine reçoit **403 « Origine non autorisée »** |
| **Connexion GitHub** | `state` aléatoire de 32 octets, gardé en session et vérifié au retour | `GithubOAuthService` |
| **Temps réel (canvas partagé)** | Ticket JWT de 5 minutes : signature (**HS256 imposé** depuis cet audit), expiration, audience, émetteur, canvas attendu ; un accès retiré est refusé même avec un ticket encore valide ; les écritures d'une personne en lecture seule sont ignorées par le serveur ; tailles et débit limités (codes 4413, 4429) | `realtime/test/auth.test.js` (8 tests), `revocation.test.js`, `limits.test.js` ; parcours de bout en bout 01 et 06 |
| **Routes internes** (`/internal`, entre le temps réel et le backend) | Jeton de service comparé à temps constant ; Caddy répond 404 à `/internal` depuis l'extérieur | Essai local : **401** sans jeton ; `infra/Caddyfile` |
| **Injection SQL** | Requêtes paramétrées (`?`) ; les seules concaténations assemblent des constantes (noms de colonnes, de tables écrits en dur) | Relu le 08/11 |
| **XSS** (faire exécuter du code dans le navigateur d'un autre) | React échappe tout texte. Deux insertions de HTML brut seulement : le script de thème (constant) et le schéma SVG du comparateur, dont tout texte saisi passe par `escapeXml` et dont les attributs ne reçoivent que des nombres et des constantes. Liens externes filtrés par `safeHttpUrl` (http et https seulement) | `canvas-export.test.ts` (titres piégés), relu le 08/11 |
| **SSRF** (forcer le serveur à appeler une adresse interne) | L'adresse publique d'un déploiement est validée puis seulement affichée, jamais appelée ; les appels sortants vont à GitHub, au temps réel et au fournisseur d'IA, adresses fixées par la configuration | `DeploymentService.validPublicUrl` |
| **Fuite d'informations** | Erreurs au format `problem+json` sans trace ni nom de classe ; seule la route de santé est exposée, sans détails en production | Essais locaux : `actuator/env`, `heapdump`, `beans`… répondent **404** avec une session ; un identifiant mal formé donne 400 sans trace |
| **Déni de service applicatif** | Corps limités (2 Mio par Caddy, 413 côté backend), messages du temps réel limités (2 Mio, débit par connexion), plafonds par personne (projets, canvas, versions, liens), discussion limitée (429), invités limités par adresse, quota d'IA par jour | `docs/AUDIT-ET-ROADMAP-BACKEND.md` § 5.2, tests associés. L'adresse du client vient de Caddy, que le client ne peut pas forger (Tomcat ne croit `X-Forwarded-For` que du réseau interne) |
| **En-têtes de sécurité** | Interface : CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` ; Caddy : HSTS, `nosniff`, en-tête `Server` retiré | Essai local sur l'interface ; `next.config.ts`, `infra/Caddyfile` |
| **Exposition réseau en production** | Seul Caddy publie des ports (80, 443) ; la base est sur un réseau interne joignable par le seul backend | `infra/docker-compose.prod.yml` |
| **Composants vulnérables** | `npm audit` : **0 avis** (interface et temps réel) ; OSV : **0 avis** sur les 102 dépendances Java d'exécution (au 08/11) ; Dependabot ; job d'avis de la CI | Commandes lancées le 08/11 |
| **Secrets** | Aucun secret dans le dépôt ; `gitleaks` sur tout l'historique à chaque CI | Job « Détection de secrets » |

## Risques acceptés : quoi répondre au jury

- **La CSP de l'interface contient `'unsafe-inline'`** (et `'unsafe-eval'` en développement seulement). Un scanner le relèvera.
  Raison : Next.js insère des scripts dans la page. Ce qui protège quand même : React échappe tout texte, aucun HTML saisi n'est
  inséré tel quel, le seul SVG inséré est échappé et testé. Pour aller plus loin : une CSP à *nonce* (fichier `proxy.ts` de
  Next.js), qui rend toutes les pages dynamiques ; pas fait, à peser après la démo.
- **L'API d'un projet généré n'a pas d'authentification.** C'est un projet de démarrage : le bloc d'authentification du canvas est
  documenté, pas codé. Le README généré le dit maintenant en premier.
- **On entre sans compte (invité).** Voulu pour essayer la plateforme : session de 24 h, plafonds, nombre d'invités limité par adresse.
- **Les actions GitHub de la CI sont épinglées par version** (`actions/checkout@v7`), pas par empreinte : une action compromise à
  la même version passerait. Risque faible pour un dépôt privé ; l'épinglage par empreinte est la pratique la plus stricte.

## À faire avant la démo

- [ ] Serveur en **profil `prod`** : le backend refuse alors de démarrer avec une valeur `change-me`, un secret trop court ou une
      adresse publique sans `https` (`ConfigurationCheck`) ; cookie `Secure`.
- [ ] **`EXTRA_ALLOWED_ORIGINS` vide** sur le serveur (le profil `prod` refuse de démarrer sinon).
- [ ] **Régénérer le secret de l'application OAuth GitHub de développement** (il a été collé un temps dans `.env.example`) et
      créer une application OAuth **distincte** pour la production.
- [ ] Une fois le serveur en ligne, passer son adresse dans un analyseur d'en-têtes public (par exemple Mozilla Observatory) et
      noter le résultat ici.
- [ ] **Relire la sécurité de la PR n° 3** (agent IA) avant de la fusionner : elle ajoute un service exposé et une clé de
      fournisseur d'IA ; les textes du canvas sont des données non fiables (injection de consignes), voir la passation § 4.5.

## Ce qui n'a pas été fait

- **Pas de scanner automatique** (OWASP ZAP ou équivalent) ni de test de charge : ce sont des outils que le jury peut utiliser.
- **Pas d'essai contre le serveur de production** : il n'existe pas encore.
- **La PR n° 3** (agent IA) n'est pas couverte : elle n'est pas dans `main`.
- **Le projet généré** a été relu (README, absence d'authentification), pas attaqué.
- Deux points viennent de la passation et n'ont **pas** été revérifiés ici : le jeton GitHub gardé en mémoire et jamais en base, et
  le journal d'audit sans contenu des messages.
