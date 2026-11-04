# Suite de la pull request n° 3 (agent IA) : l'état au 04/11/2026 et ce qu'il reste à faire

**Pour Serigne Fallou Ngom et son assistant IA.** À lire en entier avant de toucher au code. Il complète
[PASSATION-RESTE-A-FAIRE.md](PASSATION-RESTE-A-FAIRE.md) (§ 3.7 les contrôles, § 4 la mission IA, § 5 Docker) et
[../AGENTS.md](../AGENTS.md) (les règles).

## 0. En quatre phrases

1. Ta pull request n° 3 (`ia_agent`, dernier commit `d191470`) a été relue par Ibrahima avec Claude Code. Elle fonctionne dans les
   tests, mais elle avait des défauts de fond : un agent ouvert à tout le réseau quand son jeton est vide, et surtout des **réponses et
   des chiffres fabriqués** par l'interface (analyse de repli, réponses du conseiller, score et correctif ajoutés à chaque remarque).
2. Les corrections sont faites et vérifiées dans la branche **`fix/ia-agent-revue`** : 5 commits posés sur ton dernier commit, donc sans
   conflit avec lui. **Ta branche `ia_agent` n'a pas été modifiée.**
3. Il reste ce que seules des personnes avec une clé Gemini, un compte et Docker peuvent faire (section 4) : l'essai réel avec Gemini
   (`IA-6`), la pile Docker complète (`DK-1`), les décisions de compte et de licence.
4. Rien n'est inventé ici : chaque phrase dit ce qui a été fait, vérifié ou **pas essayé**.

## 1. Où est quoi

| Branche | Contenu | Remarque |
|---|---|---|
| `ia_agent` | ta pull request n° 3, `d191470` | **2 commits de retard** sur `backend` (le correctif « Connexion au canvas partagé… » et le script de vidéo de démonstration) ; fusion sans conflit d'après GitHub |
| `fix/ia-agent-revue` | `ia_agent` + 5 commits de relecture | **c'est de là qu'il faut repartir** |
| `backend` | base de la pull request n° 2 (`04915d6`) | c'est aussi la base de ta pull request n° 3 |
| `main` | seulement le README | la fusion de la pull request n° 2 n'est pas faite (personne ne l'a relue) |

Les 5 commits, dans l'ordre :

| Commit | Ce qu'il fait |
|---|---|
| `2f5a2ea` | **jeton de service** (agent fermé sans jeton, jeton propre, refus de démarrer en production), **réseau Docker `ia`**, **audit sans valeur inventée** (`AiFindingParser`, `parse_findings`), clé d'API masquée dans les journaux, consignes sans affirmations non confirmées sur Systalink, **tests Python** (le commit suivant les porte à 71) et tests du chat côté backend |
| `3ded844` | **interface** : l'onglet « Analyse IA » et le conseiller (panneau et widget) n'inventent plus rien ; `lib/audit-findings.ts` et ses 8 tests |
| `8936278` | **dépendances** : `agent_ia/requirements.lock` (empreintes), SBOM et contrôle de licences Python, job de CI « Python (agent_ia) », contrat du canvas copié identique |
| `07a3351` | **documents** : `docs/IA.md` corrigé, `agent_ia/CLAUDE.md`, README de l'agent, passation |
| 5e commit (le dernier de la branche) | **jeton vérifié avant la lecture du corps** (middleware), plus de `/docs` ni de `/openapi.json` servis, 71 tests, ce document |

### Récupérer la branche (Codespaces ou poste)

```bash
git remote -v                         # le dépôt s'appelle « origin » dans un Codespace, « upstream » chez Ibrahima
git fetch origin                      # (ou upstream)
git switch -c fix/ia-agent-revue --track origin/fix/ia-agent-revue
git log --oneline -6                  # les 5 commits ci-dessus au-dessus de d191470
```

Le devcontainer du dépôt (`.devcontainer/devcontainer.json`) fournit Java 21, Node 24, Python 3.12 **et Docker** : un Codespace suffit pour
tout ce qui suit.

## 2. Ce que la relecture a trouvé, et ce qui est corrigé

