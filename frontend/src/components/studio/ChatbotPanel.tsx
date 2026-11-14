"use client";

import React, { useState, useRef, useEffect } from "react";
import { ArrowClockwise, PaperPlaneRight, Robot, Sparkle, User, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { aiErrorMessage, type AiChatMessage } from "@/lib/ai";
import { chat } from "@/lib/ai-api";

/**
 * Onglet « Conseiller IA » : un échange avec l'assistant d'architecture (`POST /ai/chat`). Consultatif, rien
 * n'est écrit dans le canvas.
 *
 * Quand l'appel échoue, le panneau le dit (code HTTP traduit par `aiErrorMessage`) et propose de réessayer :
 * il n'invente jamais une réponse à la place de l'assistant.
 *
 * La réponse du modèle est une donnée non fiable : elle est affichée en texte brut, et aucune adresse qu'elle
 * contiendrait n'est rendue cliquable.
 */

interface Message extends AiChatMessage {
  /** Message d'erreur affiché à la place d'une réponse (jamais envoyé à l'assistant). */
  failed?: boolean;
  /** La réponse vient de l'agent de démonstration du serveur, pas d'un agent. */
  demo?: boolean;
}

interface ChatbotPanelProps {
  canvasId?: string | null;
  live?: boolean;
  projectName?: string;
  nodesCount?: number;
}

const DEFAULT_SUGGESTIONS = [
  "Quels points uniques de défaillance vois-tu dans cette architecture ?",
  "Comment isoler la base de données du trafic venant des utilisateurs ?",
  "Quelles entités et quels endpoints manquent pour générer le projet ?",
  "Comment découper ce service en plusieurs services cohérents ?",
];

export function ChatbotPanel({ canvasId, live, projectName, nodesCount = 0 }: ChatbotPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestedActions, setSuggestedActions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim();
    if (!text || loading || !live) return;

    // L'historique envoyé ne contient que de vrais échanges : les messages d'erreur en sont exclus.
    const history: AiChatMessage[] = [
      ...messages.filter((message) => !message.failed).map(({ role, content }) => ({ role, content })),
      { role: "user", content: text },
    ];
    setMessages((previous) => [...previous, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const result = await chat(canvasId ?? null, history);
      setMessages((previous) => [
        ...previous,
        { role: "assistant", content: result.reply || "L'assistant n'a rien répondu.", demo: result.demo },
      ]);
      if (result.suggestedActions.length > 0) setSuggestedActions(result.suggestedActions);
    } catch (error) {
      setMessages((previous) => [...previous, { role: "assistant", content: aiErrorMessage(error), failed: true }]);
    } finally {
      setLoading(false);
    }
  };

  /** Rejoue la dernière question après une erreur. */
  const retry = () => {
    const lastQuestion = [...messages].reverse().find((message) => message.role === "user");
    if (!lastQuestion) return;
    setMessages((previous) => previous.filter((message) => !message.failed));
    void send(lastQuestion.content);
  };

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[30rem] w-full flex-col overflow-hidden rounded-2xl border border-edge bg-surface">
      <div className="flex items-center justify-between border-b border-edge bg-subtle px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sunken text-accent">
            <Sparkle size={18} weight="fill" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-ink">Conseiller d&apos;architecture</h2>
            <p className="text-xs text-ink-3">
              Questions de topologie, de résilience et de stack. Les réponses sont consultatives : le canvas n&apos;est jamais
              modifié.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {!live && (
          <p role="note" className="rounded-xl border border-edge-strong bg-sunken px-4 py-3 text-sm text-ink-2">
            Démonstration : l&apos;assistant d&apos;architecture n&apos;est pas joignable dans ce mode. Aucune réponse n&apos;est
            simulée ici.
          </p>
        )}

        {live && messages.length === 0 && (
          <p className="rounded-xl bg-sunken px-4 py-3 text-sm text-ink-2">
            Posez une question sur {projectName ? `« ${projectName} »` : "votre architecture"}
            {nodesCount > 0 ? ` (${nodesCount} bloc${nodesCount > 1 ? "s" : ""})` : ""} : l&apos;assistant lit l&apos;état
            courant du canvas pour répondre.
          </p>
        )}

        {messages.map((message, index) => {
          const isUser = message.role === "user";
          return (
            <div key={index} className={cn("flex max-w-3xl gap-3", isUser ? "ml-auto flex-row-reverse" : "mr-auto")}>
              <div
                className={cn(
                  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                  isUser ? "bg-brand text-white" : "border border-edge bg-sunken text-ink-2",
                )}
              >
                {isUser ? <User size={16} /> : message.failed ? <WarningCircle size={16} weight="fill" /> : <Robot size={16} weight="fill" />}
              </div>
              <div
                className={cn(
                  "rounded-2xl px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap",
                  isUser
                    ? "rounded-tr-none bg-brand text-white"
                    : message.failed
                      ? "rounded-tl-none border border-danger bg-surface text-ink"
                      : "rounded-tl-none border border-edge bg-sunken text-ink",
                )}
              >
                {message.demo && (
                  <span className="mb-1 block text-[11px] font-semibold text-ink-3">Réponse de démonstration</span>
                )}
                {message.content}
                {message.failed && (
                  <div className="mt-2 border-t border-edge-soft pt-2">
                    <Button variant="secondary" size="sm" onClick={retry} disabled={loading}>
                      <ArrowClockwise size={14} />
                      Réessayer
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="mr-auto flex max-w-3xl items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-edge bg-sunken text-ink-2">
              <Robot size={16} weight="fill" />
            </div>
            <div className="rounded-2xl rounded-tl-none border border-edge bg-sunken px-4 py-3 text-sm text-ink-3">
              L&apos;assistant rédige sa réponse…
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {live && suggestedActions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-edge bg-surface px-4 py-2">
          <span className="mr-1 text-[11px] font-medium text-ink-3">Suggestions :</span>
          {suggestedActions.map((suggestion, i) => (
            <button
              key={i}
              type="button"
              onClick={() => void send(suggestion)}
              disabled={loading}
              className="rounded-full border border-edge bg-subtle px-2.5 py-1 text-left text-xs text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="flex items-center gap-2 border-t border-edge bg-surface p-3 sm:p-4"
      >
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={live ? "Posez une question sur votre architecture…" : "Indisponible en mode démonstration"}
          disabled={loading || !live}
          maxLength={8000}
          className="flex-1 rounded-xl border border-edge bg-sunken px-4 py-2.5 text-sm text-ink transition-colors placeholder:text-ink-4 focus:border-accent focus:outline-none disabled:opacity-60"
        />
        <Button type="submit" disabled={!input.trim() || loading || !live} className="flex-shrink-0 rounded-xl px-4 py-2.5">
          <PaperPlaneRight size={16} weight="fill" />
          <span className="hidden sm:inline">Envoyer</span>
        </Button>
      </form>
    </div>
  );
}
