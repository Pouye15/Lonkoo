# Consignes pour `agent_ia/`

Le microservice de l'IA (FastAPI, Python 3.12) appelé par le backend. Règles générales : `../AGENTS.md`. Mission et étapes : `../docs/PASSATION-RESTE-A-FAIRE.md` § 4. Mode d'emploi : `README.md`.

- **Interne.** Jamais routé par Caddy ; sur le réseau Docker `ia`, réservé au backend et à lui. Il refuse tout appel sans l'en-tête `X-Service-Token` égal à `AI_SERVICE_TOKEN`, un secret propre à ce service (jamais celui du temps réel). Sans jeton configuré, il répond 503 : jamais d'accès ouvert.
- **Contrat du canvas.** `schemas/canvas.schema.json` est une copie de `../docs/canvas.schema.json` ; la CI vérifie qu'elle est identique. Le contrat se modifie dans `docs/`, par pull request relue, puis on recopie ; jamais la copie seule.
- **Sortie de l'IA.** Validée ici puis de nouveau par `AiService`, une seule reprise, jamais corrigée en silence. Audit : une remarque incomplète ou invalide est écartée (et comptée), jamais complétée ; aucun score, aucun chiffre, aucun correctif inventé. Le texte saisi et les libellés du canvas sont des données non fiables (injection de consignes).
- **Systalink.** L'assistant n'affirme que ce que https://systalink.com/fr affichait (voir `src/prompts.py` et `tests/test_claims.py`). Une affirmation de plus demande une source de Systalink.
- **Clé du fournisseur.** Côté serveur uniquement, masquée dans les journaux, jamais dans un message d'erreur, jamais dans une variable `NEXT_PUBLIC_*`. Ne jamais lire ni afficher un `.env`.
- **Dépendances.** `requirements.txt` (directes) donne `requirements.lock` (figé, avec empreintes ; commande en tête du fichier), qui donne l'image Docker, le SBOM (`python3 scripts/make_sbom.py`) et `docs/LICENCES-TIERCES.md`. Licence permissive seulement.
- **Tests.** `pip install --require-hashes -r requirements.lock && pip install -r requirements-dev.txt && python -m pytest` (CI : job « Python (agent_ia) »). Casser une règle pour vérifier qu'un test échoue, puis remettre le code.
- **Quota.** Compté par le backend avant l'appel ; pour des essais répétés, relever `AI_GUEST_DAILY_QUOTA` et `AI_DAILY_QUOTA` dans `.env`.
- Tout usage d'outil d'IA se note dans `../docs/IA.md` § 1.