| Défaut | Pourquoi c'était grave | Correctif | Test |
|---|---|---|---|
| Jeton vide = agent ouvert à tout le réseau Docker ; repli sur `REALTIME_SERVICE_TOKEN` (un secret pour deux services) ; jeton vérifié **après** la lecture du corps (essayé en vrai en HTTP : un appel sans jeton recevait 422 avec le détail des champs attendus) ; `/docs` et `/openapi.json` servis | n'importe quel conteneur du réseau pouvait appeler l'IA et consommer le quota de Google | middleware : 503 sans jeton, 403 avec un mauvais, avant toute lecture du corps ; comparaison à temps constant ; plus de repli (agent **et** backend) ; plus de `/docs` ; en production `ConfigurationCheck` refuse de démarrer sans un jeton propre de 16 caractères au moins | `agent_ia/tests/test_service_token.py`, `ConfigurationCheckTest` |
| L'agent partageait le réseau de la base et de Caddy | surface d'attaque inutile | réseau `ia` : seulement le backend et l'agent | relu dans `docker-compose.yml` et `infra/docker-compose.prod.yml` ; **pas essayé sous Docker** |
| Audit : titre vide → « Remarque d'architecture », gravité inconnue → « recommandée », catégorie inconnue → « stack », et `patch` / `impactScore` inventés (« +35% RPS ») | des valeurs fabriquées présentées comme un résultat d'IA | une remarque incomplète ou invalide est **écartée**, jamais complétée | `test_audit.py`, `AiFindingParserTest` |
| **L'interface** fabriquait une analyse complète (« 28.5k RPS », « 99.99% SLA », « +18 pts ») quand le serveur échouait, ajoutait score et correctif à chaque vraie remarque, et « Appliquer » les écrivait dans le canvas partagé | le jury aurait pu voir de fausses analyses, et le canvas pouvait être modifié par des valeurs inventées | la remarque du serveur est affichée telle quelle, **consultative** (« à appliquer à la main ») ; échec = message d'erreur | `frontend/src/lib/audit-findings.test.ts` ; **pas essayé dans un navigateur** |
| Le conseiller répondait par des textes écrits d'avance quand le serveur échouait, faisait une seconde tentative automatique (deux fois dans le quota) et renvoyait ces textes au serveur comme si l'assistant les avait dits | réponses fausses, quota gaspillé | une seule demande, l'erreur du serveur s'affiche, les messages d'accueil et d'erreur ne repartent plus | `AiChatRoutesIntegrationTest` (côté serveur) ; **pas essayé dans un navigateur** |
| Affirmations sur Systalink absentes de sa page (latence < 15 ms, réplication synchrone, SystaDrive S3, anti-DDoS, GPU, Kubernetes managé) | on ne peut pas prêter à un partenaire ce qu'il n'a pas écrit | seuls restent : serveur cloud (région Dakar, prix en FCFA), Orion, Connexion MCP, Yokk (page lue le 04/11/2026) | `agent_ia/tests/test_claims.py` |
| Cinq dépendances Python déclarées nulle part ; le contrôle du SBOM ne lisait que Maven et npm, donc la CI restait verte | règle « licences permissives et SBOM » non tenue | lock avec empreintes, SBOM `agent_ia.cdx.json`, `scripts/check_licenses_python.py` | `make_sbom.py --verify`, job « Python (agent_ia) » |
| `docs/IA.md` : 4 cases « vérifié » cochées sans preuve ; les « (à confirmer) » d'Ibrahima et la ligne du lot R8 retirés | déclaration inexacte au jury | cases remplacées par des points à vérifier, sourcés ; lignes d'Ibrahima rétablies | relecture |
| `CLAUDE.md` racine : section « Branche en cours » | périmée dès la fusion, lue par tous les assistants | retirée ; règles dans `agent_ia/CLAUDE.md` | |

## 3. Ce qui est vérifié, et ce qui ne l'est pas

Vérifié en local par Ibrahima (poste Windows, **sans Docker**) sur les commits de la branche :

| Contrôle | Résultat |
|---|---|
| `cd backend && ./mvnw test` | 403 tests, 0 échec, 1 ignoré |
| `cd realtime && npm test` | 50 tests |
| `cd frontend && npm test && npm run lint && npm run typecheck` | 79 tests, lint et types sans erreur |
| `cd agent_ia && python -m pytest` | 71 tests ; sept règles cassées volontairement sont bien détectées |
| `python3 scripts/make_sbom.py --verify` | 4 SBOM à jour |
| `python3 scripts/check_licenses_python.py docs/sbom/agent_ia.cdx.json` | aucune licence GPL, AGPL, LGPL (exception `certifi`, voir 4.7) |
| OpenAPI, copie du contrat, gitleaks sur les 5 commits | corrects, aucun secret |

