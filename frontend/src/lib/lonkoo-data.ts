export type NodeRole =
  | "generic"
  | "webapp"
  | "gateway"
  | "auth"
  | "service"
  | "database"
  | "cache"
  | "queue"
  | "ai"
  | "user"
  | "payment"
  | "messaging"
  | "billing";

export type ArchitectureShape =
  | "generic"  // Bloc libre / Conteneur logique sans convention imposée
  | "webapp"   // Application web (type « webapp » du contrat du canvas)
  | "cylinder" // Base de données (pile de cylindres)
  | "user"     // Utilisateur / Client (bonhomme)
  | "gateway"  // Passerelle API / Routeur
  | "service"  // Service / Boîtier de calcul
  | "queue"    // Bus d'événements / File de messages
  | "cache"    // Cache mémoire
  | "security" // Sécurité / IAM
  | "ai"       // Module IA / Inférence
  | "mobile-payment" // Paiement mobile (bloc générique, sans marque)
  | "messaging"      // SMS, USSD, WhatsApp, courriel (bloc générique, sans marque)
  | "billing";       // Facturation

export type GitHubRole = "Owner" | "Maintainer" | "Write" | "Triage" | "Read";

export interface ProjectCollaborator {
  id: string;
  handle: string;
  initials: string;
  name: string;
  role: GitHubRole;
  jobTitle: string;
  color: string;
  status?: "Actif" | "En attente";
}

export interface ProjectTeamGroup {
  id: string;
  slug: string;
  name: string;
  description: string;
  membersCount: number;
  permission: GitHubRole;
}

export interface CommunityArchitect {
  id: string;
  handle: string;
  name: string;
  initials: string;
  color: string;
  role: string;
  company: string;
  location: string;
  bio: string;
  specialties: string[];
  followers: number;
  following: number;
  publishedBlueprintsCount: number;
  forksReceived: number;
  isFollowing: boolean;
}

export interface ArchitectureNode {
  id: string;
  title: string;
  tech: string;
  version: string;
  shape: ArchitectureShape;
  moduleGroup: string;
  description: string;
  status: "Actif" | "Synchro" | "Optimisé" | "Attention";
  metricLabel: string;
  metricValue: string;
  baseLatencyMs: number;
  maxRpsCapacity: number;
  replicas: number;
  port: number;
  role: NodeRole;
  x: number;
  y: number;
  envVars: string[];
  dependencies: string[];
  /**
   * Champs du contrat du canvas propres au type du bloc : tables et champs d'une base, endpoints d'un service,
   * pages, topics, méthode d'authentification… (voir canvas-model.ts). Absent : valeurs par défaut du type.
   */
  contract?: { [key: string]: unknown };
}

export interface ArchitectureEdge {
  id: string;
  from: string;
  to: string;
  protocol: "REST / HTTP3" | "gRPC" | "Kafka / Events" | "Redis PubSub" | "TCP / TLS";
  throughput: string;
}

export interface ArchitectureVersion {
  id: string;
  versionTag: string;
  gitCommit: string;
  gitReleaseUrl: string;
  branch: string;
  title: string;
  author: string;
  createdAt: string;
  changesSummary: string[];
  stackDelta: string;
  isCurrent?: boolean;
}

export interface WorkspaceProject {
  id: string;
  slug: string;
  name: string;
  description: string;
  visibility: "public" | "private";
  forkedFrom?: string;
  branch: string;
  gitTag: string;
  githubRepo: string;
  stack: string[];
  aiScore: number;
  updatedAt: string;
  collaborators: { initials: string; name: string; role: string; color: string }[];
  nodesCount: number;
  openReviewsCount: number;
  mcpActive: boolean;
  orionSynced: boolean;
  /** Mode API : canvas principal du projet (connu une fois la liste de ses canvas lue). */
  canvasId?: string;
  /** Mode API : rôle de l'utilisateur dans le projet. */
  role?: GitHubRole;
  /** Mode API : projet public ouvert sans en être membre (lecture seule, hors de « mes projets »). */
  visitor?: boolean;
}

export interface AISuggestion {
  id: string;
  severity: "critique" | "recommandé" | "optimisation";
  category: "Résilience" | "Stack Technique" | "Sécurité" | "Performance";
  title: string;
  targetNodeId: string;
  currentConfig: string;
  proposedConfig: string;
  rationale: string;
  impactScore: string;
  patch: {
    tech?: string;
    version?: string;
    replicas?: number;
    status?: "Actif" | "Synchro" | "Optimisé";
    metricValue?: string;
  };
}

export interface AIDocSection {
  id: string;
  title: string;
  badge: string;
  lastGenerated: string;
  content: string;
  highlights: string[];
}

export interface ForkableModule {
  id: string;
  name: string;
  description: string;
  nodeIds: string[];
  stack: string[];
  estimatedSetup: string;
}

export interface BlueprintComment {
  id: string;
  author: string;
  role: string;
  avatar: string;
  rating: number;
  date: string;
  comment: string;
  versionTested: string;
}

export interface BlueprintItem {
  id: string;
  slug: string;
  title: string;
  sector: "Microservices" | "FinTech" | "IA & RAG" | "Temps Réel" | "E-Commerce" | "Event-Driven";
  visibility: "public" | "private";
  stars: number;
  ratingsCount: number;
  forks: number;
  summary: string;
  stack: string[];
  gitTag: string;
  githubRepo: string;
  latencyMs: string;
  architecturePattern: string;
  resilienceScore: number;
  author: string;
  authorRole: string;
  updatedAt: string;
  nodes: ArchitectureNode[];
  modules: ForkableModule[];
  comments: BlueprintComment[];
}

