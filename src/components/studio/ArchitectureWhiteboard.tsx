"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  type ArchitectureNode,
  type ArchitectureEdge,
  type ArchitectureShape,
  type NodeRole,
} from "@/lib/lonkoo-data";
import {
  Cpu,
  ShieldCheck,
  Lightning,
  Sparkle,
  Plus,
  Trash,
  ArrowsOutSimple,
  Copy,
  ShareNetwork,
  Cursor,
  HardDrives,
  CaretDown,
  CaretUp,
  Cube,
  Prohibit,
} from "@phosphor-icons/react";

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
};

export const STENCIL_ITEMS = [
  {
    shape: "generic" as ArchitectureShape,
    role: "generic" as NodeRole,
    label: "Bloc libre",
    group: "Générique",
  },
  {
    shape: "service" as ArchitectureShape,
    role: "service" as NodeRole,
    label: "Service / API",
    group: "Calcul",
  },
  {
    shape: "cylinder" as ArchitectureShape,
    role: "database" as NodeRole,
    label: "Base de données",
    group: "Données",
  },
  {
    shape: "user" as ArchitectureShape,
    role: "user" as NodeRole,
    label: "Utilisateur / Client",
    group: "Acteurs",
  },
  {
    shape: "gateway" as ArchitectureShape,
    role: "gateway" as NodeRole,
    label: "Passerelle",
    group: "Réseau",
  },
  {
    shape: "queue" as ArchitectureShape,
    role: "queue" as NodeRole,
    label: "File / Bus",
    group: "Asynchrone",
  },
  {
    shape: "cache" as ArchitectureShape,
    role: "cache" as NodeRole,
    label: "Cache",
    group: "Données",
  },
  {
    shape: "security" as ArchitectureShape,
    role: "auth" as NodeRole,
    label: "Sécurité / Auth",
    group: "Sécurité",
  },
  {
    shape: "ai" as ArchitectureShape,
    role: "ai" as NodeRole,
    label: "Module IA",
    group: "IA",
  },
] as const;

interface WhiteboardProps {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  selectedNodeId: string;
  onSelectNode: (id: string) => void;
  onUpdateNodes: (nodes: ArchitectureNode[]) => void;
  onUpdateEdges: (edges: ArchitectureEdge[]) => void;
}