**Jamais essayé** (c'est ton travail, section 4) :

- **Aucun appel à Gemini avec une vraie clé.** Les tests simulent le fournisseur. L'option `response_format: json_object` n'est pas
  documentée par Google pour son endpoint compatible OpenAI.
- **Aucune construction Docker** de l'agent ni de la pile. Le lock a seulement été téléchargé avec vérification des empreintes pour Linux
  / Python 3.12 (28 roues). L'agent a en revanche été lancé pour de vrai (uvicorn) et appelé en HTTP : santé 200, 403 sans bon jeton, 503 sans jeton configuré.
- Le parcours dans un navigateur (`e2e/`, 71 vérifications au 25/10) n'a pas été relancé ; aucun scénario ne couvre encore l'IA.
- Le job « Python (agent_ia) » de la CI n'a **jamais tourné sur GitHub**. La CI ne tourne que sur une pull request (ou un push sur `main`) :
  une branche poussée seule n'a pas de CI.

## 4. Ce qu'il te reste à faire

Dans l'ordre. Chaque tâche dit quand elle est **finie**. Note ce que tu fais dans le journal de la passation (§ 13).

### 4.1 `PR3-1` Récupérer la branche et rejouer les contrôles (30 minutes)

Fait quand : sur `fix/ia-agent-revue`, les commandes du tableau de la section 3 passent chez toi (Codespace compris). Pour l'agent :

```bash
cd agent_ia
python -m pip install --require-hashes -r requirements.lock
python -m pip install -r requirements-dev.txt
python -m pytest
```

### 4.2 `PR3-2` Intégrer ton travail local, s'il y en a (surtout la dockerisation)

Tu as dit à Ibrahima avoir dockerisé le projet. Ce qui est **dans ta pull request** : `docker-compose.yml` à la racine, `agent_ia/Dockerfile`,
et le service `agent_ia` dans `infra/docker-compose.prod.yml`. **Si tu as autre chose en local, non poussé** (Dockerfile modifiés, autre
compose), pose-le **sur** `fix/ia-agent-revue` plutôt que sur `ia_agent` :

```bash
git switch -c ma-docker fix/ia-agent-revue
git merge <ta branche locale>        # ou : git cherry-pick <tes commits>
```

Conflits probables : `docker-compose.yml`, `agent_ia/Dockerfile`, `infra/docker-compose.prod.yml`, `.env.example`. **Garde ces règles** en
les résolvant :

1. l'agent n'est que sur le réseau `ia` (le backend aussi), jamais sur `web` ni `data` ;
2. l'agent a son propre `AI_SERVICE_TOKEN` et **plus aucun** `REALTIME_SERVICE_TOKEN` ;
3. le `Dockerfile` installe depuis `requirements.lock` avec `--require-hashes` ; si tu changes `requirements.txt`, régénère le lock
   (commande en tête du fichier), puis `python3 scripts/make_sbom.py` et `docs/LICENCES-TIERCES.md` ;
4. pas de secret dans un fichier suivi par git (le hook gitleaks ne se contourne pas).

Fait quand : une seule branche porte ta dockerisation et les corrections, et les contrôles de 4.1 passent encore.

### 4.3 `DK-1` La pile complète sous Docker (c'est la première vraie construction)

Dans un Codespace ou sur un poste avec Docker :

```bash
cp .env.example .env                   # puis NE JAMAIS commiter .env
AI_PROVIDER=fake docker compose up -d --build     # démonstration, sans clé
docker compose ps                      # db, backend, agent_ia, realtime, frontend, caddy : tous « healthy »
```

Ouvre `http://localhost:3000` (le Codespace redirige le port 3000), « Essayer sans compte », ouvre le studio. Puis vérifie, et **note le
résultat réel de chaque ligne** :

| À vérifier | Commande ou geste | Attendu |
|---|---|---|
| L'image de l'agent se construit avec les empreintes | `docker compose build agent_ia` | succès ; si une roue manque pour l'image, le dire avec le message exact |
| L'agent est fermé sans le bon jeton (les images n'ont pas `curl` : on passe par Python) | `docker compose exec agent_ia python -c "import urllib.request as u; print(u.urlopen(u.Request('http://127.0.0.1:8000/audit', data=b'{}', headers={'Content-Type': 'application/json'})).status)"` | une erreur dont la dernière ligne est `HTTP Error 403: Forbidden` |
| L'interface ne joint pas l'agent | `docker compose exec frontend node -e "fetch('http://agent_ia:8000/health').then(r=>console.log(r.status)).catch(e=>console.log('injoignable', e.cause&&e.cause.code))"` | `injoignable ENOTFOUND` (même vérification depuis `caddy` : `docker compose exec caddy wget -qO- http://agent_ia:8000/health`, qui doit échouer) |
| Le backend joint l'agent | « Analyse IA » avec `AI_PROVIDER=agent_ia` et une clé (4.4) | des remarques, ou l'erreur claire du serveur |
| Le démarrage de production refuse un jeton vide | `infra/docker-compose.prod.yml` avec `AI_PROVIDER=agent_ia` et sans `AI_SERVICE_TOKEN` | le backend ne démarre pas, message « AI_SERVICE_TOKEN est vide… » |