export interface ArchitectureReviewPR {
  id: string;
  number: number;
  title: string;
  project: string;
  sourceBranch: string;
  targetBranch: string;
  gitTagTarget: string;
  status: "open" | "approved" | "changes_requested" | "merged";
  author: string;
  authorRole: string;
  createdAt: string;
  summary: string;
  aiCheckPassed: boolean;
  aiSummary: string;
  diffs: {
    type: "added" | "modified" | "removed";
    component: string;
    before?: string;
    after: string;
    detail: string;
  }[];
  reviewers: {
    name: string;
    initials: string;
    verdict: "approved" | "changes" | "pending";
    comment?: string;
  }[];
}

export interface TeamChatMessage {
  id: string;
  channelId: string;
  author: string;
  initials: string;
  role: string;
  time: string;
  text: string;
  linkedNode?: string;
  linkedVersion?: string;
}

export const CORE_STUDIO_NODES: ArchitectureNode[] = [
  {
    id: "clients-user",
    title: "Utilisateurs & Clients",
    tech: "Next.js Web / Flutter Mobile",
    version: "v16.4 / v3.22",
    shape: "user",
    moduleGroup: "Acteurs & Clients",
    description: "Navigateurs web, applications mobiles Android/iOS et agents API.",
    status: "Actif",
    metricLabel: "Actifs",
    metricValue: "42.8k users",
    baseLatencyMs: 1.0,
    maxRpsCapacity: 20000,
    replicas: 1,
    port: 443,
    role: "user",
    x: 60,
    y: 190,
    envVars: ["NEXT_PUBLIC_API_URL", "APP_CLIENT_ID"],
    dependencies: ["edge-gateway"],
  },
  {
    id: "edge-gateway",
    title: "Passerelle API & Routeur",
    tech: "Kong Gateway",
    version: "v3.7",
    shape: "gateway",
    moduleGroup: "Passerelle & Sécurité",
    description: "Terminaison TLS 1.3, rate-limiting distribué et routage gRPC/REST.",
    status: "Actif",
    metricLabel: "Latence p95",
    metricValue: "3.4 ms",
    baseLatencyMs: 3.4,
    maxRpsCapacity: 14000,
    replicas: 3,
    port: 443,
    role: "gateway",
    x: 340,
    y: 190,
    envVars: ["KONG_PROXY_LISTEN", "RATE_LIMIT_REDIS_URL", "JWT_PUBLIC_KEY"],
    dependencies: ["auth-service", "core-orchestrator"],
  },
  {
    id: "auth-service",
    title: "Identité & OAuth2 / OIDC",
    tech: "Keycloak / Rust",
    version: "v25.0",
    shape: "security",
    moduleGroup: "Passerelle & Sécurité",
    description: "Fédération d'identité, RBAC granulaire par espace de travail et jetons court-terme.",
    status: "Actif",
    metricLabel: "Vérif. JWT",
    metricValue: "1.2 ms",
    baseLatencyMs: 1.2,
    maxRpsCapacity: 9500,
    replicas: 2,
    port: 8080,
    role: "auth",
    x: 640,
    y: 70,
    envVars: ["KC_DB_URL", "OIDC_ISSUER", "TOKEN_TTL_SECONDS"],
    dependencies: ["pg-primary", "redis-cluster"],
  },
  {
    id: "core-orchestrator",
    title: "Moteur Métier & Workflows",
    tech: "Go Fiber / gRPC",
    version: "v1.23",
    shape: "service",
    moduleGroup: "Cœur Applicatif",
    description: "Orchestration transactionnelle des commandes, validation de schémas et webhooks.",
    status: "Optimisé",
    metricLabel: "Débit",
    metricValue: "8.4k req/s",
    baseLatencyMs: 4.8,
    maxRpsCapacity: 11000,
    replicas: 4,
    port: 9090,
    role: "service",
    x: 640,
    y: 320,
    envVars: ["GRPC_PORT", "KAFKA_BROKERS", "DATABASE_POOL_MAX"],
    dependencies: ["pg-primary", "redis-cluster", "event-bus"],
  },
  {
    id: "event-bus",
    title: "Bus d'Événements & Saga",
    tech: "Redpanda / Kafka",
    version: "v24.1",
    shape: "queue",
    moduleGroup: "Cœur Applicatif",
    description: "Streaming d'événements asynchrones, journal d'audit immuable et synchronisation.",
    status: "Synchro",
    metricLabel: "Lag",
    metricValue: "0.8 ms",
    baseLatencyMs: 2.1,
    maxRpsCapacity: 18000,
    replicas: 3,
    port: 9092,
    role: "queue",
    x: 960,
    y: 70,
    envVars: ["REDPANDA_BROKERS", "RETENTION_MS", "PARTITION_COUNT"],
    dependencies: ["ai-worker"],
  },
  {
    id: "pg-primary",
    title: "Cluster Base de Données",
    tech: "PostgreSQL + PgBouncer",
    version: "v16.4",
    shape: "cylinder",
    moduleGroup: "Données & Persistance",
    description: "Stockage relationnel ACID avec partitionnement temporel et pool de connexions.",
    status: "Attention",
    metricLabel: "IOPS",
    metricValue: "14.2k",
    baseLatencyMs: 6.5,
    maxRpsCapacity: 6500,
    replicas: 2,
    port: 5432,
    role: "database",
    x: 960,
    y: 320,
    envVars: ["POSTGRES_DSN", "PGBOUNCER_POOL_MODE", "WAL_LEVEL"],
    dependencies: [],
  },
  {
    id: "redis-cluster",
    title: "Cache Distribué & Sessions",
    tech: "Valkey / Redis",
    version: "v7.2",
    shape: "cache",
    moduleGroup: "Données & Persistance",
    description: "Cache applicatif sub-milliseconde, verrous distribués et états CRDT temps réel.",
    status: "Optimisé",
    metricLabel: "Hit Ratio",
    metricValue: "99.2%",
    baseLatencyMs: 0.7,
    maxRpsCapacity: 25000,
    replicas: 3,
    port: 6379,
    role: "cache",
    x: 1260,
    y: 190,
    envVars: ["REDIS_CLUSTER_NODES", "MAXMEMORY_POLICY"],
    dependencies: [],
  },
];