export function ArchitectureWhiteboard({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onUpdateNodes,
  onUpdateEdges,
}: WhiteboardProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [gridType, setGridType] = useState<"dots" | "lines" | "blank">("dots");
  const [activeTool, setActiveTool] = useState<"select" | "connect" | "pan">("select");
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);

  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; nodeX: number; nodeY: number } | null>(null);
  const isPanningRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number } | null>(null);

  const [toolboxTab, setToolboxTab] = useState<"components" | "techstack">("components");
  const [isToolboxMinimized, setIsToolboxMinimized] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? nodes[0];

  // Navigation naturelle au Trackpad (Pan à 2 doigts + Pinch-to-Zoom)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Pinch-to-zoom sur trackpad ou Ctrl + molette
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
        setZoom((prevZoom) => {
          const nextZoom = Math.min(2.4, Math.max(0.35, Number((prevZoom * zoomFactor).toFixed(2))));
          const scaleChange = nextZoom / prevZoom;
          setPan((prevPan) => ({
            x: Math.round(cursorX - (cursorX - prevPan.x) * scaleChange),
            y: Math.round(cursorY - (cursorY - prevPan.y) * scaleChange),
          }));
          return nextZoom;
        });
      } else {
        // Glissement à 2 doigts sur le trackpad (Pan X et Y)
        setPan((prev) => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    onSelectNode(nodeId);

    if (activeTool === "connect") {
      if (!connectSourceId) {
        setConnectSourceId(nodeId);
      } else if (connectSourceId !== nodeId) {
        const newEdge: ArchitectureEdge = {
          id: `e-${Date.now()}`,
          from: connectSourceId,
          to: nodeId,
          protocol: "REST / HTTP3",
          throughput: "5.0k req/s",
        };
        onUpdateEdges([...edges, newEdge]);
        setConnectSourceId(null);
        setActiveTool("select");
      }
      return;
    }

    const targetNode = nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;

    setDraggingNodeId(nodeId);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      nodeX: targetNode.x,
      nodeY: targetNode.y,
    };
  };

  const handleAnchorClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (!connectSourceId) {
      setConnectSourceId(nodeId);
      setActiveTool("connect");
    } else if (connectSourceId !== nodeId) {
      const newEdge: ArchitectureEdge = {
        id: `e-${Date.now()}`,
        from: connectSourceId,
        to: nodeId,
        protocol: "gRPC",
        throughput: "7.2k req/s",
      };
      onUpdateEdges([...edges, newEdge]);
      setConnectSourceId(null);
      setActiveTool("select");
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    setConnectSourceId(null);
    // Cliquer-glisser sur le fond du canevas déplace la vue directement
    isPanningRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggingNodeId && dragStartRef.current) {
        const dx = (e.clientX - dragStartRef.current.mouseX) / zoom;
        const dy = (e.clientY - dragStartRef.current.mouseY) / zoom;
        const newX = Math.round(dragStartRef.current.nodeX + dx);
        const newY = Math.round(dragStartRef.current.nodeY + dy);

        onUpdateNodes(
          nodes.map((n) => (n.id === draggingNodeId ? { ...n, x: newX, y: newY } : n))
        );
      } else if (isPanningRef.current) {
        const dx = e.clientX - isPanningRef.current.mouseX;
        const dy = e.clientY - isPanningRef.current.mouseY;
        setPan({
          x: isPanningRef.current.panX + dx,
          y: isPanningRef.current.panY + dy,
        });
      }
    },
    [draggingNodeId, zoom, nodes, onUpdateNodes]
  );

  const handleMouseUp = () => {
    setDraggingNodeId(null);
    dragStartRef.current = null;
    isPanningRef.current = null;
  };

  // Ajouter un bloc sur le canevas SANS imposer de stack technique par défaut
  const handleAddStencil = (item: (typeof STENCIL_ITEMS)[number]) => {
    const id = `${item.shape}-${Date.now().toString(36)}`;
    const count = nodes.filter((n) => n.shape === item.shape).length + 1;

    const centerX = Math.round((-pan.x + 280) / zoom + (nodes.length % 4) * 45);
    const centerY = Math.round((-pan.y + 140) / zoom + (nodes.length % 3) * 45);

    const newNode: ArchitectureNode = {
      id,
      title: `${item.label} ${count}`,
      tech: "", // Aucune stack forcée à la pose du bloc
      version: "",
      shape: item.shape,
      moduleGroup: item.group,
      description: "Composant logique d'architecture.",
      status: "Actif",
      metricLabel: "Capacité",
      metricValue: "Standard",
      baseLatencyMs: 3.0,
      maxRpsCapacity: 10000,
      replicas: 1,
      port: 0,
      role: item.role,
      x: centerX,
      y: centerY,
      envVars: [],
      dependencies: [],
    };

    onUpdateNodes([...nodes, newNode]);
    onSelectNode(id);
  };

  const handleClearStack = () => {
    if (!selectedNode) return;
    onUpdateNodes(
      nodes.map((n) =>
        n.id === selectedNode.id
          ? {
              ...n,
              tech: "",
              version: "",
              port: 0,
            }
          : n
      )
    );
  };

  const handleApplyPreset = (preset: TechStackPreset) => {
    if (!selectedNode) return;
    onUpdateNodes(
      nodes.map((n) =>
        n.id === selectedNode.id
          ? {
              ...n,
              tech: preset.name,
              version: preset.version,
              port: preset.port,
              description: preset.description,
              baseLatencyMs: preset.baseLatencyMs,
              maxRpsCapacity: preset.maxRpsCapacity,
              envVars: preset.envVars,
              status: "Optimisé",
            }
          : n
      )
    );
  };

  const handleDeleteSelected = () => {
    if (!selectedNode || nodes.length <= 1) return;
    onUpdateNodes(nodes.filter((n) => n.id !== selectedNode.id));
    onUpdateEdges(edges.filter((e) => e.from !== selectedNode.id && e.to !== selectedNode.id));
    const nextNode = nodes.find((n) => n.id !== selectedNode.id);
    if (nextNode) onSelectNode(nextNode.id);
  };

  const handleDuplicateSelected = () => {
    if (!selectedNode) return;
    const dupId = `${selectedNode.shape}-${Date.now().toString(36)}`;
    const duplicated: ArchitectureNode = {
      ...selectedNode,
      id: dupId,
      title: `${selectedNode.title} (2)`,
      x: selectedNode.x + 35,
      y: selectedNode.y + 35,
    };
    onUpdateNodes([...nodes, duplicated]);
    onSelectNode(dupId);
  };

  const handleDeleteEdge = (edgeId: string) => {
    onUpdateEdges(edges.filter((e) => e.id !== edgeId));
  };

  const renderShapeIcon = (shape: ArchitectureShape, size = 28) => {
    switch (shape) {
      case "cylinder":
        return (
          <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className="flex-shrink-0">
            <ellipse cx="16" cy="7" rx="12" ry="4.5" fill="#E0F2FE" stroke="#1265DD" strokeWidth="1.8" />
            <path d="M4 7v7c0 2.5 5.4 4.5 12 4.5s12-2 12-4.5V7" fill="#BAE6FD" stroke="#1265DD" strokeWidth="1.8" />
            <path d="M4 14v8c0 2.5 5.4 4.5 12 4.5s12-2 12-4.5v-8" fill="#7DD3FC" stroke="#1265DD" strokeWidth="1.8" />
          </svg>
        );
      case "user":
        return (
          <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className="flex-shrink-0">
            <circle cx="16" cy="8.5" r="5" fill="#E0F2FE" stroke="#0284C7" strokeWidth="1.8" />
            <path
              d="M6.5 26.5c0-5.2 4.3-9.5 9.5-9.5s9.5 4.3 9.5 9.5"
              fill="#BAE6FD"
              stroke="#0284C7"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        );
      case "gateway":
        return (
          <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[#1265DD] flex-shrink-0">
            <ShareNetwork size={16} weight="bold" />
          </div>
        );
      case "service":
        return (
          <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-800 flex-shrink-0">
            <Cpu size={16} weight="bold" />
          </div>
        );
      case "queue":
        return (
          <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className="flex-shrink-0">
            <rect x="3" y="10" width="26" height="12" rx="4" fill="#FEF3C7" stroke="#D97706" strokeWidth="1.8" />
            <line x1="11" y1="10" x2="11" y2="22" stroke="#D97706" strokeWidth="1.5" strokeDasharray="2 2" />
            <line x1="19" y1="10" x2="19" y2="22" stroke="#D97706" strokeWidth="1.5" strokeDasharray="2 2" />
            <circle cx="7" cy="16" r="2" fill="#D97706" />
            <circle cx="15" cy="16" r="2" fill="#D97706" />
            <circle cx="23" cy="16" r="2" fill="#D97706" />
          </svg>
        );
      case "cache":
        return (
          <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-emerald-600 flex-shrink-0">
            <Lightning size={16} weight="fill" />
          </div>
        );
      case "security":
        return (
          <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-800 flex-shrink-0">
            <ShieldCheck size={16} weight="fill" />
          </div>
        );
      case "ai":
        return (
          <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[#1265DD] flex-shrink-0">
            <Sparkle size={16} weight="fill" />
          </div>
        );
      case "generic":
      default:
        return (
          <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 flex-shrink-0">
            <Cube size={16} weight="bold" />
          </div>
        );
    }
  };

  return (
    <div className="w-full h-full min-h-[600px] bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden relative select-none">
      {/* BARRE D'OUTILS DU CANEVAS */}
      <div className="px-3 py-2 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 z-20 flex-shrink-0">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setActiveTool("select");
              setConnectSourceId(null);
            }}
            className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTool === "select"
                ? "bg-white text-slate-950 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Cursor size={13} weight="bold" />
            <span>Sélection</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTool("connect");
              setConnectSourceId(null);
            }}
            className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTool === "connect"
                ? "bg-[#1265DD] text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShareNetwork size={13} weight="bold" />
            <span>{connectSourceId ? "Choisir la cible..." : "Relier"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTool("pan");
              setConnectSourceId(null);
            }}
            className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTool === "pan"
                ? "bg-white text-slate-950 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ArrowsOutSimple size={13} />
            <span className="hidden sm:inline">Main</span>
          </button>
        </div>

        {/* Contrôles Zoom & Grille */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-mono">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(1))))}
              className="w-6 h-6 rounded text-slate-700 hover:bg-white flex items-center justify-center font-bold cursor-pointer"
              title="Dézoomer"
            >
              -
            </button>
            <span className="px-2 font-medium text-slate-800 text-[11px]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.1).toFixed(1))))}
              className="w-6 h-6 rounded text-slate-700 hover:bg-white flex items-center justify-center font-bold cursor-pointer"
              title="Zoomer"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 20, y: 20 });
              }}
              className="px-2 py-0.5 text-[11px] text-slate-600 hover:text-slate-950 hover:bg-white rounded cursor-pointer ml-0.5"
            >
              100%
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              setGridType((g) => (g === "dots" ? "lines" : g === "lines" ? "blank" : "dots"))
            }
            className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 font-medium hover:bg-slate-50 cursor-pointer"
          >
            {gridType === "dots" ? "Points" : gridType === "lines" ? "Grille" : "Uni"}
          </button>
        </div>
      </div>

      {/* SURFACE DU CANEVAS (Navigable au trackpad 2 doigts, pinch-to-zoom et glisser) */}
      <div
        ref={containerRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`flex-1 relative overflow-hidden touch-none ${
          activeTool === "pan" ? "cursor-grab active:cursor-grabbing" : "cursor-default"
        }`}
        style={{
          backgroundColor: "#FFFFFF",
          backgroundImage:
            gridType === "dots"
              ? "radial-gradient(#CBD5E1 1.2px, transparent 1.2px)"
              : gridType === "lines"
              ? "linear-gradient(to right, #F1F5F9 1px, transparent 1px), linear-gradient(to bottom, #F1F5F9 1px, transparent 1px)"
              : "none",
          backgroundSize: gridType === "lines" ? "24px 24px" : "20px 20px",
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {/* Liaisons SVG */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <defs>
            <marker
              id="whiteboard-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#475569" />
            </marker>
          </defs>

          {edges.map((edge) => {
            const fromNode = nodes.find((n) => n.id === edge.from);
            const toNode = nodes.find((n) => n.id === edge.to);
            if (!fromNode || !toNode) return null;

            const x1 = fromNode.x + 196;
            const y1 = fromNode.y + 38;
            const x2 = toNode.x;
            const y2 = toNode.y + 38;

            const dx = Math.max(40, Math.abs(x2 - x1) * 0.45);
            const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            return (
              <g
                key={edge.id}
                onClick={() => handleDeleteEdge(edge.id)}
                className="cursor-pointer pointer-events-auto group"
              >
                <title>Cliquer pour supprimer la liaison</title>
                <path
                  d={pathD}
                  fill="none"
                  stroke="#64748B"
                  strokeWidth="1.8"
                  markerEnd="url(#whiteboard-arrow)"
                  className="group-hover:stroke-red-500 transition-colors"
                />
                <rect
                  x={midX - 34}
                  y={midY - 10}
                  width={68}
                  height={20}
                  rx={4}
                  fill="#FFFFFF"
                  stroke="#E2E8F0"
                  strokeWidth="1"
                />
                <text
                  x={midX}
                  y={midY + 3}
                  textAnchor="middle"
                  fill="#475569"
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="600"
                >
                  {edge.protocol.split("/")[0]}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Blocs sur le canevas */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {nodes.map((node) => {
            const isSelected = selectedNode?.id === node.id;
            const isConnectSource = connectSourceId === node.id;
            const hasStack = Boolean(node.tech && node.tech.trim().length > 0);

            return (
              <div
                key={node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                style={{
                  position: "absolute",
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: "196px",
                }}
                className={`group pointer-events-auto rounded-xl bg-white p-3 transition-shadow cursor-move flex flex-col justify-between select-none ${
                  isSelected
                    ? "border-2 border-[#1265DD] shadow-md"
                    : isConnectSource
                    ? "border-2 border-dashed border-[#1265DD]"
                    : "border border-slate-200 shadow-2xs hover:border-slate-300"
                }`}
              >
                {/* Points d'ancrage cardinaux (Haut, Droite, Bas, Gauche) */}
                <button
                  type="button"
                  onClick={(e) => handleAnchorClick(e, node.id)}
                  title="Relier"
                  className="absolute -top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white border border-[#1265DD] text-[#1265DD] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:scale-125 transition-all cursor-crosshair z-20"
                >
                  <Plus size={8} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleAnchorClick(e, node.id)}
                  title="Relier"
                  className="absolute top-1/2 -right-2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border border-[#1265DD] text-[#1265DD] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:scale-125 transition-all cursor-crosshair z-20"
                >
                  <Plus size={8} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleAnchorClick(e, node.id)}
                  title="Relier"
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white border border-[#1265DD] text-[#1265DD] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:scale-125 transition-all cursor-crosshair z-20"
                >
                  <Plus size={8} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleAnchorClick(e, node.id)}
                  title="Relier"
                  className="absolute top-1/2 -left-2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border border-[#1265DD] text-[#1265DD] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:scale-125 transition-all cursor-crosshair z-20"
                >
                  <Plus size={8} weight="bold" />
                </button>

                {/* Poignées de sélection */}
                {isSelected && (
                  <>
                    <div className="absolute -top-1 -left-1 w-2 h-2 bg-[#1265DD] pointer-events-none" />
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#1265DD] pointer-events-none" />
                    <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-[#1265DD] pointer-events-none" />
                    <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#1265DD] pointer-events-none" />
                  </>
                )}

                <div className="flex items-center gap-2.5">
                  {renderShapeIcon(node.shape, 28)}
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-semibold text-slate-950 leading-snug truncate">
                      {node.title}
                    </h4>
                    <div className="text-[10px] text-slate-400 truncate">
                      {node.moduleGroup}
                    </div>
                  </div>
                </div>

                {/* Stack technique affichée uniquement si définie */}
                {hasStack && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-[10px] font-mono">
                    <span className="font-medium text-slate-700 truncate">
                      {node.tech}
                    </span>
                    {node.version && (
                      <span className="text-slate-500 px-1.5 py-0.2 rounded bg-slate-100 text-[9px] flex-shrink-0">
                        {node.version}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* DOCK D'OUTILS EN BAS (Responsive Medium & Desktop, Solide, Sans Méta-Texte) */}
      <div
        className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1.5rem)] max-w-4xl bg-white rounded-xl border border-slate-200 shadow-lg transition-all duration-200 overflow-hidden ${
          isToolboxMinimized ? "p-2" : "p-3"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => {
                setToolboxTab("components");
                setIsToolboxMinimized(false);
              }}
              className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                toolboxTab === "components" && !isToolboxMinimized
                  ? "bg-white text-slate-950 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Composants
            </button>
            <button
              type="button"
              onClick={() => {
                setToolboxTab("techstack");
                setIsToolboxMinimized(false);
              }}
              className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                toolboxTab === "techstack" && !isToolboxMinimized
                  ? "bg-white text-slate-950 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>Stack technique</span>
              {selectedNode && (
                <span className="hidden sm:inline text-[10px] font-mono text-slate-400 truncate max-w-[120px]">
                  · {selectedNode.title}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {selectedNode && !isToolboxMinimized && (
              <>
                <button
                  type="button"
                  onClick={handleDuplicateSelected}
                  title="Dupliquer le bloc"
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Copy size={13} />
                  <span className="hidden sm:inline">Dupliquer</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  title="Supprimer le bloc"
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Trash size={13} />
                  <span className="hidden sm:inline">Supprimer</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setIsToolboxMinimized(!isToolboxMinimized)}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-950 hover:bg-slate-50 transition-colors cursor-pointer"
              title={isToolboxMinimized ? "Déplier" : "Réduire"}
            >
              {isToolboxMinimized ? <CaretUp size={14} /> : <CaretDown size={14} />}
            </button>
          </div>
        </div>

        {!isToolboxMinimized && (
          <div className="pt-2.5 mt-2 border-t border-slate-100">
            {/* ONGLET 1 : COMPOSANTS (Ajout de bloc sans imposer de stack) */}
            {toolboxTab === "components" && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {STENCIL_ITEMS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleAddStencil(item)}
                    className="min-w-[104px] flex-1 p-2 rounded-lg border border-slate-200 hover:border-[#1265DD] hover:bg-slate-50 transition-colors cursor-pointer flex flex-col items-center text-center bg-white flex-shrink-0"
                  >
                    <div className="w-8 h-8 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center mb-1">
                      {renderShapeIcon(item.shape, 20)}
                    </div>
                    <div className="text-[11px] font-medium text-slate-900 truncate w-full">
                      {item.label}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* ONGLET 2 : STACK TECHNIQUE (Optionnelle pour chaque bloc) */}
            {toolboxTab === "techstack" && (
              <div>
                {!selectedNode ? (
                  <div className="py-3 text-center text-xs text-slate-500">
                    Sélectionnez un bloc sur le canevas pour modifier ses propriétés ou lui associer une stack.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start max-h-48 overflow-y-auto">
                    {/* Propriétés du bloc */}
                    <div className="md:col-span-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="col-span-2">
                          <label className="text-[10px] text-slate-500 block mb-0.5">
                            Nom du bloc
                          </label>
                          <input
                            type="text"
                            value={selectedNode.title}
                            onChange={(e) =>
                              onUpdateNodes(
                                nodes.map((n) =>
                                  n.id === selectedNode.id ? { ...n, title: e.target.value } : n
                                )
                              )
                            }
                            className="w-full px-2 py-1 rounded bg-white border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#1265DD]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-0.5">
                            Stack libre
                          </label>
                          <input
                            type="text"
                            placeholder="Aucune (optionnel)"
                            value={selectedNode.tech}
                            onChange={(e) =>
                              onUpdateNodes(
                                nodes.map((n) =>
                                  n.id === selectedNode.id ? { ...n, tech: e.target.value } : n
                                )
                              )
                            }
                            className="w-full px-2 py-1 rounded bg-white border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:border-[#1265DD]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-0.5">
                            Port / Répliques
                          </label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={selectedNode.port || ""}
                              placeholder="Port"
                              onChange={(e) =>
                                onUpdateNodes(
                                  nodes.map((n) =>
                                    n.id === selectedNode.id
                                      ? { ...n, port: Number(e.target.value) || 0 }
                                      : n
                                  )
                                )
                              }
                              className="w-full px-2 py-1 rounded bg-white border border-slate-200 text-xs font-mono text-slate-900"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sélection rapide ou Sans stack */}
                    <div className="md:col-span-8">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={handleClearStack}
                          className={`text-left p-2 rounded-lg border text-xs transition-colors cursor-pointer flex items-center gap-2 ${
                            !selectedNode.tech
                              ? "bg-slate-900 border-slate-900 text-white font-medium"
                              : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
                          }`}
                        >
                          <Prohibit size={14} className="flex-shrink-0" />
                          <div className="truncate">
                            <div className="font-medium truncate">Aucune stack</div>
                            <div className="text-[10px] opacity-75 truncate">Bloc neutre</div>
                          </div>
                        </button>

                        {(STACK_PRESETS_BY_SHAPE[selectedNode.shape] ?? []).map((preset) => {
                          const isCurrent = selectedNode.tech === preset.name;
                          return (
                            <button
                              key={preset.name}
                              type="button"
                              onClick={() => handleApplyPreset(preset)}
                              className={`text-left p-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                                isCurrent
                                  ? "bg-[#1265DD] border-[#1265DD] text-white font-medium"
                                  : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-800"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-semibold truncate">{preset.name}</span>
                                <span
                                  className={`text-[9px] font-mono px-1 rounded ${
                                    isCurrent
                                      ? "bg-white/20 text-white"
                                      : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {preset.version}
                                </span>
                              </div>
                              <div
                                className={`text-[10px] truncate mt-0.5 ${
                                  isCurrent ? "text-blue-100" : "text-slate-400"
                                }`}
                              >
                                Port :{preset.port}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
