# Service Agent IA (LONKOO)

Microservice interne dédié aux capacités d'intelligence artificielle de la plateforme LONKOO :
- **Esquisse (`/sketch`)** : Génère une architecture complète conforme au contrat Canvas v1 à partir d'un cahier des charges textuel.
- **Complétion (`/complete`)** : Fait évoluer le canvas d'architecture en intégrant de nouveaux composants ou en répondant à une consigne.
- **Audit (`/audit`)** : Analyse l'instantané du canvas et produit des recommandations de résilience, sécurité, stack et performance.
- **Chatbot interactif (`/chat`)** : Conseiller d'architecture logicielle temps réel contextuel au canvas courant.

## Architecture

Le service est conçu pour fonctionner en interne au sein du réseau Docker de LONKOO :
- Jamais exposé directement sur internet (non routé par Caddy).
- Appelé par le backend Spring Boot seulement, sur un réseau Docker (`ia`) qu'ils sont seuls à partager, avec le jeton de service `X-Service-Token`. Sans jeton configuré, le service répond 503 à tout (sauf `/health`) : jamais d'accès ouvert.
- Garde-fous intégrés : validation stricte JSON Schema + règles d'intégrité métiers (identifiants, types autorisés, mots réservés), boucle de reprise automatique auprès du LLM en cas de non-conformité.
- Moteur par défaut : Google Gemini (`gemini-3.8-flash`) via l'endpoint compatible OpenAI.

## Variables d'environnement

- `AI_API_KEY` : Clé d'API Google Gemini
- `AI_BASE_URL` : URL de base (défaut : `https://generativelanguage.googleapis.com/v1beta/openai`)
- `AI_MODEL` : Modèle LLM (défaut : `gemini-3.8-flash`)
- `AI_SERVICE_TOKEN` : jeton de service, **obligatoire**, propre à ce service (jamais le jeton du temps réel), 16 caractères au moins

## Tests et dépendances

```bash
cd agent_ia
pip install --require-hashes -r requirements.lock   # versions et empreintes figées (Linux, Python 3.12)
pip install -r requirements-dev.txt                 # pytest, jamais livré
python -m pytest
```

`requirements.txt` liste les dépendances directes ; `requirements.lock` en est la version figée (la commande qui la régénère est en tête du fichier). C'est lui qui construit l'image et qui alimente `docs/sbom/agent_ia.cdx.json` et `docs/LICENCES-TIERCES.md`.

## Ce qui n'a pas été essayé en vrai

- Aucun appel à Gemini avec une vraie clé : les tests simulent le fournisseur. L'option `response_format: json_object` n'est pas documentée par Google pour son endpoint compatible OpenAI (la page montre les sorties structurées par schéma) : à essayer en premier avec une clé.
- L'image Docker n'a pas été construite sur le poste où ces correctifs ont été écrits (pas de Docker) : la CI la construit (job « Pile de production »).