export const STUDIO_EDGES: ArchitectureEdge[] = [
  {
    id: "e0",
    from: "clients-user",
    to: "edge-gateway",
    protocol: "REST / HTTP3",
    throughput: "14.2k req/s",
  },
  {
    id: "e1",
    from: "edge-gateway",
    to: "auth-service",
    protocol: "gRPC",
    throughput: "4.2k req/s",
  },
  {
    id: "e2",
    from: "edge-gateway",
    to: "core-orchestrator",
    protocol: "REST / HTTP3",
    throughput: "8.4k req/s",
  },
  {
    id: "e3",
    from: "core-orchestrator",
    to: "event-bus",
    protocol: "Kafka / Events",
    throughput: "12.1k msg/s",
  },
  {
    id: "e4",
    from: "core-orchestrator",
    to: "pg-primary",
    protocol: "TCP / TLS",
    throughput: "5.1k tx/s",
  },
  {
    id: "e5",
    from: "auth-service",
    to: "redis-cluster",
    protocol: "Redis PubSub",
    throughput: "9.8k ops/s",
  },
  {
    id: "e6",
    from: "event-bus",
    to: "redis-cluster",
    protocol: "Redis PubSub",
    throughput: "6.4k ops/s",
  },
];

export const AI_SUGGESTIONS: AISuggestion[] = [
  {
    id: "sug-pg-ha",
    severity: "critique",
    category: "Résilience",
    title: "Ajouter une réplique de lecture synchrone et activer PgBouncer en mode transaction",
    targetNodeId: "pg-primary",
    currentConfig: "PostgreSQL v16.4 (2 nœuds · Pool session)",
    proposedConfig: "PostgreSQL v16.4 HA + Patroni (3 nœuds · Pool transaction)",
    rationale:
      "Sous une charge supérieure à 6 500 req/s, le pool de connexions actuel sature. Une troisième réplique en lecture avec Patroni élimine le point de contention.",
    impactScore: "+14 pts Score IA",
    patch: {
      tech: "PostgreSQL HA + Patroni",
      version: "v16.4-ha",
      replicas: 3,
      status: "Optimisé",
      metricValue: "22.8k",
    },
  },
  {
    id: "sug-gateway-cache",
    severity: "recommandé",
    category: "Performance",
    title: "Activer la mise en cache des clés JWKS OAuth2 directement sur la passerelle",
    targetNodeId: "edge-gateway",
    currentConfig: "Kong Gateway v3.7 (3 répliques)",
    proposedConfig: "Kong Gateway v3.8 + Cache JWKS local (4 répliques)",
    rationale:
      "Réduit de 68% les appels synchrones entre l'API Gateway et le service Keycloak lors des pics d'authentification.",
    impactScore: "-1.4 ms latence p95",
    patch: {
      tech: "Kong Gateway + JWKS Cache",
      version: "v3.8",
      replicas: 4,
      status: "Optimisé",
      metricValue: "2.0 ms",
    },
  },
  {
    id: "sug-event-dlq",
    severity: "optimisation",
    category: "Stack Technique",
    title: "Configurer une Dead-Letter Queue (DLQ) avec Schema Registry Protobuf",
    targetNodeId: "event-bus",
    currentConfig: "Redpanda v24.1 (JSON Events)",
    proposedConfig: "Redpanda v24.2 + Protobuf Registry & DLQ",
    rationale:
      "Garantit la compatibilité ascendante des contrats d'événements entre versions d'architecture et isole les messages en échec.",
    impactScore: "100% typage strict",
    patch: {
      tech: "Redpanda + Schema Registry",
      version: "v24.2",
      replicas: 3,
      status: "Optimisé",
      metricValue: "0.4 ms",
    },
  },
];

export const ARCHITECTURE_VERSIONS: ArchitectureVersion[] = [
  {
    id: "ver-240",
    versionTag: "v2.4.0",
    gitCommit: "8f4d2a1",
    gitReleaseUrl: "https://github.com/lonkoo-org/payment-mesh-core/releases/tag/v2.4.0",
    branch: "main",
    title: "Découplage du bus d'événements Redpanda et pool PgBouncer",
    author: "Aminata S.",
    createdAt: "Aujourd'hui à 14:20",
    changesSummary: [
      "Ajout du nœud Redpanda v24.1 entre le moteur métier et les workers asynchrones",
      "Passage de PostgreSQL 15 à PostgreSQL 16.4 avec PgBouncer intégré",
      "Mise à jour de la documentation ADR-004 par l'assistant IA",
    ],
    stackDelta: "+Redpanda 24.1 · ↑PostgreSQL 16.4",
    isCurrent: true,
  },
  {
    id: "ver-231",
    versionTag: "v2.3.1",
    gitCommit: "3c9e11b",
    gitReleaseUrl: "https://github.com/lonkoo-org/payment-mesh-core/releases/tag/v2.3.1",
    branch: "main",
    title: "Renforcement OIDC Keycloak et limitation de débit par espace",
    author: "Koffi D.",
    createdAt: "Il y a 2 jours",
    changesSummary: [
      "Isolation des jetons JWT avec rotation automatique toutes les 15 minutes",
      "Configuration du rate-limiting Redis sur l'API Gateway",
    ],
    stackDelta: "↑Keycloak 25.0 · ↑Kong 3.7",
  },
  {
    id: "ver-220",
    versionTag: "v2.2.0",
    gitCommit: "7a10f8c",
    gitReleaseUrl: "https://github.com/lonkoo-org/payment-mesh-core/releases/tag/v2.2.0",
    branch: "main",
    title: "Introduction du cache distribué Valkey 7.2",
    author: "Dr. Cheikh Tidiane",
    createdAt: "Il y a 6 jours",
    changesSummary: [
      "Remplacement du cache mémoire local par un cluster Valkey à 3 répliques",
      "Réduction de la latence moyenne de lecture de 14 ms à 3.8 ms",
    ],
    stackDelta: "+Valkey 7.2",
  },
  {
    id: "ver-200",
    versionTag: "v2.0.0",
    gitCommit: "1d5b90e",
    gitReleaseUrl: "https://github.com/lonkoo-org/payment-mesh-core/releases/tag/v2.0.0",
    branch: "main",
    title: "Architecture initiale microservices gRPC",
    author: "Aminata S.",
    createdAt: "Il y a 18 jours",
    changesSummary: [
      "Création de la topologie de base : Passerelle, Auth, Service Métier et PostgreSQL",
    ],
    stackDelta: "Initial Release",
  },
];