Fait quand : le tableau est rempli avec de vrais résultats dans le journal de la passation, et tout défaut trouvé est corrigé (un
changement = un test).

### 4.4 `IA-6` Essai réel avec Gemini

1. Crée une clé dans Google AI Studio **liée à un compte avec facturation** (voir 4.5), mets-la dans `.env` (`AI_API_KEY=…`), jamais ailleurs.
2. Essaie les routes à la main (Annexe B de la passation), et `AI_PROVIDER=agent_ia` en premier.
3. **Teste d'abord `response_format: json_object`** (`agent_ia/src/gemini.py`). Si Google le refuse (erreur 400), passe à une sortie
   contrainte par schéma ou retire l'option : la validation du contrat et la reprise protègent déjà la sortie. Ajoute le test qui
   correspond.
4. Note la latence et le coût d'un appel, puis règle `AI_GLOBAL_DAILY_CAP` (plafond de coût par jour = plafond × coût moyen).
5. Vérifie le nom `gemini-3.8-flash` ce jour-là (page des modèles de Google : étiquette « New », pas « Stable » au 04/11/2026).

Fait quand : une esquisse, une complétion, un audit et un échange de conseiller réels ont réussi, avec latence et coût notés dans
`docs/IA.md` § 2.

### 4.5 `PR3-3` Les décisions de compte et de données (avec Ibrahima)

Conditions de l'API Gemini lues le 04/11/2026 (en vigueur le 23 mars 2026) : **niveau gratuit** = Google peut réutiliser ce qu'on envoie
et des relecteurs humains peuvent le lire, et il est demandé de ne pas envoyer d'information personnelle ; **niveau payant** = pas de
réutilisation. Cette lecture est un résumé d'outil : relis les conditions toi-même.

- Décider si la démo et la production utilisent un compte payant.
- Écrire un avertissement dans l'interface (« ne saisissez pas de données personnelles ») avec Fall : le texte saisi part tel quel chez
  Google.
- Cocher ou corriger les cases de `docs/IA.md` § 2 une fois chacune vérifiée.
- Valider ou corriger **tes** lignes de `docs/IA.md` § 1 et § 3 (« à confirmer »).

### 4.6 `PR3-4` Essayer l'interface dans un navigateur, avec Fall

Fall est le propriétaire de `frontend/` : il relit `3ded844` (`studio/page.tsx`, `ChatbotPanel.tsx`, `FloatingChatWidget.tsx`). Essais à
faire à la main, serveur lancé :

| Cas | Attendu |
|---|---|
| Analyse IA, `AI_PROVIDER=fake` | trois remarques d'exemple dont le texte dit « réponse figée de démonstration » ; pas de score ; « Remarque à appliquer à la main » |
| Analyse IA, serveur arrêté | message « Le serveur ne répond pas… », aucune remarque inventée |
| Analyse IA, `AI_GUEST_DAILY_QUOTA=1` puis deux analyses | la seconde affiche le message de limite du jour |
| Conseiller (widget et panneau), quota épuisé | le message d'erreur du serveur dans la conversation, un seul appel compté |
| Conseiller, serveur arrêté | message d'erreur, pas de réponse écrite d'avance |
| Projet de démonstration hors connexion | remarques étiquetées « Démonstration » |

Fait quand : chaque ligne est essayée et corrigée si elle ne se comporte pas ainsi. Idéal : un scénario `e2e/` pour l'IA avec
`AI_PROVIDER=fake`.

