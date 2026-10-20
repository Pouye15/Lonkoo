"use client";

import { useCallback, useEffect, useState } from "react";
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

const storageKey = (slug: string) => `lonkoo.graph.v1.${slug}`;

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

type Updater<T> = T | ((previous: T) => T);

export function useProjectGraph(slug: string) {
  const [graph, setGraph] = useState<Graph>(() => loadGraph(slug));

  const setNodes = useCallback((next: Updater<ArchitectureNode[]>) => {
    setGraph((current) => ({
      ...current,
      nodes: typeof next === "function" ? next(current.nodes) : next,
    }));
  }, []);

  const setEdges = useCallback((next: Updater<ArchitectureEdge[]>) => {
    setGraph((current) => ({
      ...current,
      edges: typeof next === "function" ? next(current.edges) : next,
    }));
  }, []);

  const reset = useCallback(() => setGraph(initialGraph(slug)), [slug]);

  // Sauvegarde différée pour ne pas écrire à chaque déplacement de souris.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey(slug), JSON.stringify(graph));
      } catch {
        // Stockage indisponible : les modifications durent le temps de la session.
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [slug, graph]);

  return { nodes: graph.nodes, edges: graph.edges, setNodes, setEdges, reset };
}