export const AI_DOC_SECTIONS: AIDocSection[] = [
  {
    id: "doc-overview",
    title: "1. Vue d'ensemble & Topologie du Système",
    badge: "Synchronisé v2.4.0",
    lastGenerated: "Mis à jour automatiquement il y a 4 min",
    content:
      "L'architecture repose sur une topologie orientée événements (Event-Driven Microservices) conçue pour absorber des pics transactionnels élevés tout en maintenant une latence p95 inférieure à 10 ms. Le trafic entrant traverse la passerelle Kong v3.7 qui délègue la validation d'identité à Keycloak v25 avant d'acheminer les appels gRPC et HTTP/3 vers le Moteur Métier écrit en Go.",
    highlights: [
      "Isolation stricte entre le plan de contrôle d'identité (OIDC) et le plan transactionnel",
      "Communication synchrone en gRPC sur le chemin critique et asynchrone via Redpanda",
      "État de session externalisé dans Valkey v7.2 pour garantir l'élasticité horizontale",
    ],
  },
  {
    id: "doc-adr",
    title: "2. Architecture Decision Records (ADR-004)",
    badge: "Généré par IA",
    lastGenerated: "Validé lors de la PR #42",
    content:
      "Contexte : Les pics d'écriture directe dans PostgreSQL lors des traitements par lots provoquaient une contention des verrous. Décision : Introduire un bus Redpanda (compatible Kafka sans JVM) en amont des traitements secondaires et activer PgBouncer en mode transaction. Conséquence : Capacité d'ingestion multipliée par 2,8 sans perte de cohérence éventuelle.",
    highlights: [
      "Statut ADR-004 : Accepté et lié au tag Git v2.4.0",
      "Alternative écartée : RabbitMQ (latence plus élevée sur la relecture d'historique)",
      "Plan de rollback : Bascule par feature-flag sur écriture directe synchrone",
    ],
  },
  {
    id: "doc-contracts",
    title: "3. Matrice de Stack & Contrats d'Interface",
    badge: "OpenAPI 3.1 & Proto",
    lastGenerated: "Prêt pour MCP & Orion",
    content:
      "Chaque nœud du graphe expose un contrat formel versionné avec l'architecture. Les agents IA connectés via le serveur MCP LONKOO ou le constructeur Orion utilisent directement ces spécifications pour générer les routes, les schémas de migration SQL et les clients typés.",
    highlights: [
      "Passerelle Edge : OpenAPI 3.1.0 (/v2/transactions, /v2/webhooks)",
      "Moteur Métier : Protobuf v3 (service OrchestratorService)",
      "Persistance : Schéma SQL déclaratif + migrations Prisma / SQLx générées",
    ],
  },
];

