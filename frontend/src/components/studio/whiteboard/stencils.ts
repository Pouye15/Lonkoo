import type { ArchitectureShape, NodeRole } from "@/lib/lonkoo-data";

/**
 * Préréglages de stack technique, par forme de bloc.
 * Un bloc déposé sur le canevas n'a aucune stack imposée (tech: "") : l'utilisateur peut le laisser
 * purement logique, choisir un préréglage en un clic ou saisir une stack libre.
 */
export interface TechStackPreset {
  name: string;
  version: string;
  port: number;
  description: string;
  baseLatencyMs: number;
  maxRpsCapacity: number;
  envVars: string[];
}

export const STACK_PRESETS_BY_SHAPE: Record<ArchitectureShape, TechStackPreset[]> = {
  generic: [
    {
      name: "Docker Container",
      version: "v27.0",
      port: 8080,
      description: "Conteneur applicatif générique isolé.",
      baseLatencyMs: 2.5,
      maxRpsCapacity: 12000,
      envVars: ["PORT", "ENV"],
    },
    {
      name: "Node.js Runtime",
      version: "v22 LTS",
      port: 3000,
      description: "Service JavaScript / TypeScript polyvalent.",
      baseLatencyMs: 5.0,
      maxRpsCapacity: 9000,
      envVars: ["NODE_ENV"],
    },
    {
      name: "Go Binary",
      version: "v1.23",
      port: 8080,
      description: "Binaire compilé léger haute concurrence.",
      baseLatencyMs: 2.0,
      maxRpsCapacity: 16000,
      envVars: ["GOMAXPROCS"],
    },
  ],
  cylinder: [
    {
      name: "PostgreSQL 16 HA",
      version: "v16.4",
      port: 5432,
      description: "Stockage relationnel ACID avec réplique de lecture et PgBouncer.",
      baseLatencyMs: 6.2,
      maxRpsCapacity: 8000,
      envVars: ["POSTGRES_DB", "POSTGRES_USER", "PGBOUNCER_POOL_MODE"],
    },
    {
      name: "MySQL 8.4 LTS",
      version: "v8.4",
      port: 3306,
      description: "Base relationnelle InnoDB avec réplication binaire.",
      baseLatencyMs: 7.0,
      maxRpsCapacity: 7500,
      envVars: ["MYSQL_DATABASE", "MYSQL_ROOT_PASSWORD"],
    },
    {
      name: "MongoDB",
      version: "v7.0",
      port: 27017,
      description: "Base orientée document NoSQL avec sharding horizontal.",
      baseLatencyMs: 4.5,
      maxRpsCapacity: 12000,
      envVars: ["MONGO_INITDB_ROOT_USERNAME"],
    },
    {
      name: "Qdrant Vector DB",
      version: "v1.9",
      port: 6333,
      description: "Moteur vectoriel pour recherche sémantique et RAG.",
      baseLatencyMs: 14.0,
      maxRpsCapacity: 6000,
      envVars: ["QDRANT_API_KEY"],
    },
    {
      name: "MinIO S3",
      version: "v2024",
      port: 9000,
      description: "Stockage objet compatible S3.",
      baseLatencyMs: 9.0,
      maxRpsCapacity: 10000,
      envVars: ["MINIO_ROOT_USER"],
    },
    {
      name: "Apache Cassandra",
      version: "v5.0",
      port: 9042,
      description: "Stockage distribué multi-nœuds.",
      baseLatencyMs: 8.5,
      maxRpsCapacity: 16000,
      envVars: ["CASSANDRA_DC"],
    },
  ],
  user: [
    {
      name: "Application Web (Next.js)",
      version: "v16.4",
      port: 443,
      description: "Interface web SSR et composants réactifs.",
      baseLatencyMs: 1.0,
      maxRpsCapacity: 25000,
      envVars: ["NEXT_PUBLIC_API_URL"],
    },
    {
      name: "Application Mobile (Flutter)",
      version: "v3.22",
      port: 443,
      description: "Clients iOS et Android natifs.",
      baseLatencyMs: 1.0,
      maxRpsCapacity: 20000,
      envVars: ["APP_CLIENT_ID"],
    },
    {
      name: "Client API B2B",
      version: "v1.0",
      port: 443,
      description: "Intégrateurs externes via mTLS / API Keys.",
      baseLatencyMs: 1.5,
      maxRpsCapacity: 15000,
      envVars: ["API_KEY_HEADER"],
    },
  ],
  gateway: [
    {
      name: "Kong Gateway",
      version: "v3.7",
      port: 443,
      description: "Passerelle API, validation JWT, rate-limit et TLS 1.3.",
      baseLatencyMs: 3.4,
      maxRpsCapacity: 15000,
      envVars: ["KONG_PROXY_LISTEN"],
    },
    {
      name: "Traefik Proxy",
      version: "v3.0",
      port: 443,
      description: "Routeur cloud-native avec découverte automatique.",
      baseLatencyMs: 3.8,
      maxRpsCapacity: 14000,
      envVars: ["TRAEFIK_ENTRYPOINTS"],
    },
    {
      name: "Envoy Proxy",
      version: "v1.30",
      port: 443,
      description: "Proxy service mesh gRPC et HTTP/3.",
      baseLatencyMs: 2.9,
      maxRpsCapacity: 18000,
      envVars: ["ENVOY_CONFIG"],
    },
    {
      name: "Nginx",
      version: "v1.26",
      port: 443,
      description: "Reverse proxy et répartiteur de charge.",
      baseLatencyMs: 3.1,
      maxRpsCapacity: 20000,
      envVars: ["WORKER_PROCESSES"],
    },
  ],
  service: [
    {
      name: "Go Fiber / gRPC",
      version: "v1.23",
      port: 9090,
      description: "Service transactionnel compilé en Go.",
      baseLatencyMs: 4.8,
      maxRpsCapacity: 12000,
      envVars: ["GRPC_PORT", "DATABASE_URL"],
    },
    {
      name: "Rust Axum",
      version: "v0.7",
      port: 8080,
      description: "Serveur asynchrone Tokio haute performance.",
      baseLatencyMs: 2.2,
      maxRpsCapacity: 18000,
      envVars: ["RUST_LOG"],
    },
    {
      name: "Python FastAPI",
      version: "v0.115",
      port: 8000,
      description: "API REST asynchrone typée.",
      baseLatencyMs: 7.5,
      maxRpsCapacity: 7000,
      envVars: ["UVICORN_WORKERS"],
    },
    {
      name: "Node.js NestJS",
      version: "v10.3",
      port: 3000,
      description: "Architecture modulaire TypeScript.",
      baseLatencyMs: 6.8,
      maxRpsCapacity: 8500,
      envVars: ["NODE_ENV"],
    },
    {
      name: "Spring Boot 3",
      version: "v3.3",
      port: 8080,
      description: "Service Java 21 avec Virtual Threads.",
      baseLatencyMs: 8.9,
      maxRpsCapacity: 9500,
      envVars: ["SPRING_PROFILES_ACTIVE"],
    },
  ],
  queue: [
    {
      name: "Redpanda",
      version: "v24.1",
      port: 9092,
      description: "Streaming compatible Kafka sans JVM.",
      baseLatencyMs: 2.1,
      maxRpsCapacity: 20000,
      envVars: ["REDPANDA_BROKERS"],
    },
    {
      name: "Apache Kafka",
      version: "v3.7",
      port: 9092,
      description: "Plateforme de streaming distribué KRaft.",
      baseLatencyMs: 4.0,
      maxRpsCapacity: 16000,
      envVars: ["KAFKA_CFG_NUM_PARTITIONS"],
    },
    {
      name: "RabbitMQ",
      version: "v3.13",
      port: 5672,
      description: "Courtier de messages AMQP.",
      baseLatencyMs: 3.5,
      maxRpsCapacity: 11000,
      envVars: ["RABBITMQ_DEFAULT_USER"],
    },
    {
      name: "Redis Streams",
      version: "v7.2",
      port: 6379,
      description: "Journal de messages en mémoire.",
      baseLatencyMs: 1.2,
      maxRpsCapacity: 22000,
      envVars: ["STREAM_NAME"],
    },
  ],
  cache: [
    {
      name: "Valkey Cluster",
      version: "v7.2",
      port: 6379,
      description: "Cache distribué sub-milliseconde et verrous.",
      baseLatencyMs: 0.7,
      maxRpsCapacity: 25000,
      envVars: ["VALKEY_CLUSTER_NODES"],
    },
    {
      name: "Redis",
      version: "v7.2",
      port: 6379,
      description: "Base clé-valeur en mémoire avec persistance.",
      baseLatencyMs: 0.8,
      maxRpsCapacity: 24000,
      envVars: ["REDIS_PASSWORD"],
    },
    {
      name: "Memcached",
      version: "v1.6",
      port: 11211,
      description: "Cache d'objets en mémoire distribuée.",
      baseLatencyMs: 0.6,
      maxRpsCapacity: 28000,
      envVars: ["MEMCACHED_MEMORY_LIMIT"],
    },
  ],
  security: [
    {
      name: "Keycloak OIDC",
      version: "v25.0",
      port: 8080,
      description: "Serveur d'identité OAuth2 / OIDC et RBAC.",
      baseLatencyMs: 1.2,
      maxRpsCapacity: 9500,
      envVars: ["KC_DB_URL"],
    },
    {
      name: "Authentik",
      version: "v2024.4",
      port: 9000,
      description: "Fournisseur d'identité SSO.",
      baseLatencyMs: 2.1,
      maxRpsCapacity: 8000,
      envVars: ["AUTHENTIK_SECRET_KEY"],
    },
    {
      name: "HashiCorp Vault",
      version: "v1.16",
      port: 8200,
      description: "Gestion des secrets et certificats mTLS.",
      baseLatencyMs: 3.0,
      maxRpsCapacity: 7500,
      envVars: ["VAULT_ADDR"],
    },
  ],
  ai: [
    {
      name: "vLLM Engine",
      version: "v0.5",
      port: 8000,
      description: "Serveur d'inférence LLM haute performance.",
      baseLatencyMs: 28.0,
      maxRpsCapacity: 1200,
      envVars: ["MODEL_NAME"],
    },
    {
      name: "Pipeline RAG",
      version: "v1.0",
      port: 8090,
      description: "Orchestration d'agents et recherche vectorielle.",
      baseLatencyMs: 18.0,
      maxRpsCapacity: 3500,
      envVars: ["EMBEDDING_MODEL"],
    },
    {
      name: "Ollama",
      version: "v0.3",
      port: 11434,
      description: "Exécution locale de modèles.",
      baseLatencyMs: 35.0,
      maxRpsCapacity: 800,
      envVars: ["OLLAMA_MODELS"],
    },
  ],
  "mobile-payment": [],
  messaging: [],
  billing: [],
};


