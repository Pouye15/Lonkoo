"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IS_LIVE_API, type ApiRole } from "@/lib/api";
import { useCanvas, type CanvasStatus, type Peer } from "@/lib/canvas-session";
import { ensureCanvas, noteBlockCount, useWorkspace } from "@/lib/workspace";
import {
  CORE_STUDIO_NODES,
  STUDIO_EDGES,
  WORKSPACE_PROJECTS,
  type ArchitectureEdge,
  type ArchitectureNode,
} from "@/lib/lonkoo-data";

/**
 * Graphe d'architecture d'un projet (blocs et liaisons).
 *
 * Mode simulé (par défaut) : conservé dans le navigateur, un graphe par projet. Mode API
 * (`NEXT_PUBLIC_API_MODE=live`) : le document Yjs partagé du serveur temps réel, voir `canvas-session.ts`.
 * Les deux modes rendent la même forme : le tableau blanc ne sait pas d'où viennent ses blocs.
 */

interface Graph {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
}

/** Un graphe et le projet auquel il appartient : on n'écrit jamais sous une autre clé que la sienne. */
interface Loaded {
  slug: string;
  graph: Graph;
}

export const GRAPH_KEY_PREFIX = "lonkoo.graph.v1.";
const storageKey = (slug: string) => `${GRAPH_KEY_PREFIX}${slug}`;
const NO_PROJECT = "none";

/** Les projets d'exemple partent du graphe de démonstration, les nouveaux projets d'un canvas vide. */
function initialGraph(slug: string): Graph {
  const isSample = WORKSPACE_PROJECTS.some((project) => project.slug === slug);
  return isSample ? { nodes: CORE_STUDIO_NODES, edges: STUDIO_EDGES } : { nodes: [], edges: [] };
}

function loadGraph(slug: string): Graph {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Graph>;
      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
        return { nodes: parsed.nodes, edges: parsed.edges };
      }
    }
  } catch {
    // Données illisibles : retour au graphe initial.
  }
  return initialGraph(slug);
}

function saveGraph({ slug, graph }: Loaded) {
  if (slug === NO_PROJECT) return;
  try {
    window.localStorage.setItem(storageKey(slug), JSON.stringify(graph));
  } catch {
    // Stockage indisponible : les modifications durent le temps de la session.
  }
}

/** Efface les graphes gardés dans le navigateur (déconnexion). */
export function clearStoredGraphs() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(GRAPH_KEY_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}

type Updater<T> = T | ((previous: T) => T);

/** État de la connexion au canvas partagé (mode API seulement). */
export interface LiveCanvasInfo {
  canvasId: string | null;
  status: CanvasStatus;
  /** Le document est chargé : le tableau peut s'afficher. */
  synced: boolean;
  role: ApiRole | null;
  readOnly: boolean;
  peers: Peer[];
  error: string | null;
  setCursor: (point: { x: number; y: number } | null) => void;
}

export interface ProjectGraph {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  setNodes: (next: Updater<ArchitectureNode[]>) => void;
  setEdges: (next: Updater<ArchitectureEdge[]>) => void;
  reset: () => void;
  /** Renseigné en mode API, `null` en mode simulé. */
  live: LiveCanvasInfo | null;
}

/* ------------------------------------------------------------------ */
/* Mode API : document Yjs partagé                                      */
/* ------------------------------------------------------------------ */

function useLiveGraph(slug: string): ProjectGraph {
  const { allProjects } = useWorkspace();
  const project = allProjects.find((p) => p.slug === slug);
  const projectId = project?.id;
  const canvasId = project?.canvasId ?? null;

  useEffect(() => {
    if (projectId && !canvasId) ensureCanvas(projectId);
  }, [projectId, canvasId]);

  const canvas = useCanvas(canvasId);

  useEffect(() => {
    if (projectId && canvas.synced) noteBlockCount(projectId, canvas.nodes.length);
  }, [projectId, canvas.synced, canvas.nodes.length]);

  const reset = useCallback(() => undefined, []);

  return {
    nodes: canvas.nodes,
    edges: canvas.edges,
    setNodes: canvas.setNodes,
    setEdges: canvas.setEdges,
    reset,
    live: {
      canvasId,
      status: canvas.status,
      synced: canvas.synced,
      role: canvas.role,
      readOnly: canvas.readOnly,
      peers: canvas.peers,
      error: canvas.error,
      setCursor: canvas.setCursor,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Mode simulé : graphe gardé dans le navigateur                        */
/* ------------------------------------------------------------------ */

/**
 * @param persist `false` pour une simple lecture (aucune écriture dans le navigateur).
 */
function useMockGraph(slug: string, { persist = true }: { persist?: boolean } = {}): ProjectGraph {
  const [loaded, setLoaded] = useState<Loaded>(() => ({ slug, graph: loadGraph(slug) }));

  // Le projet change sans démontage : on charge le graphe du nouveau projet.
  if (loaded.slug !== slug) {
    setLoaded({ slug, graph: loadGraph(slug) });
  }

  const setNodes = useCallback((next: Updater<ArchitectureNode[]>) => {
    setLoaded((current) => ({
      ...current,
      graph: { ...current.graph, nodes: typeof next === "function" ? next(current.graph.nodes) : next },
    }));
  }, []);

  const setEdges = useCallback((next: Updater<ArchitectureEdge[]>) => {
    setLoaded((current) => ({
      ...current,
      graph: { ...current.graph, edges: typeof next === "function" ? next(current.graph.edges) : next },
    }));
  }, []);

  const reset = useCallback(() => setLoaded((current) => ({ ...current, graph: initialGraph(current.slug) })), []);

  // Dernière valeur connue, pour vider la sauvegarde différée au démontage ou à la fermeture de la page.
  const latest = useRef(loaded);
  useEffect(() => {
    latest.current = loaded;
  }, [loaded]);

  useEffect(() => {
    if (!persist) return;
    const flush = () => saveGraph(latest.current);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [persist]);

  // Sauvegarde différée pour ne pas écrire à chaque déplacement de souris.
  useEffect(() => {
    if (!persist) return;
    const timer = window.setTimeout(() => saveGraph(loaded), 400);
    return () => window.clearTimeout(timer);
  }, [loaded, persist]);

  return { nodes: loaded.graph.nodes, edges: loaded.graph.edges, setNodes, setEdges, reset, live: null };
}

/** Le graphe du projet `slug` : simulé ou partagé selon le mode de l'application (fixé au build). */
export const useProjectGraph: (slug: string, options?: { persist?: boolean }) => ProjectGraph = IS_LIVE_API
  ? useLiveGraph
  : useMockGraph;