export const WORKSPACE_PROJECTS: WorkspaceProject[] = [
  {
    id: "proj-1",
    slug: "passerelle-paiement-uemoa",
    name: "payment-mesh-core",
    description:
      "Architecture microservices temps réel pour l'orchestration de paiements multi-opérateurs avec bus d'événements et haute disponibilité.",
    visibility: "public",
    branch: "main",
    gitTag: "v2.4.0",
    githubRepo: "lonkoo-org/payment-mesh-core",
    stack: ["Go 1.23", "Kong 3.7", "PostgreSQL 16", "Redpanda", "Valkey"],
    aiScore: 96,
    updatedAt: "Il y a 12 min",
    collaborators: [
      { initials: "AS", name: "Aminata S.", role: "Lead Architect", color: "#1265DD" },
      { initials: "KD", name: "Koffi D.", role: "Staff Engineer", color: "#0284C7" },
      { initials: "CT", name: "Cheikh T.", role: "Security Reviewer", color: "#0D9488" },
    ],
    nodesCount: 6,
    openReviewsCount: 2,
    mcpActive: true,
    orionSynced: true,
  },
  {
    id: "proj-2",
    slug: "pipeline-rag-documentaire",
    name: "enterprise-rag-engine",
    description:
      "Pipeline d'ingestion documentaire, découpage sémantique, indexation vectorielle hybride et serveur d'agents MCP sécurisé.",
    visibility: "private",
    branch: "feat/hybrid-reranker",
    gitTag: "v1.5.2",
    githubRepo: "lonkoo-org/enterprise-rag-engine",
    stack: ["Python FastAPI", "Qdrant", "PostgreSQL pgvector", "Redis", "vLLM"],
    aiScore: 93,
    updatedAt: "Il y a 2 heures",
    collaborators: [
      { initials: "AS", name: "Aminata S.", role: "Lead Architect", color: "#1265DD" },
      { initials: "FD", name: "Fatou D.", role: "AI Engineer", color: "#2563EB" },
    ],
    nodesCount: 8,
    openReviewsCount: 1,
    mcpActive: true,
    orionSynced: false,
  },
  {
    id: "proj-3",
    slug: "dossier-medical-partage-souverain",
    name: "health-records-federation",
    description:
      "Architecture fédérée zero-trust pour le partage de dossiers médicaux chiffrés de bout en bout entre établissements hospitaliers.",
    visibility: "public",
    forkedFrom: "dr-cheikh/med-vault-template",
    branch: "main",
    gitTag: "v3.1.0",
    githubRepo: "lonkoo-org/health-records-federation",
    stack: ["Rust Axum", "Keycloak OIDC", "MinIO S3", "PostgreSQL 16"],
    aiScore: 98,
    updatedAt: "Hier",
    collaborators: [
      { initials: "CT", name: "Cheikh T.", role: "Owner", color: "#1265DD" },
      { initials: "AS", name: "Aminata S.", role: "Contributor", color: "#0284C7" },
    ],
    nodesCount: 7,
    openReviewsCount: 0,
    mcpActive: true,
    orionSynced: true,
  },
  {
    id: "proj-4",
    slug: "portail-identite-numerique-cedeao",
    name: "omni-commerce-headless",
    description:
      "Plateforme e-commerce headless modulaire avec gestion des stocks temps réel, moteur de recommandation et passerelle GraphQL.",
    visibility: "private",
    forkedFrom: "koffi-dev/headless-commerce-kit",
    branch: "release/v1.2",
    gitTag: "v1.2.0-rc2",
    githubRepo: "lonkoo-org/omni-commerce-headless",
    stack: ["Next.js 16", "Node.js", "GraphQL", "PostgreSQL", "Meilisearch"],
    aiScore: 91,
    updatedAt: "Il y a 3 jours",
    collaborators: [
      { initials: "KD", name: "Koffi D.", role: "Lead Architect", color: "#1265DD" },
      { initials: "FD", name: "Fatou D.", role: "Frontend Architect", color: "#38BDF8" },
    ],
    nodesCount: 5,
    openReviewsCount: 1,
    mcpActive: false,
    orionSynced: true,
  },
];

