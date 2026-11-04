"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  PaperPlaneRight,
  Sparkle,
  Trash,
  ArrowsOutSimple,
  ArrowsInSimple,
  ArrowSquareOut,
  Robot,
  User,
  CloudCheck,
  Cpu,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/lib/workspace";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  /** Écrit par l'interface (accueil, erreur) : jamais renvoyé au serveur comme si l'assistant l'avait dit. */
  local?: boolean;
}

function safeSystalinkUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" && url.hostname === "systalink.com") {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function hasSystalinkUrl(text: string): boolean {
  return /(^|[\s(])https:\/\/systalink\.com(\/[^\s)]*)?/i.test(text);
}

// Seulement ce que la page https://systalink.com/fr affichait le 04/11/2026 : Orion, Connexion MCP, Yokk, serveur cloud (région Dakar).
const QUICK_PRODUCTS = [
  { label: "Orion (Générateur)", icon: Sparkle, query: "Comment utiliser Orion pour générer mon site sur Systalink ?" },
  { label: "Connexion MCP", icon: Cpu, query: "Comment fonctionne la Connexion MCP pour brancher mes agents IA sur Systalink ?" },
  { label: "Serveur cloud", icon: CloudCheck, query: "Que propose Systalink pour héberger mon application ?" },
  { label: "Yokk", icon: Robot, query: "Qu'est-ce que Yokk chez Systalink ?" },
];

const INITIAL_SUGGESTIONS = [
  "💡 Décrire mon idée d'application et concevoir l'architecture",
  "🚀 Proposer un plan de déploiement sur un serveur cloud",
  "⚡ Auditer la résilience et sécuriser la persistance",
  "🔌 Brancher des agents IA autonomes via Connexion MCP",
  "Demander un devis d'infrastructure (systalink.com/fr)",
];

