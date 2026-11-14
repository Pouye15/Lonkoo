/**
 * Appels de l'API de l'agent IA (docs/openapi.yaml, tag « IA »). Mode API seulement : en mode démonstration,
 * l'onglet « Analyse IA » montre ses remarques d'exemple, étiquetées comme telles.
 *
 * Les règles et la lecture des réponses sont dans `ai.ts` (module pur, testé) ; ici, uniquement le réseau.
 */

import { apiFetch } from "./api";
import {
  asAuditResult,
  asChatResult,
  asProposal,
  type AiAuditResult,
  type AiCanvasSnapshot,
  type AiChatMessage,
  type AiChatResult,
  type AiProposal,
} from "./ai";

/** Audit consultatif de l'état courant du canvas (membre du projet ; un appel compte dans le quota). */
export async function auditCanvas(canvasId: string, signal?: AbortSignal): Promise<AiAuditResult> {
  return asAuditResult(await apiFetch<unknown>(`/api/canvases/${canvasId}/ai/audit`, { method: "POST", signal }));
}

/**
 * Demande une correction : la proposition est un instantané complet, que le serveur n'écrit jamais.
 *
 * @param nodeIds les blocs visés (50 au plus) ; vide, tout le canvas
 */
export async function completeCanvas(
  canvasId: string,
  body: { nodeIds?: string[]; instruction?: string },
  signal?: AbortSignal,
): Promise<AiProposal> {
  return asProposal(await apiFetch<unknown>(`/api/canvases/${canvasId}/ai/complete`, { method: "POST", body, signal }));
}

/** Esquisse une architecture depuis un cahier des charges (8000 caractères au plus côté serveur). */
export async function sketchCanvas(canvasId: string, brief: string, signal?: AbortSignal): Promise<AiProposal> {
  return asProposal(await apiFetch<unknown>(`/api/canvases/${canvasId}/ai/sketch`, { method: "POST", body: { brief }, signal }));
}

/**
 * L'instantané courant du canvas : le point de comparaison d'une proposition. Lu **avant** l'appel à l'agent,
 * pour qu'un échec de lecture ne consomme pas d'appel payant.
 */
export function canvasSnapshot(canvasId: string, signal?: AbortSignal): Promise<AiCanvasSnapshot> {
  return apiFetch<AiCanvasSnapshot>(`/api/canvases/${canvasId}/snapshot`, { signal });
}

/**
 * Enregistre une version nommée du canvas. Sert de version de retour avant d'appliquer une proposition de
 * l'IA : sans elle, rien n'est écrit dans le canvas partagé.
 */
export function saveVersion(canvasId: string, name: string, message: string): Promise<unknown> {
  return apiFetch<unknown>(`/api/canvases/${canvasId}/versions`, { method: "POST", body: { name, message } });
}

const chatPath = (canvasId: string | null, stream: boolean) =>
  `${canvasId ? `/api/canvases/${canvasId}/ai` : "/api/ai"}/chat${stream ? "/stream" : ""}`;

/** Réponse complète du chatbot. Sans canvas, le conseiller général (`/api/ai/chat`). */
export async function chat(canvasId: string | null, messages: AiChatMessage[], signal?: AbortSignal): Promise<AiChatResult> {
  return asChatResult(await apiFetch<unknown>(chatPath(canvasId, false), { method: "POST", body: { messages }, signal }));
}

/**
 * Ouvre le flux SSE du chatbot. Rend `null` si le flux n'est pas exploitable (serveur injoignable, erreur
 * HTTP, corps absent) : l'appelant repasse par {@link chat}, qui lève l'erreur exacte de l'API et permet
 * d'afficher un message honnête plutôt que d'inventer une réponse.
 */
export async function openChatStream(
  canvasId: string | null,
  messages: AiChatMessage[],
  signal?: AbortSignal,
): Promise<ReadableStreamDefaultReader<Uint8Array> | null> {
  let response: Response;
  try {
    response = await fetch(chatPath(canvasId, true), {
      method: "POST",
      signal,
      cache: "no-store",
      headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    return null;
  }
  if (!response.ok || !response.body) return null;
  return response.body.getReader();
}