export const PALABRE_BLUEPRINTS: BlueprintItem[] = [
  {
    id: "bp-uemoa-pay",
    slug: "passerelle-paiement-uemoa",
    title: "Orchestrateur de Paiement Multi-Opérateurs & Saga",
    sector: "FinTech",
    visibility: "public",
    stars: 4.9,
    ratingsCount: 84,
    forks: 312,
    summary:
      "Architecture haute disponibilité avec pattern Saga, idempotence native, bus d'événements Redpanda et réplication PostgreSQL.",
    stack: ["Go 1.23", "Kong Gateway", "Redpanda", "PostgreSQL 16", "Valkey"],
    gitTag: "v2.4.0",
    githubRepo: "aminata-arch/payment-mesh-core",
    latencyMs: "3.4 ms",
    architecturePattern: "Event-Driven Saga + CQRS",
    resilienceScore: 96,
    author: "Aminata S.",
    authorRole: "Principal Systems Architect",
    updatedAt: "Il y a 3 heures",
    nodes: CORE_STUDIO_NODES,
    modules: [
      {
        id: "mod-gateway-auth",
        name: "Sous-graphe Passerelle & Identité OIDC",
        description: "Kong API Gateway v3.7 + Keycloak v25 avec cache de jetons JWT et rate-limiting.",
        nodeIds: ["edge-gateway", "auth-service"],
        stack: ["Kong 3.7", "Keycloak 25"],
        estimatedSetup: "2 nœuds · Prêt à greffer",
      },
      {
        id: "mod-event-saga",
        name: "Sous-graphe Orchestrateur & Bus d'Événements",
        description: "Moteur Go gRPC couplé au broker Redpanda pour les transactions distribuées.",
        nodeIds: ["core-orchestrator", "event-bus"],
        stack: ["Go 1.23", "Redpanda 24.1"],
        estimatedSetup: "2 nœuds · Pattern Saga",
      },
      {
        id: "mod-data-ha",
        name: "Sous-graphe Persistance Haute Disponibilité",
        description: "Cluster PostgreSQL 16 + PgBouncer et cache distribué Valkey 7.2.",
        nodeIds: ["pg-primary", "redis-cluster"],
        stack: ["PostgreSQL 16", "Valkey 7.2"],
        estimatedSetup: "2 nœuds · ACID + Cache",
      },
    ],
    comments: [
      {
        id: "c1",
        author: "Koffi D.",
        role: "Staff Backend Engineer",
        avatar: "KD",
        rating: 5,
        date: "Il y a 1 jour",
        comment:
          "Nous avons forké uniquement le sous-graphe 'Orchestrateur & Bus d'Événements' dans notre projet existant. L'export MCP a permis à notre agent de générer les producteurs Kafka en 10 minutes.",
        versionTested: "v2.4.0",
      },
      {
        id: "c2",
        author: "Dr. Cheikh Tidiane",
        role: "Architecte Sécurité",
        avatar: "CT",
        rating: 5,
        date: "Il y a 3 jours",
        comment:
          "La séparation entre la validation JWT en bordure et le moteur transactionnel est exemplaire. La documentation ADR générée est très claire.",
        versionTested: "v2.3.1",
      },
    ],
  },
  {
    id: "bp-rag-agentic",
    slug: "pipeline-rag-documentaire",
    title: "Architecture RAG Hybride & Serveur Multi-Agents",
    sector: "IA & RAG",
    visibility: "public",
    stars: 4.8,
    ratingsCount: 62,
    forks: 219,
    summary:
      "Pipeline complet d'ingestion vectorielle, recherche hybride dense/sparse, garde-fous sémantiques et exposition MCP native.",
    stack: ["Python FastAPI", "Qdrant", "PostgreSQL pgvector", "Valkey"],
    gitTag: "v1.5.2",
    githubRepo: "fatou-ai/enterprise-rag-engine",
    latencyMs: "18.0 ms",
    architecturePattern: "Agentic RAG + Vector Mesh",
    resilienceScore: 94,
    author: "Fatou Diallo",
    authorRole: "AI Platform Architect",
    updatedAt: "Hier",
    nodes: CORE_STUDIO_NODES,
    modules: [
      {
        id: "mod-rag-ingest",
        name: "Sous-graphe Ingestion & Chunking Asynchrone",
        description: "Workers d'extraction documentaire et file d'événements haut débit.",
        nodeIds: ["core-orchestrator", "event-bus"],
        stack: ["FastAPI", "Redpanda"],
        estimatedSetup: "2 nœuds",
      },
      {
        id: "mod-rag-store",
        name: "Sous-graphe Stockage Hybride & Cache Sémantique",
        description: "Indexation relationnelle/vectorielle et cache de réponses fréquentes.",
        nodeIds: ["pg-primary", "redis-cluster"],
        stack: ["PostgreSQL pgvector", "Valkey"],
        estimatedSetup: "2 nœuds",
      },
    ],
    comments: [
      {
        id: "c3",
        author: "Moussa B.",
        role: "ML Engineer",
        avatar: "MB",
        rating: 5,
        date: "Il y a 2 jours",
        comment:
          "Le cache sémantique sur Valkey réduit nos appels LLM de 42%. Super template de référence.",
        versionTested: "v1.5.2",
      },
    ],
  },
  {
    id: "bp-medical-cdp",
    slug: "dossier-medical-partage-souverain",
    title: "Fédération Zero-Trust & Stockage Chiffré",
    sector: "Microservices",
    visibility: "public",
    stars: 4.9,
    ratingsCount: 51,
    forks: 184,
    summary:
      "Architecture orientée sécurité avec chiffrement de bout en bout, traçabilité d'audit immuable et contrôle d'accès OIDC.",
    stack: ["Rust Axum", "Keycloak", "MinIO S3", "PostgreSQL 16"],
    gitTag: "v3.1.0",
    githubRepo: "cheikh-sec/health-records-federation",
    latencyMs: "5.1 ms",
    architecturePattern: "Zero-Trust Mesh",
    resilienceScore: 98,
    author: "Dr. Cheikh Tidiane",
    authorRole: "Chief Security Architect",
    updatedAt: "Il y a 2 jours",
    nodes: CORE_STUDIO_NODES,
    modules: [
      {
        id: "mod-zt-auth",
        name: "Sous-graphe Bastion OIDC & mTLS",
        description: "Authentification mutuelle et vérification fine des permissions.",
        nodeIds: ["edge-gateway", "auth-service"],
        stack: ["Kong mTLS", "Keycloak 25"],
        estimatedSetup: "2 nœuds",
      },
      {
        id: "mod-zt-storage",
        name: "Sous-graphe Coffre-fort Relationnel",
        description: "Stockage chiffré au repos avec journalisation stricte des accès.",
        nodeIds: ["pg-primary", "redis-cluster"],
        stack: ["PostgreSQL 16", "Valkey"],
        estimatedSetup: "2 nœuds",
      },
    ],
    comments: [
      {
        id: "c4",
        author: "Aminata S.",
        role: "Lead Architect",
        avatar: "AS",
        rating: 5,
        date: "Il y a 5 jours",
        comment:
          "Architecture très propre. Nous avons réutilisé la brique Bastion OIDC sur trois projets internes.",
        versionTested: "v3.1.0",
      },
    ],
  },
  {
    id: "bp-identite-gov",
    slug: "portail-identite-numerique-cedeao",
    title: "Plateforme E-Commerce Headless & Temps Réel",
    sector: "E-Commerce",
    visibility: "public",
    stars: 4.7,
    ratingsCount: 39,
    forks: 147,
    summary:
      "Catalogue haute performance, réservation de stock atomique par Redis et synchronisation de commandes événementielle.",
    stack: ["Next.js 16", "Go", "PostgreSQL 16", "Valkey", "Meilisearch"],
    gitTag: "v1.2.0",
    githubRepo: "koffi-dev/omni-commerce-headless",
    latencyMs: "6.2 ms",
    architecturePattern: "Headless Composable",
    resilienceScore: 92,
    author: "Koffi D.",
    authorRole: "Staff Engineer",
    updatedAt: "Il y a 4 jours",
    nodes: CORE_STUDIO_NODES,
    modules: [
      {
        id: "mod-ecom-edge",
        name: "Sous-graphe Passerelle & Auth Client",
        description: "API Gateway et gestion des sessions paniers.",
        nodeIds: ["edge-gateway", "auth-service"],
        stack: ["Kong", "Keycloak"],
        estimatedSetup: "2 nœuds",
      },
      {
        id: "mod-ecom-order",
        name: "Sous-graphe Moteur de Commande & Stock",
        description: "Décrémentation atomique des stocks et file de traitement.",
        nodeIds: ["core-orchestrator", "event-bus", "redis-cluster"],
        stack: ["Go", "Redpanda", "Valkey"],
        estimatedSetup: "3 nœuds",
      },
    ],
    comments: [],
  },
];

