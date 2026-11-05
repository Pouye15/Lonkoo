"use client";

import { useCallback, useSyncExternalStore } from "react";
import * as Y from "yjs";
import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import { ApiError, apiFetch, isReadOnlyRole, messageOf, type ApiRole, type ApiTicket } from "@/lib/api";
import { LOCAL_ORIGIN, applyEdges, applyNodes, readGraph } from "@/lib/canvas-yjs";
import { CANVAS_TOO_LARGE_MESSAGE, stopsReconnection } from "@/lib/realtime-close";
import type { ArchitectureEdge, ArchitectureNode } from "@/lib/lonkoo-data";

/**
 * Connexion d'un canvas au serveur temps réel (docs/ROADMAP-BACKEND.md, WP6 et WP12).
 *
 * Une connexion par canvas, partagée par tous les composants qui l'utilisent et gardée quelques secondes
 * après le dernier (changement de page sans reconnexion). Le ticket de connexion (JWT, 5 minutes) est
 * redemandé à chaque reconnexion.
 */

export interface Peer {
  id: number;
  name: string;
  color: string;
  /** Position du curseur dans le repère du tableau (pas de l'écran), ou null hors du tableau. */
  cursor: { x: number; y: number } | null;
}

/**
 * - `connecting` : le document n'est pas encore chargé ;
 * - `live` : chargé et connecté ;
 * - `offline` : connexion perdue, reconnexion en cours (les modifications restent dans le navigateur et partent au retour) ;
 * - `denied` : le canvas n'existe pas ou n'est pas visible par cet utilisateur ;
 * - `error` : le ticket n'a pas pu être obtenu ;
 * - `stopped` : le serveur a coupé la connexion parce que le canvas est trop volumineux (code 4413) ; elle n'est pas
 *   rouverte toute seule, et la dernière modification n'a pas été enregistrée (lecture seule jusqu'au rechargement).
 */
export type CanvasStatus = "connecting" | "live" | "offline" | "denied" | "error" | "stopped";

export interface CanvasState {
  status: CanvasStatus;
  /** Premier échange terminé : le document est chargé. */
  synced: boolean;
  role: ApiRole | null;
  readOnly: boolean;
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  peers: Peer[];
  error: string | null;
}

const IDLE: CanvasState = {
  status: "connecting",
  synced: false,
  role: null,
  readOnly: true,
  nodes: [],
  edges: [],
  peers: [],
  error: null,
};

/**
 * Adresse du serveur temps réel, réglable au build : une adresse complète en local (`ws://localhost:1234`),
 * un chemin relatif en production (`/ws`, servi par Caddy sur l'origine du site). Par défaut `/ws`.
 */
