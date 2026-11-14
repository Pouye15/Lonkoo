"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  PaperPlaneRight,
  Sparkle,
  Trash,
  ArrowClockwise,
  ArrowsOutSimple,
  ArrowsInSimple,
  Robot,
  User,
  WarningCircle,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/lib/workspace";
import { IS_LIVE_API } from "@/lib/api";
import { aiErrorMessage, takeChatEvents, type AiChatMessage } from "@/lib/ai";
import { chat, openChatStream } from "@/lib/ai-api";

/**
 * Bulle de discussion avec le conseiller d'architecture, présente dans tout l'espace connecté.
 *
 * Le flux SSE est lu par tampon (`takeChatEvents`) : un événement coupé entre deux lectures du réseau est
 * complété par la suivante, et un fragment incomplet n'est jamais affiché. Quand l'assistant est injoignable,
 * la bulle affiche l'erreur réelle et propose de réessayer : elle n'invente jamais de réponse.
 *
 * La réponse du modèle est une donnée non fiable : elle est affichée en texte brut, et aucune adresse qu'elle
 * contiendrait n'est rendue cliquable.
 */

interface Message extends AiChatMessage {
  id: string;
  /** La réponse est en cours de réception (curseur clignotant). */
  streaming?: boolean;
  /** Message d'erreur affiché à la place d'une réponse (jamais renvoyé à l'assistant). */
  failed?: boolean;
  /** Réponse de l'agent de démonstration du serveur, pas d'un agent. */
  demo?: boolean;
}

const SUGGESTIONS = [
  "Quels points uniques de défaillance vois-tu dans mon architecture ?",
  "Comment isoler la base de données du trafic des utilisateurs ?",
  "Quels blocs manquent pour que le projet soit générable ?",
  "Quelle stack conviendrait à ce service, et pourquoi ?",
];