export const ARCHITECTURE_REVIEWS: ArchitectureReviewPR[] = [
  {
    id: "pr-42",
    number: 42,
    title: "Ajout d'une réplique PostgreSQL synchrone et découplage Redpanda",
    project: "payment-mesh-core",
    sourceBranch: "feat/ha-redpanda-saga",
    targetBranch: "main",
    gitTagTarget: "v2.4.0",
    status: "open",
    author: "Aminata S.",
    authorRole: "Lead Architect",
    createdAt: "Ouverte il y a 35 min",
    summary:
      "Cette proposition introduit un bus Redpanda entre le moteur métier et les services aval, et passe le cluster PostgreSQL en configuration haute disponibilité avec PgBouncer.",
    aiCheckPassed: true,
    aiSummary:
      "Revue IA validée : 0 point unique de défaillance détecté. Gain estimé de +45% sur le débit d'écriture maximal.",
    diffs: [
      {
        type: "added",
        component: "Bus d'Événements & Saga",
        after: "Redpanda / Kafka v24.1 (3 répliques)",
        detail: "Nouveau composant d'ingestion asynchrone (18k msg/s max)",
      },
      {
        type: "modified",
        component: "Cluster PostgreSQL + Read Replica",
        before: "PostgreSQL v15.4 (1 nœud · sans pooler)",
        after: "PostgreSQL v16.4 + PgBouncer (3 nœuds HA)",
        detail: "Activation du pool transactionnel et réplication synchrone",
      },
      {
        type: "modified",
        component: "Moteur Métier & Workflows",
        before: "Go Fiber v1.21 (2 répliques)",
        after: "Go Fiber / gRPC v1.23 (4 répliques)",
        detail: "Passage des appels internes en gRPC et publication sur Redpanda",
      },
    ],
    reviewers: [
      {
        name: "Koffi D.",
        initials: "KD",
        verdict: "approved",
        comment: "Le découplage Redpanda résout exactement notre goulot d'étranglement lors des pics.",
      },
      {
        name: "Dr. Cheikh Tidiane",
        initials: "CT",
        verdict: "approved",
        comment: "Chiffrement TLS interne vérifié sur les nouveaux flux gRPC. Prêt à merger et tagger v2.4.0.",
      },
      {
        name: "Fatou Diallo",
        initials: "FD",
        verdict: "pending",
      },
    ],
  },
  {
    id: "pr-39",
    number: 39,
    title: "Introduction d'un cache sémantique Valkey devant le moteur RAG",
    project: "enterprise-rag-engine",
    sourceBranch: "feat/semantic-cache",
    targetBranch: "main",
    gitTagTarget: "v1.6.0",
    status: "open",
    author: "Fatou Diallo",
    authorRole: "AI Platform Architect",
    createdAt: "Ouverte il y a 3 heures",
    summary:
      "Ajout d'une couche Valkey 7.2 pour mettre en cache les embeddings et les réponses aux requêtes récurrentes avant d'interroger Qdrant.",
    aiCheckPassed: true,
    aiSummary:
      "Revue IA validée : Latence p95 réduite de 340 ms à 28 ms sur les requêtes mises en cache.",
    diffs: [
      {
        type: "added",
        component: "Cache Sémantique Vectoriel",
        after: "Valkey v7.2 (2 répliques · TTL 24h)",
        detail: "Recherche de proximité cosinus rapide en mémoire",
      },
      {
        type: "modified",
        component: "API Gateway & Routeur",
        before: "Rate-limit global fixe",
        after: "Rate-limit adaptatif par token consommé",
        detail: "Protection contre les requêtes abusives sur les modèles",
      },
    ],
    reviewers: [
      {
        name: "Aminata S.",
        initials: "AS",
        verdict: "approved",
        comment: "Topologie validée, la documentation générée est bien à jour.",
      },
    ],
  },
  {
    id: "pr-35",
    number: 35,
    title: "Migration de l'authentification vers Keycloak 25 OIDC fédéré",
    project: "health-records-federation",
    sourceBranch: "sec/keycloak-25",
    targetBranch: "main",
    gitTagTarget: "v3.1.0",
    status: "merged",
    author: "Dr. Cheikh Tidiane",
    authorRole: "Chief Security Architect",
    createdAt: "Mergée il y a 2 jours",
    summary:
      "Remplacement du service d'authentification maison par Keycloak 25 en haute disponibilité avec rotation automatique des clés JWKS.",
    aiCheckPassed: true,
    aiSummary: "Conformité OIDC et séparation des privilèges validées à 98%.",
    diffs: [
      {
        type: "modified",
        component: "Identité & OAuth2 / OIDC",
        before: "Node.js Custom JWT Service",
        after: "Keycloak v25.0 (2 répliques)",
        detail: "Support PKCE, OIDC fédéré et RBAC par organisation",
      },
    ],
    reviewers: [
      {
        name: "Aminata S.",
        initials: "AS",
        verdict: "approved",
      },
      {
        name: "Koffi D.",
        initials: "KD",
        verdict: "approved",
      },
    ],
  },
];

export const TEAM_CHANNELS = [
  { id: "architecture-core", name: "architecture-core", unread: 2 },
  { id: "revue-stack", name: "revue-stack", unread: 0 },
  { id: "releases-git", name: "releases-git", unread: 1 },
] as const;

