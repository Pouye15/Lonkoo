"use client";

import React, { useState, useRef, useEffect } from "react";
import { Sparkle, PaperPlaneRight, ArrowSquareOut, Robot, User } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface Message {
  role: "user" | "assistant";
  content: string;
  /** Écrit par l'interface (accueil, erreur) : jamais renvoyé au serveur comme si l'assistant l'avait dit. */
  local?: boolean;
}

interface ChatbotPanelProps {
  canvasId?: string | null;
  live?: boolean;
  projectName?: string;
  nodesCount?: number;
}

function safeHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

const DEFAULT_SUGGESTIONS = [
  "Comment déployer mon architecture sur le Cloud Systalink ?",
  "Quelle configuration recommandes-tu pour la base de données ?",
  "Comment sécuriser mes API et flux de paiement mobile ?",
  "Quels composants ajouter pour rendre mon architecture plus résiliente ?",
];

export function ChatbotPanel({ canvasId, live, projectName, nodesCount = 0 }: ChatbotPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      local: true,
      content:
        `Bonjour ! Je suis le conseiller d'architecture de LONKOO.\n\n` +
        `Posez-moi vos questions sur le projet « ${projectName || "Architecture"} » (${nodesCount} composants) : conception, résilience, sécurité, déploiement. ` +
        `Pour l'hébergement, vous pouvez aussi consulter les offres de Systalink (https://systalink.com/fr).\n\n` +
        `Je suis une IA : mes réponses peuvent contenir des erreurs, vérifiez-les avant de vous y fier.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestedActions, setSuggestedActions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const showError = (message: string) => {
      setMessages((prev) => [...prev, { role: "assistant", content: message, local: true }]);
      setLoading(false);
    };

    if (!live || !canvasId) {
      showError("Le conseiller IA répond depuis le serveur LONKOO : ouvrez un projet connecté pour l'utiliser.");
      return;
    }

    // Une seule demande : jamais de seconde tentative automatique, chaque appel compte dans le quota du jour.
    try {
      const res = await fetch(`/api/canvases/${canvasId}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.filter((m) => !m.local).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
        if (data.suggestedActions && data.suggestedActions.length > 0) {
          setSuggestedActions(data.suggestedActions);
        }
        setLoading(false);
        return;
      }
      const problem = (await res.json().catch(() => null)) as { detail?: string } | null;
      showError(problem?.detail || `Le conseiller IA n'a pas pu répondre (erreur ${res.status}).`);
    } catch {
      showError("Le serveur ne répond pas : le conseiller IA n'a pas pu répondre. Réessayez dans un instant.");
    }
  };

  const renderContent = (content: string) => {
    // Rend les liens cliquables
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        const safeUrl = safeHttpUrl(part);
        if (!safeUrl) {
          return part;
        }
        return (
          <a
            key={i}
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-accent underline hover:text-accent-hover"
          >
            <span>{safeUrl}</span>
            <ArrowSquareOut size={13} />
          </a>
        );
      }
      return part;
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)] min-h-[30rem] w-full rounded-2xl border border-edge bg-surface shadow-sm overflow-hidden">
      {/* En-tête du Chatbot */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-edge bg-subtle">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Sparkle size={18} weight="fill" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-ink">Conseiller IA d&apos;Architecture</h2>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent font-mono">
                Systalink Cloud
              </span>
            </div>
            <p className="text-xs text-ink-3">
              Conseils de topologie, résilience et hébergement cloud souverain à Dakar
            </p>
          </div>
        </div>
        <a
          href="https://systalink.com/fr"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-accent transition-colors"
        >
          <span>systalink.com</span>
          <ArrowSquareOut size={13} />
        </a>
      </div>

      {/* Corps des messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.map((m, idx) => {
          const isUser = m.role === "user";
          return (
            <div
              key={idx}
              className={cn("flex gap-3 max-w-3xl", isUser ? "ml-auto flex-row-reverse" : "mr-auto")}
            >
              <div
                className={cn(
                  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                  isUser ? "bg-accent text-white" : "bg-sunken text-ink-2 border border-edge"
                )}
              >
                {isUser ? <User size={16} /> : <Robot size={16} weight="fill" />}
              </div>
              <div
                className={cn(
                  "rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words",
                  isUser
                    ? "bg-accent text-white rounded-tr-none shadow-sm"
                    : "bg-sunken text-ink border border-edge rounded-tl-none"
                )}
              >
                {renderContent(m.content)}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex gap-3 max-w-3xl mr-auto items-center">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2 border border-edge">
              <Robot size={16} weight="fill" />
            </div>
            <div className="rounded-2xl rounded-tl-none bg-sunken px-4 py-3 text-sm text-ink-3 border border-edge flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-accent animate-ping" />
              <span>Le conseiller IA réfléchit...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Suggestions rapides */}
      {suggestedActions.length > 0 && (
        <div className="px-4 py-2 border-t border-edge/60 bg-surface flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] text-ink-3 font-medium mr-1">Suggestions :</span>
          {suggestedActions.map((sug, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSend(sug)}
              disabled={loading}
              className="text-xs px-2.5 py-1 rounded-full bg-subtle hover:bg-sunken border border-edge text-ink-2 hover:text-ink transition-colors text-left"
            >
              {sug}
            </button>
          ))}
        </div>
      )}

      {/* Saisie utilisateur */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 sm:p-4 border-t border-edge bg-surface flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Posez une question sur votre architecture, sa résilience ou son hébergement Systalink..."
          disabled={loading}
          className="flex-1 rounded-xl border border-edge bg-sunken px-4 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:border-accent focus:outline-none transition-colors"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={!input.trim() || loading}
          className="flex-shrink-0 rounded-xl px-4 py-2.5"
        >
          <PaperPlaneRight size={16} weight="fill" />
          <span className="hidden sm:inline">Envoyer</span>
        </Button>
      </form>
    </div>
  );
}