export function FloatingChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { activeProject } = useWorkspace();

  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestedActions, setSuggestedActions] = useState<string[]>(SUGGESTIONS);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageIdRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [isOpen, messages, loading]);

  const nextId = (prefix: string) => {
    messageIdRef.current += 1;
    return `${prefix}-${messageIdRef.current}`;
  };

  const replace = (id: string, patch: Partial<Message>) => {
    setMessages((previous) => previous.map((message) => (message.id === id ? { ...message, ...patch } : message)));
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim();
    if (!text || loading || !IS_LIVE_API) return;

    // L'historique envoyé ne contient que de vrais échanges : les messages d'erreur en sont exclus.
    const history: AiChatMessage[] = [
      ...messages.filter((message) => !message.failed).map(({ role, content }) => ({ role, content })),
      { role: "user", content: text },
    ];
    const assistantId = nextId("a");
    setMessages((previous) => [
      ...previous,
      { id: nextId("u"), role: "user", content: text },
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setLoading(true);

    const canvasId = activeProject?.canvasId ?? null;
    let streamed = "";
    let failure: string | null = null;

    const reader = await openChatStream(canvasId, history);
    if (reader) {
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      try {
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = takeChatEvents(buffer);
          // Ce qui reste est gardé pour la lecture suivante : un événement coupé n'est pas perdu.
          buffer = rest;
          for (const event of events) {
            if (event.kind === "text") {
              streamed += event.text;
              replace(assistantId, { content: streamed, streaming: true });
            } else if (event.kind === "done") {
              finished = true;
              break;
            } else if (event.kind === "error") {
              failure = event.message;
              finished = true;
              break;
            }
          }
        }
      } catch {
        // Flux interrompu : ce qui a été reçu reste affiché, et le repli ci-dessous prend la suite si rien n'est arrivé.
      }
      try {
        await reader.cancel();
      } catch {
        // Le flux était déjà fermé : rien à faire.
      }
    }

    if (streamed) {
      replace(assistantId, { content: streamed, streaming: false });
      if (failure) setMessages((previous) => [...previous, { id: nextId("e"), role: "assistant", content: failure, failed: true }]);
      setLoading(false);
      return;
    }

    // Aucun contenu reçu en flux : l'appel complet donne la réponse, ou l'erreur exacte de l'API.
    try {
      const result = await chat(canvasId, history);
      replace(assistantId, {
        content: result.reply || "L'assistant n'a rien répondu.",
        streaming: false,
        demo: result.demo,
      });
      if (result.suggestedActions.length > 0) setSuggestedActions(result.suggestedActions);
    } catch (error) {
      replace(assistantId, { content: failure ?? aiErrorMessage(error), streaming: false, failed: true });
    }
    setLoading(false);
  };

  /** Rejoue la dernière question après une erreur. */
  const retry = () => {
    const lastQuestion = [...messages].reverse().find((message) => message.role === "user");
    if (!lastQuestion) return;
    setMessages((previous) => previous.filter((message) => !message.failed));
    void handleSend(lastQuestion.content);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <>
      {/* Bouton d'ouverture, en bas à droite */}
      <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen((previous) => !previous)}
          aria-label={isOpen ? "Fermer le conseiller d'architecture" : "Ouvrir le conseiller d'architecture"}
          className={cn(
            "flex items-center justify-center rounded-full shadow-lg transition-colors",
            isOpen ? "h-12 w-12 border border-edge bg-surface text-ink hover:bg-sunken" : "h-14 w-14 bg-brand text-white hover:bg-brand-hover",
          )}
        >
          {isOpen ? <X size={22} weight="bold" /> : <Sparkle size={26} weight="fill" />}
        </button>
      </div>

      {/* Fenêtre de discussion */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl",
            isExpanded
              ? "bottom-4 right-4 h-[calc(100dvh-5rem)] w-[calc(100vw-2rem)] sm:bottom-6 sm:right-6 sm:w-[620px]"
              : "bottom-20 right-4 h-[600px] max-h-[calc(100dvh-6.5rem)] w-[calc(100vw-2rem)] sm:right-6 sm:w-[460px]",
          )}
        >
          <div className="flex items-center justify-between border-b border-edge bg-sunken px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-subtle text-accent">
                <Robot size={22} weight="fill" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink">Conseiller d&apos;architecture</h3>
                <p className="text-[11px] text-ink-3">Consultatif : rien n&apos;est modifié sans vous</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMessages([])}
                title="Effacer la conversation"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-subtle hover:text-ink"
              >
                <Trash size={16} />
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded((previous) => !previous)}
                title={isExpanded ? "Réduire la fenêtre" : "Agrandir la fenêtre"}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-subtle hover:text-ink"
              >
                {isExpanded ? <ArrowsInSimple size={16} /> : <ArrowsOutSimple size={16} />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Fermer"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-subtle hover:text-ink"
              >
                <X size={16} weight="bold" />
              </button>
            </div>
          </div>

          {/* Historique */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {!IS_LIVE_API && (
              <p role="note" className="rounded-xl border border-edge-strong bg-sunken px-3 py-2.5 text-xs text-ink-2">
                Démonstration : le conseiller n&apos;est pas joignable dans ce mode. Aucune réponse n&apos;est simulée ici.
              </p>
            )}

            {IS_LIVE_API && messages.length === 0 && (
              <p className="rounded-xl bg-sunken px-3 py-2.5 text-xs text-ink-2">
                Posez une question d&apos;architecture : points de défaillance, découpage en services, choix de stack, champs
                manquants pour générer le projet. {activeProject ? `Le projet « ${activeProject.name} » est pris en compte.` : ""}
              </p>
            )}

            {messages.map((message) => (
              <div key={message.id} className={cn("flex gap-2.5", message.role === "user" ? "justify-end" : "justify-start")}>
                {message.role === "assistant" && (
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-edge bg-sunken text-ink-2">
                    {message.failed ? <WarningCircle size={15} weight="fill" /> : <Robot size={15} weight="fill" />}
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed",
                    message.role === "user"
                      ? "rounded-br-xs bg-brand text-white"
                      : message.failed
                        ? "rounded-bl-xs border border-danger bg-surface text-ink"
                        : "rounded-bl-xs border border-edge bg-sunken text-ink",
                  )}
                >
                  {message.demo && <span className="mb-1 block text-[11px] font-semibold text-ink-3">Réponse de démonstration</span>}
                  <span className="whitespace-pre-wrap">{message.content}</span>
                  {message.streaming && <span className="ml-0.5 inline-block h-3.5 w-1.5 align-middle bg-accent" />}
                  {message.failed && (
                    <div className="mt-2 border-t border-edge-soft pt-2">
                      <button
                        type="button"
                        onClick={retry}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-subtle px-2.5 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
                      >
                        <ArrowClockwise size={12} weight="bold" />
                        Réessayer
                      </button>
                    </div>
                  )}
                </div>

                {message.role === "user" && (
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-subtle text-ink-2">
                    <User size={15} weight="bold" />
                  </div>
                )}
              </div>
            ))}

            {loading && !messages.some((message) => message.streaming) && (
              <div className="flex items-center gap-2 text-xs text-ink-3">
                <Sparkle size={15} className="text-accent" />
                <span>Le conseiller rédige sa réponse…</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Questions suggérées */}
          {IS_LIVE_API && suggestedActions.length > 0 && !loading && (
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto border-t border-edge bg-surface px-3 py-2">
              {suggestedActions.map((suggestion, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => void handleSend(suggestion)}
                  className="rounded-lg border border-edge bg-sunken px-2.5 py-1 text-left text-[11px] text-ink-2 transition-colors hover:border-edge-strong hover:text-ink"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {/* Saisie */}
          <div className="border-t border-edge bg-surface p-3">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend();
              }}
              className="flex items-end gap-2"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                maxLength={8000}
                disabled={!IS_LIVE_API}
                placeholder={IS_LIVE_API ? "Posez une question d'architecture…" : "Indisponible en mode démonstration"}
                className="max-h-24 flex-1 resize-none rounded-xl border border-edge bg-sunken px-3 py-2 text-xs text-ink placeholder:text-ink-4 focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading || !IS_LIVE_API}
                aria-label="Envoyer"
                className={cn(
                  "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors",
                  !input.trim() || loading || !IS_LIVE_API ? "cursor-not-allowed bg-subtle text-ink-4" : "bg-brand text-white hover:bg-brand-hover",
                )}
              >
                <PaperPlaneRight size={16} weight="fill" />
              </button>
            </form>
            <p className="mt-1.5 text-[10px] text-ink-4">Maj + Entrée pour un saut de ligne</p>
          </div>
        </div>
      )}
    </>
  );
}