export const TEAM_MESSAGES: TeamChatMessage[] = [
  {
    id: "m1",
    channelId: "architecture-core",
    author: "Aminata S.",
    initials: "AS",
    role: "Lead Architect",
    time: "14:12",
    text: "Je viens de pousser la proposition #42 avec le bus Redpanda et la mise à jour PostgreSQL 16.4. L'assistant IA a régénéré l'ADR-004 automatiquement.",
    linkedNode: "Bus d'Événements & Saga",
    linkedVersion: "v2.4.0",
  },
  {
    id: "m2",
    channelId: "architecture-core",
    author: "Koffi D.",
    initials: "KD",
    role: "Staff Engineer",
    time: "14:18",
    text: "J'ai lancé le simulateur de charge à 12 000 req/s sur ta branche : le pool PgBouncer encaisse sans broncher. J'ai approuvé la revue.",
    linkedNode: "Cluster PostgreSQL + Read Replica",
  },
  {
    id: "m3",
    channelId: "architecture-core",
    author: "Dr. Cheikh Tidiane",
    initials: "CT",
    role: "Security Architect",
    time: "14:25",
    text: "Parfait. Dès qu'on merge, la version v2.4.0 sera liée à la release GitHub et exposée sur le serveur MCP pour que les agents génèrent les nouveaux handlers Go.",
    linkedVersion: "v2.4.0",
  },
  {
    id: "m4",
    channelId: "revue-stack",
    author: "Fatou Diallo",
    initials: "FD",
    role: "AI Platform Architect",
    time: "11:40",
    text: "Nous avons standardisé Valkey 7.2 sur l'ensemble de nos templates publics pour unifier le cache distribué.",
  },
  {
    id: "m5",
    channelId: "releases-git",
    author: "Bot GitHub Sync",
    initials: "GH",
    role: "Intégration Git",
    time: "Hier",
    text: "Release GitHub v2.3.1 synchronisée avec succès sur lonkoo-org/payment-mesh-core (commit 3c9e11b).",
    linkedVersion: "v2.3.1",
  },
];

export const COMMUNITY_ARCHITECTS: CommunityArchitect[] = [
  {
    id: "arch-1",
    handle: "aminata-arch",
    name: "Aminata S.",
    initials: "AS",
    color: "#1265DD",
    role: "Principal Systems Architect",
    company: "Kora FinTech",
    location: "Dakar",
    bio: "Spécialiste des architectures distribuées haute disponibilité, patterns Saga et moteurs transactionnels Go / Redpanda.",
    specialties: ["Go 1.23", "Redpanda", "PostgreSQL HA", "Kong Gateway"],
    followers: 1420,
    following: 184,
    publishedBlueprintsCount: 6,
    forksReceived: 485,
    isFollowing: false,
  },
  {
    id: "arch-2",
    handle: "fatou-ai",
    name: "Fatou Diallo",
    initials: "FD",
    color: "#0284C7",
    role: "AI Platform Architect",
    company: "Nubia AI Labs",
    location: "Abidjan",
    bio: "Conception d'infrastructures RAG hybrides, serveurs d'inférence vLLM et orchestration multi-agents sous protocole MCP.",
    specialties: ["Python FastAPI", "Qdrant", "vLLM", "Valkey"],
    followers: 980,
    following: 210,
    publishedBlueprintsCount: 4,
    forksReceived: 312,
    isFollowing: true,
  },
  {
    id: "arch-3",
    handle: "cheikh-sec",
    name: "Dr. Cheikh Tidiane",
    initials: "CT",
    color: "#0D9488",
    role: "Chief Security Architect",
    company: "Sovereign Cloud Group",
    location: "Casablanca",
    bio: "Architectures Zero-Trust, fédération d'identité OIDC / mTLS, coffres-forts de données médicales et conformité cryptographique.",
    specialties: ["Rust Axum", "Keycloak OIDC", "HashiCorp Vault", "MinIO S3"],
    followers: 1150,
    following: 95,
    publishedBlueprintsCount: 5,
    forksReceived: 276,
    isFollowing: true,
  },
  {
    id: "arch-4",
    handle: "koffi-dev",
    name: "Koffi D.",
    initials: "KD",
    color: "#2563EB",
    role: "Staff Backend Engineer",
    company: "OmniCommerce",
    location: "Lomé",
    bio: "Systèmes e-commerce temps réel, passerelles GraphQL fédérées et optimisation de latence sub-milliseconde.",
    specialties: ["Next.js 16", "Go", "Valkey Cluster", "Meilisearch"],
    followers: 760,
    following: 312,
    publishedBlueprintsCount: 3,
    forksReceived: 198,
    isFollowing: false,
  },
  {
    id: "arch-5",
    handle: "sarah-cloud",
    name: "Sarah Mensah",
    initials: "SM",
    color: "#4F46E5",
    role: "Cloud Infrastructure Lead",
    company: "PayMesh",
    location: "Accra",
    bio: "Service mesh Envoy, observabilité OpenTelemetry et automatisation d'infrastructures multi-régions.",
    specialties: ["Envoy Proxy", "Kubernetes", "PostgreSQL 16", "Cassandra"],
    followers: 640,
    following: 150,
    publishedBlueprintsCount: 4,
    forksReceived: 142,
    isFollowing: false,
  },
  {
    id: "arch-6",
    handle: "youssef-data",
    name: "Youssef Benali",
    initials: "YB",
    color: "#0F766E",
    role: "Data Streaming Architect",
    company: "StreamCore",
    location: "Tunis",
    bio: "Pipelines événementiels Kafka / Redpanda à très haut débit et analytique temps réel.",
    specialties: ["Apache Kafka", "Rust", "ClickHouse", "Redis Streams"],
    followers: 530,
    following: 128,
    publishedBlueprintsCount: 3,
    forksReceived: 115,
    isFollowing: false,
  },
];

export const DEFAULT_PROJECT_TEAMS: ProjectTeamGroup[] = [
  {
    id: "team-core",
    slug: "@lonkoo-org/core-architecture",
    name: "Core Architecture",
    description: "Architectes principaux habilités à valider la topologie et publier les releases.",
    membersCount: 3,
    permission: "Maintainer",
  },
  {
    id: "team-sec",
    slug: "@lonkoo-org/security-reviewers",
    name: "Security Reviewers",
    description: "Équipe chargée de l'audit IAM, mTLS et validation des flux sensibles.",
    membersCount: 2,
    permission: "Write",
  },
  {
    id: "team-backend",
    slug: "@lonkoo-org/backend-squad",
    name: "Backend Squad",
    description: "Développeurs services et mainteneurs des connecteurs MCP.",
    membersCount: 4,
    permission: "Write",
  },
];
