"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
 * Provisoire : conservé dans le navigateur, un graphe par projet. Il sera remplacé par le document
 * Yjs partagé du serveur temps réel (docs/ROADMAP-BACKEND.md, WP6 et WP12).
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

/**
 * @param persist `false` pour une simple lecture (aucune écriture dans le navigateur).
 */
export function useProjectGraph(slug: string, { persist = true }: { persist?: boolean } = {}) {
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

  return { nodes: loaded.graph.nodes, edges: loaded.graph.edges, setNodes, setEdges, reset };
}