export function FloatingChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { activeProject } = useWorkspace();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      local: true,
      content:
        `👋 **Bienvenue sur le Conseiller IA de LONKOO !**\n\n` +
        `Je peux vous accompagner à chaque étape :\n` +
        `1. **De l'idée à l'architecture** : décrivez votre projet en français libre, je propose des composants (services, bases, files, passerelles de paiement).\n` +
        `2. **Déploiement** : je peux vous orienter vers les offres de Systalink (https://systalink.com/fr).\n` +
        `3. **IA & automatisation** : Orion, Connexion MCP et Yokk sont des services présentés par Systalink.\n\n` +
        `Je suis une IA : mes réponses peuvent contenir des erreurs, vérifiez-les avant de vous y fier.`,
    },
  ]);

  const [suggestedActions] = useState<string[]>(INITIAL_SUGGESTIONS);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageIdRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [isOpen, messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    messageIdRef.current += 1;
    const userMsgId = `u-${messageIdRef.current}`;
    messageIdRef.current += 1;
    const assistantMsgId = `a-${messageIdRef.current}`;

    const newMessages: Message[] = [
      ...messages,
      { id: userMsgId, role: "user", content: text },
    ];

    setMessages([
      ...newMessages,
      { id: assistantMsgId, role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setLoading(true);

    const history = newMessages.filter((m) => !m.local).map((m) => ({ role: m.role, content: m.content }));
    const canvasId = activeProject?.canvasId;
    const streamEndpoint = canvasId
      ? `/api/canvases/${canvasId}/ai/chat/stream`
      : `/api/ai/chat/stream`;

    // Une seule demande : jamais de seconde tentative automatique, chaque appel compte dans le quota du jour.
    let failure = "Le serveur ne répond pas : le conseiller IA n'a pas pu répondre. Réessayez dans un instant.";
    try {
      const response = await fetch(streamEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          messages: history,
        }),
      });

      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamFailed = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const textChunk = decoder.decode(value, { stream: true });
          const lines = textChunk.split("\n");

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === "[DONE]") {
                break;
              }
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.error) streamFailed = true;
                if (parsed.content) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, content: `${m.content}${parsed.content}`, streaming: true }
                        : m
                    )
                  );
                }
              } catch {
                if (dataStr && !dataStr.startsWith("{")) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, content: `${m.content}${dataStr}`, streaming: true }
                        : m
                    )
                  );
                }
              }
            }
          }
        }

        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantMsgId) return m;
            if (streamFailed && !m.content) {
              return { ...m, content: "Le conseiller IA a rencontré une erreur. Réessayez dans un instant.", streaming: false, local: true };
            }
            return { ...m, content: m.content || "Réponse terminée.", streaming: false };
          })
        );
        setLoading(false);
        return;
      }
      const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
      failure = problem?.detail || `Le conseiller IA n'a pas pu répondre (erreur ${response.status}).`;
    } catch {
      // Réseau coupé : le message par défaut ci-dessus s'affiche.
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMsgId ? { ...m, content: failure, streaming: false, local: true } : m
      )
    );
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const renderContent = (content: string) => {
    const parts = content.split(/(https:\/\/systalink\.com\/[^\s)]+)/g);
    return parts.map((part, i) => {
      const safeUrl = safeSystalinkUrl(part);
      if (safeUrl) {
        return (
          <a
            key={i}
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            {safeUrl}
            <ArrowSquareOut size={12} weight="bold" />
          </a>
        );
      }
      return <span key={i} className="whitespace-pre-wrap">{part}</span>;
    });
  };

  return (
    <>
      {/* BOUTON FLOTTANT D'OUVERTURE EN BAS À DROITE */}
      <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2">
        {!isOpen && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-edge shadow-lg text-xs font-medium text-ink animate-in fade-in duration-300">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Conseiller Systalink & LONKOO</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label={isOpen ? "Fermer le conseiller IA" : "Ouvrir le conseiller IA"}
          className={cn(
            "relative flex items-center justify-center rounded-full text-white shadow-xl transition-all duration-300 hover:scale-105 active:scale-95",
            isOpen
              ? "h-12 w-12 bg-subtle text-ink border border-edge hover:bg-edge"
              : "h-14 w-14 bg-gradient-to-tr from-brand via-accent to-emerald-600 shadow-accent/20"
          )}
        >
          {isOpen ? (
            <X size={22} weight="bold" />
          ) : (
            <>
              <Sparkle size={26} weight="fill" className="animate-in zoom-in duration-300" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-surface" />
              </span>
            </>
          )}
        </button>
      </div>

      {/* FENÊTRE MODALE DE DISCUSSION FLOTTANTE */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 flex flex-col rounded-2xl border border-edge bg-surface shadow-2xl transition-all duration-200 overflow-hidden",
            isExpanded
              ? "bottom-4 right-4 sm:bottom-6 sm:right-6 w-[calc(100vw-2rem)] sm:w-[620px] h-[calc(100dvh-5rem)]"
              : "bottom-20 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[460px] h-[600px] max-h-[calc(100dvh-6.5rem)]"
          )}
        >
          {/* EN-TÊTE DU CHATBOT */}
          <div className="flex items-center justify-between border-b border-edge bg-sunken/60 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand to-accent text-white shadow-sm">
                <Robot size={22} weight="fill" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-emerald-500" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold text-ink">Conseiller Systalink</h3>
                  <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent">
                    Systalink
                  </span>
                </div>
                <p className="text-[11px] text-ink-3">Architecture, Cloud & Déploiement</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setMessages([
                    {
                      id: "welcome-reset",
                      role: "assistant",
                      local: true,
                      content: "Conversation réinitialisée. En quoi puis-je vous aider pour votre architecture ?",
                    },
                  ])
                }
                title="Effacer la conversation"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-subtle hover:text-ink"
              >
                <Trash size={16} />
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
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

          {/* BANDEAU DES SERVICES & PRODUITS SYSTALINK */}
          <div className="border-b border-edge bg-subtle/40 px-3 py-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 min-w-max">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-4 mr-1">
                Offres Systalink :
              </span>
              {QUICK_PRODUCTS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => void handleSend(p.query)}
                    className="flex items-center gap-1.5 rounded-full border border-edge bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent cursor-pointer"
                  >
                    <Icon size={12} weight="bold" />
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* HISTORIQUE DES MESSAGES */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2.5",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-brand to-accent text-white shadow-sm mt-0.5">
                    <Robot size={15} weight="fill" />
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed",
                    msg.role === "user"
                      ? "bg-brand text-white rounded-br-xs"
                      : "bg-sunken border border-edge text-ink rounded-bl-xs"
                  )}
                >
                  <div className="prose prose-xs dark:prose-invert max-w-none">
                    {renderContent(msg.content)}
                    {msg.streaming && (
                      <span className="inline-block w-1.5 h-3.5 bg-accent ml-0.5 animate-pulse align-middle" />
                    )}
                  </div>

                  {msg.role === "assistant" && hasSystalinkUrl(msg.content) && (
                    <div className="mt-2.5 pt-2 border-t border-edge/60 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-ink-3">
                        Systalink
                      </span>
                      <a
                        href="https://systalink.com/fr"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-accent/10 hover:bg-accent/20 text-accent font-semibold text-[11px] transition-colors"
                      >
                        <span>Demander un devis</span>
                        <ArrowSquareOut size={12} weight="bold" />
                      </a>
                    </div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-subtle text-ink-2 mt-0.5">
                    <User size={15} weight="bold" />
                  </div>
                )}
              </div>
            ))}

            {loading && !messages.some((m) => m.streaming) && (
              <div className="flex items-center gap-2 text-xs text-ink-3">
                <Sparkle size={15} className="animate-spin text-accent" />
                <span>Le Conseiller Systalink analyse votre demande…</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* SUGGESTIONS D'ACTIONS EN UN CLIC */}
          {suggestedActions.length > 0 && !loading && (
            <div className="border-t border-edge bg-surface px-3 py-2 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {suggestedActions.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => void handleSend(sug)}
                  className="rounded-lg border border-edge bg-sunken px-2.5 py-1 text-[11px] text-ink-2 transition-colors hover:border-accent hover:text-accent text-left"
                >
                  {sug}
                </button>
              ))}
            </div>
          )}

          {/* ZONE DE SAISIE */}
          <div className="border-t border-edge bg-surface p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
              className="flex items-end gap-2"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Décrivez votre idée, posez une question d'architecture ou de déploiement…"
                className="flex-1 resize-none rounded-xl border border-edge bg-sunken px-3 py-2 text-xs text-ink placeholder:text-ink-4 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent max-h-24"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                aria-label="Envoyer"
                className={cn(
                  "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-white transition-all",
                  !input.trim() || loading
                    ? "bg-subtle text-ink-4 cursor-not-allowed"
                    : "bg-brand hover:bg-brand-hover shadow-sm"
                )}
              >
                <PaperPlaneRight size={16} weight="fill" />
              </button>
            </form>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-ink-4">
              <span>Shift+Entrée pour saut de ligne</span>
              <a
                href="https://systalink.com/fr"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-ink-2 transition-colors"
              >
                Systalink : systalink.com
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