function realtimeUrl(): string {
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL || "/ws";
  if (!configured.startsWith("/")) return configured;
  return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${configured}`;
}

const KEEP_ALIVE_MS = 5000;
const CURSOR_INTERVAL_MS = 50;
const RECONNECT_ATTEMPTS = 3;

export class CanvasConnection {
  private readonly doc = new Y.Doc();
  private provider: HocuspocusProvider | null = null;
  private state: CanvasState = IDLE;
  private readonly listeners = new Set<() => void>();
  private refs = 0;
  private destroyTimer: number | undefined;
  private destroyed = false;
  private pendingTicket: ApiTicket | null = null;
  private rebuildQueued = false;
  private lastCursorAt = 0;
  private authFailures = 0;

  constructor(private readonly canvasId: string) {
    void this.start();
  }

  /* ----------------------------- Abonnement React ---------------------------- */

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): CanvasState => this.state;

  private patch(next: Partial<CanvasState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener());
  }

  /* --------------------------------- Cycle de vie ------------------------------- */

  retain() {
    this.refs += 1;
    window.clearTimeout(this.destroyTimer);
  }

  /** Libère une utilisation ; la connexion se ferme quelques secondes après la dernière. */
  release(onClosed: () => void) {
    this.refs -= 1;
    if (this.refs > 0) return;
    this.destroyTimer = window.setTimeout(() => {
      if (this.refs > 0) return;
      this.destroy();
      onClosed();
    }, KEEP_ALIVE_MS);
  }

  private destroy() {
    this.destroyed = true;
    this.provider?.destroy();
    this.doc.destroy();
    this.listeners.clear();
  }

  private fetchTicket(): Promise<ApiTicket> {
    return apiFetch<ApiTicket>(`/api/canvases/${this.canvasId}/realtime-ticket`, { method: "POST" });
  }

  /** Le ticket déjà obtenu s'il vaut encore, un nouveau sinon (reconnexion). */
  private async nextTicket(): Promise<string> {
    const cached = this.pendingTicket;
    this.pendingTicket = null;
    if (cached && new Date(cached.expiresAt).getTime() - Date.now() > 30_000) return cached.ticket;
    try {
      const ticket = await this.fetchTicket();
      this.patch({ role: ticket.role, readOnly: isReadOnlyRole(ticket.role) });
      return ticket.ticket;
    } catch (error) {
      if (!this.destroyed) this.patch({ status: statusOfTicketError(error), error: messageOf(error) });
      return "";
    }
  }

  private async start() {
    let ticket: ApiTicket;
    try {
      ticket = await this.fetchTicket();
    } catch (error) {
      if (!this.destroyed) this.patch({ status: statusOfTicketError(error), error: messageOf(error) });
      return;
    }
    if (this.destroyed) return;
    this.pendingTicket = ticket;
    this.patch({ role: ticket.role, readOnly: isReadOnlyRole(ticket.role) });

    this.doc.on("update", (_update: Uint8Array, origin: unknown) => {
      if (origin !== LOCAL_ORIGIN) this.scheduleRebuild();
    });

    const provider = new HocuspocusProvider({
      url: realtimeUrl(),
      name: this.canvasId,
      document: this.doc,
      token: () => this.nextTicket(),
    });
    this.provider = provider;

    provider.setAwarenessField("user", ticket.user);
    provider.setAwarenessField("cursor", null);

    provider.on("synced", ({ state }: { state: boolean }) => {
      if (!state || this.destroyed) return;
      this.authFailures = 0;
      this.rebuild();
      this.patch({ synced: true, status: "live", error: null });
    });
    provider.on("status", ({ status }: { status: WebSocketStatus }) => {
      if (this.destroyed || !this.state.synced || this.state.status === "stopped") return;
      if (status === WebSocketStatus.Disconnected) this.patch({ status: "offline" });
      else if (status === WebSocketStatus.Connected) this.patch({ status: "live" });
    });
    provider.on("close", ({ event }: { event: { code?: number } }) => {
      if (this.destroyed || !stopsReconnection(event?.code)) return;
      // Le serveur a refusé une modification qui ferait trop grossir le canvas. Rouvrir la connexion renverrait cette
      // modification, restée dans le document du navigateur : on s'arrête, en lecture seule, jusqu'au rechargement.
      provider.disconnect();
      this.patch({ status: "stopped", readOnly: true, error: CANVAS_TOO_LARGE_MESSAGE });
    });
    provider.on("authenticated", ({ scope }: { scope: string }) => {
      // Le serveur fait foi : un client « lecture seule » pour lui l'est aussi dans l'interface.
      if (scope === "readonly") this.patch({ readOnly: true });
    });
    provider.on("authenticationFailed", () => {
      if (this.destroyed) return;
      this.authFailures += 1;
      if (this.authFailures > RECONNECT_ATTEMPTS) {
        this.patch({ status: this.state.synced ? "offline" : "denied", error: "Accès au canvas refusé." });
        return;
      }
      // Un ticket périmé ou un accès retiré : on réessaie avec un ticket neuf avant de conclure.
      window.setTimeout(() => {
        if (this.destroyed) return;
        void provider.connect();
      }, 1500 * this.authFailures);
    });
    provider.awareness?.on("change", () => this.scheduleRebuild());
  }

  /* ----------------------------------- Lecture ---------------------------------- */

  private scheduleRebuild() {
    if (this.rebuildQueued || this.destroyed) return;
    this.rebuildQueued = true;
    queueMicrotask(() => {
      this.rebuildQueued = false;
      if (!this.destroyed && this.state.synced) this.rebuild();
    });
  }

  private rebuild() {
    const graph = readGraph(this.doc, { nodes: this.state.nodes, edges: this.state.edges });
    this.patch({
      nodes: sameItems(graph.nodes, this.state.nodes) ? this.state.nodes : graph.nodes,
      edges: sameItems(graph.edges, this.state.edges) ? this.state.edges : graph.edges,
      peers: this.readPeers(),
    });
  }

  private readPeers(): Peer[] {
    const awareness = this.provider?.awareness;
    if (!awareness) return [];
    const peers: Peer[] = [];
    awareness.getStates().forEach((value: Record<string, unknown>, id: number) => {
      if (id === awareness.clientID) return;
      const user = value.user as { name?: unknown; color?: unknown } | undefined;
      if (!user || typeof user.name !== "string" || typeof user.color !== "string") return;
      const cursor = value.cursor as { x?: unknown; y?: unknown } | null | undefined;
      peers.push({
        id,
        name: user.name,
        color: user.color,
        cursor:
          cursor && typeof cursor.x === "number" && typeof cursor.y === "number" ? { x: cursor.x, y: cursor.y } : null,
      });
    });
    return peers.sort((a, b) => a.id - b.id);
  }

  /* ---------------------------------- Écriture ---------------------------------- */

  /** Écrit les blocs dans le document ; ignoré en lecture seule ou avant le premier échange. */
  setNodes = (next: ArchitectureNode[] | ((previous: ArchitectureNode[]) => ArchitectureNode[])) => {
    if (this.state.readOnly || !this.state.synced) return;
    const value = typeof next === "function" ? next(this.state.nodes) : next;
    applyNodes(this.doc, value);
    // Supprimer un bloc supprime ses liens (dans le document) : l'état local suit.
    const ids = new Set(value.map((node) => node.id));
    const edges = this.state.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
    this.patch({ nodes: value, edges: edges.length === this.state.edges.length ? this.state.edges : edges });
  };

  setEdges = (next: ArchitectureEdge[] | ((previous: ArchitectureEdge[]) => ArchitectureEdge[])) => {
    if (this.state.readOnly || !this.state.synced) return;
    const value = typeof next === "function" ? next(this.state.edges) : next;
    applyEdges(this.doc, value);
    this.patch({ edges: value });
  };

  /** Position du curseur dans le repère du tableau (au plus toutes les 50 ms), null quand il le quitte. */
  setCursor = (point: { x: number; y: number } | null) => {
    const now = performance.now();
    if (point && now - this.lastCursorAt < CURSOR_INTERVAL_MS) return;
    this.lastCursorAt = now;
    this.provider?.setAwarenessField("cursor", point);
  };
}

function statusOfTicketError(error: unknown): CanvasStatus {
  return error instanceof ApiError && (error.status === 403 || error.status === 404) ? "denied" : "error";
}

function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/* ------------------------------------------------------------------ */
/* Registre et hook                                                     */
/* ------------------------------------------------------------------ */

const connections = new Map<string, CanvasConnection>();

function acquire(canvasId: string): CanvasConnection {
  let connection = connections.get(canvasId);
  if (!connection) {
    connection = new CanvasConnection(canvasId);
    connections.set(canvasId, connection);
  }
  connection.retain();
  return connection;
}

function release(canvasId: string, connection: CanvasConnection) {
  connection.release(() => {
    if (connections.get(canvasId) === connection) connections.delete(canvasId);
  });
}

export interface CanvasHandle extends CanvasState {
  setNodes: CanvasConnection["setNodes"];
  setEdges: CanvasConnection["setEdges"];
  setCursor: CanvasConnection["setCursor"];
}

/**
 * L'état du canvas partagé et ses actions ; `canvasId` null tant qu'il n'est pas connu.
 * L'abonnement acquiert la connexion (la crée au besoin) et la libère au démontage.
 */
export function useCanvas(canvasId: string | null): CanvasHandle {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!canvasId) return () => undefined;
      const connection = acquire(canvasId);
      const unsubscribe = connection.subscribe(onChange);
      // L'état a pu changer entre le rendu et l'abonnement.
      onChange();
      return () => {
        unsubscribe();
        release(canvasId, connection);
      };
    },
    [canvasId],
  );
  const getSnapshot = useCallback(
    () => (canvasId ? connections.get(canvasId)?.getSnapshot() : undefined) ?? IDLE,
    [canvasId],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, () => IDLE);

  const setNodes = useCallback<CanvasHandle["setNodes"]>(
    (next) => {
      if (canvasId) connections.get(canvasId)?.setNodes(next);
    },
    [canvasId],
  );
  const setEdges = useCallback<CanvasHandle["setEdges"]>(
    (next) => {
      if (canvasId) connections.get(canvasId)?.setEdges(next);
    },
    [canvasId],
  );
  const setCursor = useCallback<CanvasHandle["setCursor"]>(
    (point) => {
      if (canvasId) connections.get(canvasId)?.setCursor(point);
    },
    [canvasId],
  );

  return { ...state, setNodes, setEdges, setCursor };
}