export interface StencilItem {
  shape: ArchitectureShape;
  role: NodeRole;
  label: string;
  group: string;
}

/** Composants de la boîte à outils, dans l'ordre d'affichage. */
export const STENCIL_ITEMS: readonly StencilItem[] = [
  { shape: "generic", role: "generic", label: "Bloc libre", group: "Générique" },
  { shape: "service", role: "service", label: "Service / API", group: "Calcul" },
  { shape: "cylinder", role: "database", label: "Base de données", group: "Données" },
  { shape: "user", role: "user", label: "Utilisateur / Client", group: "Acteurs" },
  { shape: "gateway", role: "gateway", label: "Passerelle", group: "Réseau" },
  { shape: "queue", role: "queue", label: "File / Bus", group: "Asynchrone" },
  { shape: "cache", role: "cache", label: "Cache", group: "Données" },
  { shape: "security", role: "auth", label: "Sécurité / Auth", group: "Sécurité" },
  { shape: "ai", role: "ai", label: "Module IA", group: "IA" },
  { shape: "mobile-payment", role: "payment", label: "Paiement mobile", group: "Paiement" },
  { shape: "messaging", role: "messaging", label: "SMS / USSD / WhatsApp", group: "Messagerie" },
  { shape: "billing", role: "billing", label: "Facturation", group: "Paiement" },
];

export const PROTOCOLS = ["REST / HTTP3", "gRPC", "Kafka / Events", "Redis PubSub", "TCP / TLS"] as const;
