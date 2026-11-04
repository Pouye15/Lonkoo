# Service Agent IA (LONKOO)

Microservice interne dédié aux capacités d'intelligence artificielle de la plateforme LONKOO :
- **Esquisse (`/sketch`)** : Génère une architecture complète conforme au contrat Canvas v1 à partir d'un cahier des charges textuel.
- **Complétion (`/complete`)** : Fait évoluer le canvas d'architecture en intégrant de nouveaux composants ou en répondant à une consigne.
- **Audit (`/audit`)** : Analyse l'instantané du canvas et produit des recommandations de résilience, sécurité, stack et performance.
- **Chatbot interactif (`/chat`)** : Conseiller d'architecture logicielle temps réel contextuel au canvas courant.

## Architecture

Le service est conçu pour fonctionner en interne au sein du réseau Docker de LONKOO :
- Jamais exposé directement sur internet (non routé par Caddy).
- Appelé par le backend Spring Boot via un jeton de service partagé (`X-Service-Token`).
- Garde-fous intégrés : validation stricte JSON Schema + règles d'intégrité métiers (identifiants, types autorisés, mots réservés), boucle de reprise automatique auprès du LLM en cas de non-conformité.
- Moteur par défaut : Google Gemini (`gemini-3.8-flash`) via l'endpoint compatible OpenAI.

## Variables d'environnement

- `AI_API_KEY` : Clé d'API Google Gemini
- `AI_BASE_URL` : URL de base (défaut : `https://generativelanguage.googleapis.com/v1beta/openai`)
- `AI_MODEL` : Modèle LLM (défaut : `gemini-3.8-flash`)
- `AI_SERVICE_TOKEN` : Jeton de service interne partagé entre le backend et `agent_ia`