### 4.7 `PR3-5` Pull requests et fusion, dans cet ordre

1. **La pull request n° 2 d'abord** (`backend` → `main`) : elle n'a aucune relecture. Fusion par « merge commit », jamais « squash ».
2. Remettre `fix/ia-agent-revue` dans ta pull request : soit Ibrahima fait un `git push` de cette branche vers `ia_agent` (avance rapide,
   sans conflit si tu n'as rien poussé entre-temps), soit tu fusionnes toi-même `fix/ia-agent-revue` dans `ia_agent`.
3. Fusionner `backend` dans `ia_agent` (2 commits de retard), puis **changer la base de la pull request n° 3 vers `main`** une fois la n° 2
   fusionnée : sinon la n° 3 ajoute 3 700 lignes à la n° 2 avant que personne ne l'ait relue.
4. Les deux exécutions de CI sur les commits du bot `copilot-swe-agent` attendent « Approve and run » (page de la pull request). Résultat
   attendu : 13 jobs, dont « Python (agent_ia) » et « Pile de production (compose) » qui construit l'image de l'agent pour la première fois.
5. **`certifi` (MPL-2.0)** : dépendance obligatoire de HTTPX. Exception déclarée dans `scripts/check_licenses_python.py` et
   `docs/LICENCES-TIERCES.md` § 2 ; la question est écrite dans `docs/QUESTIONS-ORGANISATEUR.md`. **Rien n'est décidé** : Ibrahima l'envoie à
   l'organisateur. Repli si c'est refusé : remplacer HTTPX par un client HTTP sans `certifi`.

### 4.8 `IA-9` La démo de secours

Au cas où Gemini serait indisponible le jour du jury : une courte vidéo ou des captures d'une esquisse et d'un audit réussis. Le script
`e2e/manuel/demo-video.mjs` (sur `backend`, donc après la fusion 4.7) filme le parcours général ; ajoute l'IA une fois 4.3 et 4.4 faites.

### 4.9 Petits restes (facultatifs, à couper en premier)

- Le compteur `discarded` de l'audit ne compte pas les remarques mal formées écartées par les clients (il compte celles qui visent un bloc
  absent). L'interface n'affiche pas ce compteur.
- Le chat n'est limité que par message (8000 caractères, 20 messages) ; seul le quota du jour borne le coût.
- `.env.example` choisit `AI_PROVIDER=agent_ia` (bon avec Docker). Sans Docker, mets `fake` ou `off`, sinon « service IA injoignable ».
- Je n'ai pas vérifié l'en-tête `Content-Type` réel des routes de flux (`chat/stream`) ; l'interface lit le flux avec `fetch` et n'en dépend pas.
- Le nom du modèle et le prix peuvent changer chez Google : à revérifier la veille de la démo.

## 5. Pièges rencontrés pendant la relecture

- **gitleaks se déclenche sur un jeton écrit en dur dans un test** (`TOKEN = "…0123456789"`). Dans les tests, tire-le au hasard
  (`secrets.token_hex(16)`), comme `agent_ia/tests/conftest.py`.
- **`uv pip compile` derrière certains pare-feu** échoue sur le certificat : ajoute `--system-certs`.
- **Marqueurs de plateforme** : `pip freeze` sous Windows n'a pas `uvloop` ; le lock est calculé pour Linux, c'est lui qui fait foi.
- **Fins de ligne** : le dépôt est en CRLF sur Windows ; un script de modification qui réécrit un fichier doit les conserver.
- **Une branche sans pull request n'a pas de CI** : ouvre une pull request (avec l'accord d'Ibrahima) pour voir les 13 jobs.
- `fastapi.testclient` affiche un avertissement de Starlette (« installe httpx2 ») : sans effet aujourd'hui, à surveiller à la prochaine
  mise à jour du lock.

## 6. Règles qui ne changent pas

Ne pousse jamais sur `main`. N'ouvre pas de pull request sans l'accord d'Ibrahima. Aucun secret dans git (ni `.env`, ni clé). Licences
permissives seulement, déclarées dans `docs/LICENCES-TIERCES.md` et dans le SBOM. **N'invente ni chiffre, ni résultat de test, ni
affirmation** sur un partenaire : dis ce qui n'a pas été essayé. Un changement = son test (et casse volontairement la règle pour vérifier
qu'il échoue). Note tout usage d'IA dans `docs/IA.md`, et sois capable d'expliquer ce que tu pousses.
