"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Copy,
  CornersOut,
  Cursor,
  DotsNine,
  GridFour,
  Hand,
  MapTrifold,
  Magnet,
  Minus,
  Plus,
  ShareNetwork,
  Square,
  Trash,
} from "@phosphor-icons/react";
import type { ArchitectureEdge, ArchitectureNode } from "@/lib/lonkoo-data";
import { cn } from "@/lib/cn";
import { Dock, STENCIL_DRAG_TYPE } from "./whiteboard/Dock";
import { EdgesLayer, type ConnectPreview, type Guide } from "./whiteboard/EdgesLayer";
import {
  GRID,
  anchorPoint,
  findFreeSpot,
  nodeRect,
  nodeSize,
  pointInRect,
  rectCenter,
  rectsIntersect,
  snapToGrid,
  unionRects,
  type Point,
  type Rect,
  type Side,
} from "./whiteboard/geometry";
import { Minimap } from "./whiteboard/Minimap";
import { NodeView } from "./whiteboard/NodeView";
import { PROTOCOLS, STENCIL_ITEMS, type StencilItem, type TechStackPreset } from "./whiteboard/stencils";
import { useViewport } from "./whiteboard/use-viewport";

interface WhiteboardProps {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  selectedNodeId: string;
  onSelectNode: (id: string) => void;
  onUpdateNodes: (nodes: ArchitectureNode[]) => void;
  onUpdateEdges: (edges: ArchitectureEdge[]) => void;
}

type Tool = "select" | "hand" | "connect";
type GridType = "dots" | "lines" | "blank";

interface Graph {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
}

type Drag =
  | { kind: "pan"; last: Point }
  | {
      kind: "nodes";
      start: Point;
      origin: Map<string, Point>;
      moved: boolean;
      toggleOnRelease: string | null;
    }
  | { kind: "marquee"; start: Point; base: string[]; additive: boolean; hits: string[] }
  | { kind: "connect"; fromId: string; side: Side; start: Point; moved: boolean };

interface Draft {
  dx: number;
  dy: number;
  guides: Guide[];
}

interface PreviewState {
  fromId: string;
  side: Side | null;
  to: Point;
  targetId: string | null;
}

const GRID_IMAGE: Record<GridType, string> = {
  dots: "radial-gradient(var(--board-dot) 1.2px, transparent 1.2px)",
  lines: "linear-gradient(to right, var(--board-line) 1px, transparent 1px), linear-gradient(to bottom, var(--board-line) 1px, transparent 1px)",
  blank: "none",
};

const GRID_LABEL: Record<GridType, string> = { dots: "Points", lines: "Grille", blank: "Uni" };

const HISTORY_LIMIT = 80;
/** Hauteur approximative de la boîte à outils posée en bas : le cadrage lui réserve cette place. */
const DOCK_INSET = 176;
const NO_GUIDES: Guide[] = [];

let idCounter = 0;
/** Identifiant local unique, en attendant ceux du serveur. */
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Math.random().toString(36).slice(2, 7)}${idCounter.toString(36)}`;
}

let clipboard: { nodes: ArchitectureNode[]; edges: ArchitectureEdge[]; pastes: number } | null = null;

function guessProtocol(from: ArchitectureNode, to: ArchitectureNode): ArchitectureEdge["protocol"] {
  if (to.shape === "cylinder") return "TCP / TLS";
  if (to.shape === "queue" || from.shape === "queue") return "Kafka / Events";
  if (to.shape === "cache") return "Redis PubSub";
  if (from.shape === "service" && to.shape === "service") return "gRPC";
  return "REST / HTTP3";
}

function sideToward(rect: Rect, point: Point): Side {
  const c = rectCenter(rect);
  const dx = point.x - c.x;
  const dy = point.y - c.y;
  if (Math.abs(dx) * rect.h >= Math.abs(dy) * rect.w) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

/**
 * Aimantation d'un déplacement : alignement sur les bords et centres des autres blocs (guides),
 * à défaut sur la grille.
 */
function snapDrag(
  box: Rect,
  dx: number,
  dy: number,
  others: Rect[],
  zoom: number,
): { dx: number; dy: number; guides: Guide[] } {
  const threshold = 7 / zoom;
  const moved = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };

  let bestX: { diff: number; at: number } | null = null;
  let bestY: { diff: number; at: number } | null = null;
  for (const other of others) {
    for (const target of [other.x, other.x + other.w / 2, other.x + other.w]) {
      for (const own of [moved.x, moved.x + moved.w / 2, moved.x + moved.w]) {
        const diff = target - own;
        if (Math.abs(diff) < threshold && (!bestX || Math.abs(diff) < Math.abs(bestX.diff))) bestX = { diff, at: target };
      }
    }
    for (const target of [other.y, other.y + other.h / 2, other.y + other.h]) {
      for (const own of [moved.y, moved.y + moved.h / 2, moved.y + moved.h]) {
        const diff = target - own;
        if (Math.abs(diff) < threshold && (!bestY || Math.abs(diff) < Math.abs(bestY.diff))) bestY = { diff, at: target };
      }
    }
  }

  const snappedDx = bestX ? dx + bestX.diff : snapToGrid(box.x + dx) - box.x;
  const snappedDy = bestY ? dy + bestY.diff : snapToGrid(box.y + dy) - box.y;
  const final = { x: box.x + snappedDx, y: box.y + snappedDy, w: box.w, h: box.h };

  const guides: Guide[] = [];
  if (bestX) {
    const at = bestX.at;
    const related = others.filter((o) => [o.x, o.x + o.w / 2, o.x + o.w].some((v) => Math.abs(v - at) < 0.5));
    const span = unionRects([final, ...related]);
    if (span) guides.push({ orientation: "v", at, from: span.y - 12, to: span.y + span.h + 12 });
  }
  if (bestY) {
    const at = bestY.at;
    const related = others.filter((o) => [o.y, o.y + o.h / 2, o.y + o.h].some((v) => Math.abs(v - at) < 0.5));
    const span = unionRects([final, ...related]);
    if (span) guides.push({ orientation: "h", at, from: span.x - 12, to: span.x + span.w + 12 });
  }
  return { dx: snappedDx, dy: snappedDy, guides };
}

function ToolbarButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
  showLabel = false,
  className,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        "flex h-8 flex-shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
        active ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:bg-surface hover:text-ink",
        className,
      )}
    >
      {children}
      {showLabel && <span className="hidden xl:inline">{label}</span>}
    </button>
  );
}

export function ArchitectureWhiteboard({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onUpdateNodes,
  onUpdateEdges,
}: WhiteboardProps) {
  const {
    containerRef,
    layerRef,
    view,
    size,
    viewRef,
    fit,
    panBy,
    zoomAt,
    zoomStep,
    zoomTo,
    animateTo,
    screenToWorld,
    cancelAnimation,
  } = useViewport();

  const [tool, setTool] = useState<Tool>("select");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceRef = useRef(false);
  const [gridType, setGridType] = useState<GridType>("dots");
  const [magnet, setMagnet] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);

  // Sélection : le dernier identifiant est le bloc « principal » (celui que la boîte à outils édite).
  const [selection, setSelection] = useState<string[]>(selectedNodeId ? [selectedNodeId] : []);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [prevPropId, setPrevPropId] = useState(selectedNodeId);
  if (selectedNodeId !== prevPropId) {
    // Le parent a changé de bloc actif (ex. correctif de l'analyse IA appliqué) : on s'aligne.
    setPrevPropId(selectedNodeId);
    if (selectedNodeId && selection[selection.length - 1] !== selectedNodeId) {
      setSelection([selectedNodeId]);
      setSelectedEdgeId(null);
    }
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [armedSourceId, setArmedSourceId] = useState<string | null>(null);

  const dragRef = useRef<Drag | null>(null);
  // Dernières valeurs du geste, lisibles par pointerup même si React n'a pas encore rendu le dernier mouvement.
  const live = useRef<{ draft: Draft | null; target: string | null }>({ draft: null, target: null });
  const pointers = useRef(new Map<number, Point>());
  const pinchRef = useRef<{ distance: number; center: Point } | null>(null);
  const fittedRef = useRef(false);

  /* -------------------------------- Historique -------------------------------- */

  const history = useRef<{ past: Graph[]; future: Graph[]; lastKey: { key: string; at: number } | null }>({
    past: [],
    future: [],
    lastKey: null,
  });
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const refreshHistory = useCallback(() => {
    const h = history.current;
    setHistoryState({ canUndo: h.past.length > 0, canRedo: h.future.length > 0 });
  }, []);

  /** Applique une modification et l'enregistre pour annuler/rétablir ; `mergeKey` regroupe les frappes. */
  const commit = useCallback(
    (nextNodes: ArchitectureNode[] | null, nextEdges: ArchitectureEdge[] | null, mergeKey?: string) => {
      const h = history.current;
      const now = performance.now();
      const merge = Boolean(mergeKey && h.lastKey?.key === mergeKey && now - h.lastKey.at < 1000);
      if (!merge) {
        h.past.push({ nodes, edges });
        if (h.past.length > HISTORY_LIMIT) h.past.shift();
      }
      h.future = [];
      h.lastKey = mergeKey ? { key: mergeKey, at: now } : null;
      if (nextNodes) onUpdateNodes(nextNodes);
      if (nextEdges) onUpdateEdges(nextEdges);
      refreshHistory();
    },
    [nodes, edges, onUpdateNodes, onUpdateEdges, refreshHistory],
  );

  const undo = useCallback(() => {
    const h = history.current;
    const previous = h.past.pop();
    if (!previous) return;
    h.future.push({ nodes, edges });
    h.lastKey = null;
    onUpdateNodes(previous.nodes);
    onUpdateEdges(previous.edges);
    setSelection((current) => current.filter((id) => previous.nodes.some((n) => n.id === id)));
    setSelectedEdgeId(null);
    refreshHistory();
  }, [nodes, edges, onUpdateNodes, onUpdateEdges, refreshHistory]);

  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push({ nodes, edges });
    h.lastKey = null;
    onUpdateNodes(next.nodes);
    onUpdateEdges(next.edges);
    setSelection((current) => current.filter((id) => next.nodes.some((n) => n.id === id)));
    setSelectedEdgeId(null);
    refreshHistory();
  }, [nodes, edges, onUpdateNodes, onUpdateEdges, refreshHistory]);

  /* ------------------------------- Géométrie dérivée ------------------------------- */

  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const rects = useMemo(() => {
    const map = new Map<string, Rect>();
    for (const node of nodes) {
      const moving = draft && selection.includes(node.id);
      map.set(node.id, nodeRect(node, moving ? draft.dx : 0, moving ? draft.dy : 0));
    }
    return map;
  }, [nodes, draft, selection]);

  const primaryId = selection[selection.length - 1] ?? null;
  const selectedNode = primaryId ? (nodesById.get(primaryId) ?? null) : null;
  const selectedEdge = selectedEdgeId ? (edges.find((edge) => edge.id === selectedEdgeId) ?? null) : null;
  const solo = selection.length === 1;

  const contentBounds = useCallback(() => unionRects(nodes.map((node) => nodeRect(node))), [nodes]);

  // Cadrage initial une fois la taille connue.
  useEffect(() => {
    if (fittedRef.current || size.w === 0 || size.h === 0) return;
    fittedRef.current = true;
    fit(contentBounds(), false, DOCK_INSET);
  }, [size.w, size.h, fit, contentBounds]);

  /* ----------------------------------- Actions ----------------------------------- */

  const select = useCallback(
    (ids: string[]) => {
      setSelection(ids);
      setSelectedEdgeId(null);
      const last = ids[ids.length - 1];
      if (last) onSelectNode(last);
    },
    [onSelectNode],
  );

  const visibleCenter = useCallback((): Point => {
    const v = viewRef.current;
    const box = containerRef.current;
    return {
      x: ((box?.clientWidth ?? 600) / 2 - v.x) / v.zoom,
      y: ((box?.clientHeight ?? 400) / 2 - v.y) / v.zoom,
    };
  }, [viewRef, containerRef]);

  const addNode = useCallback(
    (item: StencilItem, at?: Point) => {
      const count = nodes.filter((node) => node.shape === item.shape).length;
      const center = at ?? visibleCenter();
      const { w, h } = nodeSize({ shape: item.shape, tech: "" });
      // Posé au curseur s'il vient d'un glisser-déposer, sinon au plus près du centre sans chevaucher un autre bloc.
      const spot = at
        ? { x: center.x - w / 2, y: center.y - h / 2 }
        : findFreeSpot(center, { w, h }, nodes.map((node) => nodeRect(node)));
      const node: ArchitectureNode = {
        id: newId(item.shape),
        title: `${item.label} ${count + 1}`,
        tech: "", // aucune stack imposée à la pose du bloc
        version: "",
        shape: item.shape,
        moduleGroup: item.group,
        description: "Composant logique d'architecture.",
        status: "Actif",
        metricLabel: "Capacité",
        metricValue: "Standard",
        baseLatencyMs: 3,
        maxRpsCapacity: 10000,
        replicas: 1,
        port: 0,
        role: item.role,
        x: snapToGrid(spot.x),
        y: snapToGrid(spot.y),
        envVars: [],
        dependencies: [],
      };
      commit([...nodes, node], null);
      select([node.id]);
    },
    [nodes, commit, select, visibleCenter],
  );

  const deleteSelection = useCallback(() => {
    if (selectedEdgeId) {
      commit(null, edges.filter((edge) => edge.id !== selectedEdgeId));
      setSelectedEdgeId(null);
      return;
    }
    if (selection.length === 0) return;
    const gone = new Set(selection);
    commit(
      nodes.filter((node) => !gone.has(node.id)),
      edges.filter((edge) => !gone.has(edge.from) && !gone.has(edge.to)),
    );
    setSelection([]);
  }, [selectedEdgeId, selection, nodes, edges, commit]);

  const cloneNodes = useCallback(
    (source: ArchitectureNode[], sourceEdges: ArchitectureEdge[], offset: number) => {
      const ids = new Map<string, string>();
      const clones = source.map((node) => {
        const id = newId(node.shape);
        ids.set(node.id, id);
        return { ...node, id, x: node.x + offset, y: node.y + offset };
      });
      const cloneEdges = sourceEdges
        .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
        .map((edge) => ({ ...edge, id: newId("e"), from: ids.get(edge.from) ?? edge.from, to: ids.get(edge.to) ?? edge.to }));
      commit([...nodes, ...clones], cloneEdges.length ? [...edges, ...cloneEdges] : null);
      select(clones.map((node) => node.id));
    },
    [nodes, edges, commit, select],
  );

  const selectedNodes = useCallback(() => nodes.filter((node) => selection.includes(node.id)), [nodes, selection]);

  const duplicateSelection = useCallback(() => {
    const chosen = selectedNodes();
    if (chosen.length) cloneNodes(chosen, edges, 30);
  }, [selectedNodes, cloneNodes, edges]);

  const copySelection = useCallback(() => {
    const chosen = selectedNodes();
    if (chosen.length) clipboard = { nodes: chosen, edges: edges.filter((e) => chosen.some((n) => n.id === e.from) && chosen.some((n) => n.id === e.to)), pastes: 0 };
  }, [selectedNodes, edges]);

  const pasteClipboard = useCallback(() => {
    if (!clipboard) return;
    clipboard.pastes += 1;
    cloneNodes(clipboard.nodes, clipboard.edges, 30 * clipboard.pastes);
  }, [cloneNodes]);

  const updateNode = useCallback(
    (id: string, patch: Partial<ArchitectureNode>, mergeKey?: string) => {
      commit(
        nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
        null,
        mergeKey,
      );
    },
    [nodes, commit],
  );

  const renameNode = useCallback(
    (id: string, title: string) => {
      setEditingId(null);
      const clean = title.trim();
      const current = nodesById.get(id);
      if (!clean || !current || clean === current.title) return;
      updateNode(id, { title: clean });
    },
    [nodesById, updateNode],
  );

  const stopEditing = useCallback(() => setEditingId(null), []);

  const clearStack = useCallback(() => {
    if (!selectedNode) return;
    updateNode(selectedNode.id, { tech: "", version: "", port: 0 });
  }, [selectedNode, updateNode]);

  const applyPreset = useCallback(
    (preset: TechStackPreset) => {
      if (!selectedNode) return;
      updateNode(selectedNode.id, {
        tech: preset.name,
        version: preset.version,
        port: preset.port,
        description: preset.description,
        baseLatencyMs: preset.baseLatencyMs,
        maxRpsCapacity: preset.maxRpsCapacity,
        envVars: preset.envVars,
        status: "Optimisé",
      });
    },
    [selectedNode, updateNode],
  );

  const createEdge = useCallback(
    (fromId: string, toId: string) => {
      const from = nodesById.get(fromId);
      const to = nodesById.get(toId);
      if (!from || !to || fromId === toId) return;
      if (edges.some((edge) => edge.from === fromId && edge.to === toId)) return;
      const edge: ArchitectureEdge = {
        id: newId("e"),
        from: fromId,
        to: toId,
        protocol: guessProtocol(from, to),
        throughput: "",
      };
      commit(null, [...edges, edge]);
      setSelection([]);
      setSelectedEdgeId(edge.id);
    },
    [nodesById, edges, commit],
  );

  const setProtocol = (protocol: ArchitectureEdge["protocol"]) => {
    if (!selectedEdgeId) return;
    commit(null, edges.map((edge) => (edge.id === selectedEdgeId ? { ...edge, protocol } : edge)), `edge:${selectedEdgeId}`);
  };

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (selection.length === 0) return;
      commit(
        nodes.map((node) => (selection.includes(node.id) ? { ...node, x: node.x + dx, y: node.y + dy } : node)),
        null,
        "nudge",
      );
    },
    [selection, nodes, commit],
  );

  const fitContent = useCallback(() => fit(contentBounds(), true, DOCK_INSET), [fit, contentBounds]);

  const nodeAt = useCallback(
    (point: Point, excludeId: string | null): string | null => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (!node || node.id === excludeId) continue;
        const rect = rects.get(node.id);
        if (rect && pointInRect(point, rect, 8)) return node.id;
      }
      return null;
    },
    [nodes, rects],
  );

  /* ----------------------------------- Pointeur ----------------------------------- */

  const localPoint = (event: React.PointerEvent | React.DragEvent): Point => {
    const box = containerRef.current?.getBoundingClientRect();
    return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
  };

  const beginPinch = () => {
    const [a, b] = Array.from(pointers.current.values());
    if (!a || !b) return;
    dragRef.current = null;
    setDraft(null);
    setMarquee(null);
    setPreview(null);
    pinchRef.current = {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    if (target.closest("input, textarea, select")) return;
    containerRef.current?.focus({ preventScroll: true });
    cancelAnimation();

    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      beginPinch();
      return;
    }
    if (pointers.current.size > 2) return;

    const box = containerRef.current;
    const world = screenToWorld(event.clientX, event.clientY);

    // Déplacer la vue : outil Main, Espace maintenu ou bouton du milieu.
    if (event.button === 1 || (event.button === 0 && (tool === "hand" || spaceRef.current))) {
      event.preventDefault();
      dragRef.current = { kind: "pan", last: { x: event.clientX, y: event.clientY } };
      box?.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;

    const anchorEl = target.closest<HTMLElement>("[data-anchor]");
    const nodeEl = target.closest<HTMLElement>("[data-node-id]");
    const edgeEl = target.closest("[data-edge-id]");
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;

    // Tracer une liaison depuis un point d'ancrage.
    if (anchorEl && nodeEl?.dataset.nodeId) {
      event.preventDefault();
      const fromId = nodeEl.dataset.nodeId;
      const side = anchorEl.dataset.anchor as Side;
      live.current.target = null;
      dragRef.current = { kind: "connect", fromId, side, start: { x: event.clientX, y: event.clientY }, moved: false };
      setPreview({ fromId, side, to: world, targetId: null });
      box?.setPointerCapture(event.pointerId);
      return;
    }

    if (nodeEl?.dataset.nodeId) {
      const id = nodeEl.dataset.nodeId;

      // Mode « Relier » : un clic sur la source, un clic sur la cible.
      if (tool === "connect") {
        if (!armedSourceId) {
          setArmedSourceId(id);
          setPreview({ fromId: id, side: null, to: world, targetId: null });
        } else if (armedSourceId !== id) {
          createEdge(armedSourceId, id);
          setArmedSourceId(null);
          setPreview(null);
        }
        return;
      }

      let toggleOnRelease: string | null = null;
      let next = selection;
      if (additive) {
        if (selection.includes(id)) toggleOnRelease = id;
        else next = [...selection, id];
      } else if (!selection.includes(id)) {
        next = [id];
      } else {
        // Bloc déjà sélectionné : il devient le principal sans casser la sélection multiple.
        next = [...selection.filter((other) => other !== id), id];
      }
      if (next !== selection) select(next);

      const origin = new Map<string, Point>();
      for (const moveId of next) {
        const node = nodesById.get(moveId);
        if (node) origin.set(moveId, { x: node.x, y: node.y });
      }
      dragRef.current = { kind: "nodes", start: { x: event.clientX, y: event.clientY }, origin, moved: false, toggleOnRelease };
      box?.setPointerCapture(event.pointerId);
      return;
    }

    if (edgeEl instanceof Element && edgeEl.getAttribute("data-edge-id")) {
      setSelection([]);
      setSelectedEdgeId(edgeEl.getAttribute("data-edge-id"));
      return;
    }

    // Fond du canevas.
    if (tool === "connect") {
      setArmedSourceId(null);
      setPreview(null);
      return;
    }
    const base = additive ? selection : [];
    if (!additive) {
      setSelection([]);
      setSelectedEdgeId(null);
    }
    const local = localPoint(event);
    dragRef.current = { kind: "marquee", start: local, base, additive, hits: [] };
    setMarquee({ x1: local.x, y1: local.y, x2: local.x, y2: local.y });
    box?.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    // Pincement à deux doigts : zoom et déplacement.
    if (pinchRef.current && pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const box = containerRef.current?.getBoundingClientRect();
      if (a && b && box) {
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const previous = pinchRef.current;
        if (previous.distance > 0 && distance > 0) {
          zoomAt(distance / previous.distance, center.x - box.left, center.y - box.top);
        }
        panBy(center.x - previous.center.x, center.y - previous.center.y);
        pinchRef.current = { distance, center };
      }
      return;
    }

    const drag = dragRef.current;

    if (!drag) {
      // Mode « Relier » armé : le tracé suit le pointeur.
      if (armedSourceId) {
        const world = screenToWorld(event.clientX, event.clientY);
        setPreview({ fromId: armedSourceId, side: null, to: world, targetId: nodeAt(world, armedSourceId) });
      }
      return;
    }

    const zoom = viewRef.current.zoom;

    if (drag.kind === "pan") {
      panBy(event.clientX - drag.last.x, event.clientY - drag.last.y);
      drag.last = { x: event.clientX, y: event.clientY };
      return;
    }

    if (drag.kind === "nodes") {
      const sx = event.clientX - drag.start.x;
      const sy = event.clientY - drag.start.y;
      if (!drag.moved && Math.hypot(sx, sy) < 4) return;
      drag.moved = true;

      const movingRects = Array.from(drag.origin.keys())
        .map((id) => nodesById.get(id))
        .filter((node): node is ArchitectureNode => Boolean(node))
        .map((node) => nodeRect(node));
      const box = unionRects(movingRects);
      if (!box) return;

      const others = nodes.filter((node) => !drag.origin.has(node.id)).map((node) => nodeRect(node));
      const rawDx = sx / zoom;
      const rawDy = sy / zoom;
      const snapped = magnet
        ? snapDrag(box, rawDx, rawDy, others, zoom)
        : { dx: Math.round(rawDx), dy: Math.round(rawDy), guides: [] as Guide[] };
      const next = { dx: snapped.dx, dy: snapped.dy, guides: snapped.guides };
      live.current.draft = next;
      setDraft(next);
      return;
    }

    if (drag.kind === "marquee") {
      const local = localPoint(event);
      setMarquee({ x1: drag.start.x, y1: drag.start.y, x2: local.x, y2: local.y });
      const bounds = containerRef.current?.getBoundingClientRect();
      const a = screenToWorld(drag.start.x + (bounds?.left ?? 0), drag.start.y + (bounds?.top ?? 0));
      const b = screenToWorld(event.clientX, event.clientY);
      const area: Rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
      const hits = nodes.filter((node) => rectsIntersect(nodeRect(node), area)).map((node) => node.id);
      drag.hits = hits;
      setSelection(drag.additive ? [...drag.base, ...hits.filter((id) => !drag.base.includes(id))] : hits);
      return;
    }

    if (drag.kind === "connect") {
      if (!drag.moved && Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) > 4) drag.moved = true;
      const world = screenToWorld(event.clientX, event.clientY);
      const target = nodeAt(world, drag.fromId);
      live.current.target = target;
      setPreview({ fromId: drag.fromId, side: drag.side, to: world, targetId: target });
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (containerRef.current?.hasPointerCapture(event.pointerId)) containerRef.current.releasePointerCapture(event.pointerId);

    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    if (drag.kind === "nodes") {
      const latest = live.current.draft;
      live.current.draft = null;
      if (drag.moved && latest && !cancelled) {
        commit(
          nodes.map((node) => {
            const origin = drag.origin.get(node.id);
            return origin ? { ...node, x: Math.round(origin.x + latest.dx), y: Math.round(origin.y + latest.dy) } : node;
          }),
          null,
        );
      } else if (!drag.moved && drag.toggleOnRelease) {
        select(selection.filter((id) => id !== drag.toggleOnRelease));
      }
      setDraft(null);
      return;
    }

    if (drag.kind === "marquee") {
      setMarquee(null);
      const last = drag.hits[drag.hits.length - 1];
      if (last) onSelectNode(last);
      return;
    }

    if (drag.kind === "connect") {
      const target = live.current.target;
      live.current.target = null;
      setPreview(null);
      if (cancelled) return;
      if (target) {
        createEdge(drag.fromId, target);
      } else if (!drag.moved) {
        // Simple clic sur un point d'ancrage : la liaison s'arme, un clic sur la cible la termine.
        setTool("connect");
        setArmedSourceId(drag.fromId);
      }
    }
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    // La capture du pointeur redirige l'événement vers le conteneur : on cherche l'élément sous le curseur.
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const nodeEl = under?.closest<HTMLElement>("[data-node-id]");
    if (nodeEl?.dataset.nodeId && !under?.closest("[data-anchor]")) {
      setEditingId(nodeEl.dataset.nodeId);
    }
  };

  /* ----------------------------- Glisser-déposer ----------------------------- */

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (Array.from(event.dataTransfer.types).includes(STENCIL_DRAG_TYPE)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const label = event.dataTransfer.getData(STENCIL_DRAG_TYPE);
    const item = STENCIL_ITEMS.find((candidate) => candidate.label === label);
    if (!item) return;
    event.preventDefault();
    addNode(item, screenToWorld(event.clientX, event.clientY));
  };

  /* ----------------------------------- Clavier ----------------------------------- */

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest("input, textarea, select")) return;
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (event.key === " ") {
      event.preventDefault();
      if (!spaceRef.current) {
        spaceRef.current = true;
        setSpaceHeld(true);
      }
      return;
    }
    if (mod && key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && key === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (mod && key === "a") {
      event.preventDefault();
      select(nodes.map((node) => node.id));
      return;
    }
    if (mod && key === "d") {
      event.preventDefault();
      duplicateSelection();
      return;
    }
    if (mod && key === "c") {
      copySelection();
      return;
    }
    if (mod && key === "v") {
      event.preventDefault();
      pasteClipboard();
      return;
    }
    if (mod && event.shiftKey && key === "h") {
      event.preventDefault();
      fitContent();
      return;
    }
    if (mod && event.code === "Digit0") {
      event.preventDefault();
      zoomTo(1);
      return;
    }
    if (mod) return;

    if (event.shiftKey && event.code === "Digit1") {
      event.preventDefault();
      fitContent();
      return;
    }
    switch (event.key) {
      case "Delete":
      case "Backspace":
        event.preventDefault();
        deleteSelection();
        return;
      case "Escape":
        // Un geste en cours est abandonné (le bloc revient où il était) ; sinon on désélectionne.
        if (dragRef.current) {
          dragRef.current = null;
          live.current = { draft: null, target: null };
          setDraft(null);
          setMarquee(null);
          setPreview(null);
          return;
        }
        setSelection([]);
        setSelectedEdgeId(null);
        setArmedSourceId(null);
        setPreview(null);
        setEditingId(null);
        if (tool === "connect") setTool("select");
        return;
      case "ArrowLeft":
        event.preventDefault();
        nudge(event.shiftKey ? -1 : -GRID, 0);
        return;
      case "ArrowRight":
        event.preventDefault();
        nudge(event.shiftKey ? 1 : GRID, 0);
        return;
      case "ArrowUp":
        event.preventDefault();
        nudge(0, event.shiftKey ? -1 : -GRID);
        return;
      case "ArrowDown":
        event.preventDefault();
        nudge(0, event.shiftKey ? 1 : GRID);
        return;
      case "+":
      case "=":
        zoomStep(1);
        return;
      case "-":
        zoomStep(-1);
        return;
      case "Enter":
        if (selection.length === 1 && selection[0]) setEditingId(selection[0]);
        return;
    }
    if (key === "v") setTool("select");
    else if (key === "h") setTool("hand");
    else if (key === "c") {
      setTool("connect");
      setArmedSourceId(null);
    }
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " ") {
      spaceRef.current = false;
      setSpaceHeld(false);
    }
  };

  /* ------------------------------------ Rendu ------------------------------------ */

  const previewLine: ConnectPreview | null = useMemo(() => {
    if (!preview) return null;
    const rect = rects.get(preview.fromId);
    if (!rect) return null;
    const side = preview.side ?? sideToward(rect, preview.to);
    return { from: anchorPoint(rect, side), to: preview.to };
  }, [preview, rects]);

  const rectList = useMemo(() => Array.from(rects.values()), [rects]);
  const { canUndo, canRedo } = historyState;
  const panCursor = tool === "hand" || spaceHeld;
  const hasSelection = selection.length > 0 || selectedEdgeId !== null;

  return (
    <div className="relative flex h-full min-h-[28rem] w-full flex-col overflow-hidden rounded-xl border border-edge bg-board">
      {/* Barre d'outils : une seule ligne, défilement horizontal si l'écran est étroit */}
      <div className="z-20 flex flex-shrink-0 items-center gap-3 overflow-x-auto border-b border-edge bg-surface px-2.5 py-2">
        <div role="group" aria-label="Outils" className="flex items-center gap-0.5 rounded-lg bg-subtle p-0.5">
          <ToolbarButton label="Sélection" shortcut="V" active={tool === "select"} onClick={() => { setTool("select"); setArmedSourceId(null); setPreview(null); }} showLabel>
            <Cursor size={15} weight="bold" />
          </ToolbarButton>
          <ToolbarButton label="Main" shortcut="H, ou Espace" active={tool === "hand"} onClick={() => { setTool("hand"); setArmedSourceId(null); setPreview(null); }} showLabel>
            <Hand size={15} weight="bold" />
          </ToolbarButton>
          <ToolbarButton label="Relier" shortcut="C" active={tool === "connect"} onClick={() => { setTool("connect"); setArmedSourceId(null); }} showLabel>
            <ShareNetwork size={15} weight="bold" />
          </ToolbarButton>
        </div>

        <div role="group" aria-label="Historique" className="flex items-center gap-0.5">
          <ToolbarButton label="Annuler" shortcut="Ctrl+Z" disabled={!canUndo} onClick={undo}>
            <ArrowCounterClockwise size={16} />
          </ToolbarButton>
          <ToolbarButton label="Rétablir" shortcut="Ctrl+Y" disabled={!canRedo} onClick={redo}>
            <ArrowClockwise size={16} />
          </ToolbarButton>
        </div>

        <div role="group" aria-label="Sélection" className="flex items-center gap-1">
          {selectedEdge ? (
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <span className="hidden sm:inline">Protocole</span>
              <select
                value={selectedEdge.protocol}
                onChange={(event) => setProtocol(event.target.value as ArchitectureEdge["protocol"])}
                className="h-8 rounded-md border border-edge bg-sunken px-2 font-mono text-xs text-ink outline-none focus:border-accent"
              >
                {PROTOCOLS.map((protocol) => (
                  <option key={protocol} value={protocol}>
                    {protocol}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <ToolbarButton label="Dupliquer" shortcut="Ctrl+D" disabled={selection.length === 0} onClick={duplicateSelection} showLabel>
              <Copy size={15} />
            </ToolbarButton>
          )}
          <ToolbarButton
            label="Supprimer"
            shortcut="Suppr"
            disabled={!hasSelection}
            onClick={deleteSelection}
            showLabel
            className="hover:text-danger"
          >
            <Trash size={15} />
          </ToolbarButton>
          {selection.length > 1 && <span className="px-1 font-mono text-xs text-ink-3">{selection.length} blocs</span>}
        </div>

        <div className="ml-auto flex flex-shrink-0 items-center gap-2">
          <div role="group" aria-label="Zoom" className="flex items-center gap-0.5 rounded-lg bg-subtle p-0.5">
            <ToolbarButton label="Dézoomer" shortcut="-" onClick={() => zoomStep(-1)}>
              <Minus size={14} weight="bold" />
            </ToolbarButton>
            <button
              type="button"
              onClick={() => zoomTo(1)}
              title="Revenir à 100 % (Ctrl+0)"
              className="h-8 min-w-[3.25rem] rounded-md px-1.5 font-mono text-xs font-medium text-ink-2 transition-colors hover:bg-surface hover:text-ink"
            >
              {Math.round(view.zoom * 100)} %
            </button>
            <ToolbarButton label="Zoomer" shortcut="+" onClick={() => zoomStep(1)}>
              <Plus size={14} weight="bold" />
            </ToolbarButton>
            <ToolbarButton label="Ajuster à l'écran" shortcut="Maj+1" onClick={fitContent}>
              <CornersOut size={15} />
            </ToolbarButton>
          </div>

          <div role="group" aria-label="Affichage" className="flex items-center gap-0.5 rounded-lg bg-subtle p-0.5">
            <ToolbarButton label={magnet ? "Aimantation activée" : "Aimantation désactivée"} active={magnet} onClick={() => setMagnet((v) => !v)}>
              <Magnet size={15} />
            </ToolbarButton>
            <ToolbarButton
              label={`Fond : ${GRID_LABEL[gridType]}`}
              onClick={() => setGridType((g) => (g === "dots" ? "lines" : g === "lines" ? "blank" : "dots"))}
            >
              {gridType === "dots" ? <DotsNine size={15} /> : gridType === "lines" ? <GridFour size={15} /> : <Square size={15} />}
            </ToolbarButton>
            <ToolbarButton label="Vue d'ensemble" active={showMinimap} onClick={() => setShowMinimap((v) => !v)} className="hidden md:flex">
              <MapTrifold size={15} />
            </ToolbarButton>
          </div>
        </div>
      </div>

      {/* Surface du canevas */}
      <div
        ref={containerRef}
        tabIndex={0}
        role="application"
        aria-label="Tableau blanc d'architecture"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => endPointer(event, false)}
        onPointerCancel={(event) => endPointer(event, true)}
        onDoubleClick={handleDoubleClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={() => {
          spaceRef.current = false;
          setSpaceHeld(false);
        }}
        className={cn(
          "relative min-h-0 flex-1 touch-none select-none overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent",
          panCursor ? "cursor-grab active:cursor-grabbing" : tool === "connect" ? "cursor-crosshair" : "cursor-default",
        )}
        style={{ backgroundImage: GRID_IMAGE[gridType] }}
      >
        <div ref={layerRef} className="absolute left-0 top-0 h-0 w-0 origin-top-left will-change-transform">
          <EdgesLayer edges={edges} rects={rects} selectedEdgeId={selectedEdgeId} guides={draft?.guides ?? NO_GUIDES} preview={previewLine} />

          {nodes.map((node) => {
            const rect = rects.get(node.id);
            const selected = selection.includes(node.id);
            return (
              <NodeView
                key={node.id}
                node={node}
                x={rect?.x ?? node.x}
                y={rect?.y ?? node.y}
                selected={selected}
                solo={selected && solo && !draft}
                dropTarget={preview?.targetId === node.id}
                armed={armedSourceId === node.id}
                editing={editingId === node.id}
                onRename={renameNode}
                onStopEditing={stopEditing}
              />
            );
          })}
        </div>

        {marquee && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border border-dashed border-accent"
            style={{
              left: Math.min(marquee.x1, marquee.x2),
              top: Math.min(marquee.y1, marquee.y2),
              width: Math.abs(marquee.x2 - marquee.x1),
              height: Math.abs(marquee.y2 - marquee.y1),
            }}
          />
        )}

        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 pb-40">
            <div className="max-w-sm rounded-xl border border-dashed border-edge-strong bg-surface p-6 text-center">
              <h3 className="text-base font-semibold text-ink">Le canevas est vide</h3>
              <p className="mt-1 text-sm text-ink-3">
                Ajoutez un composant depuis la boîte à outils, en cliquant ou en le glissant ici.
              </p>
            </div>
          </div>
        )}

        {showMinimap && nodes.length > 0 && (
          <div className="absolute right-3 top-3 z-10 hidden md:block" onPointerDown={(event) => event.stopPropagation()}>
            <Minimap
              rects={rectList}
              view={view}
              size={size}
              onNavigate={(center) =>
                animateTo({ zoom: view.zoom, x: size.w / 2 - center.x * view.zoom, y: size.h / 2 - center.y * view.zoom }, 160)
              }
            />
          </div>
        )}

        <span className="sr-only" aria-live="polite">
          {selection.length === 0 ? "Aucun bloc sélectionné" : `${selection.length} bloc${selection.length > 1 ? "s" : ""} sélectionné${selection.length > 1 ? "s" : ""}`}
        </span>
      </div>

      <Dock
        selectedNode={selectedNode}
        onAdd={(item) => addNode(item)}
        onUpdateNode={updateNode}
        onClearStack={clearStack}
        onApplyPreset={applyPreset}
      />
    </div>
  );
}
