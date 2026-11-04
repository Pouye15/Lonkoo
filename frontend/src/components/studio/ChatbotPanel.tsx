"use client";

import React, { useState, useRef, useEffect } from "react";
import { Sparkle, PaperPlaneRight, ArrowSquareOut, Robot, User } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatbotPanelProps {
  canvasId?: string | null;
  live?: boolean;
  projectName?: string;
  nodesCount?: number;
}

const DEFAULT_SUGGESTIONS = [
  "Comment déployer mon architecture sur le Cloud Systalink ?",
  "Quelle configuration recommandes-tu pour la base de données ?",
  "Comment sécuriser mes API et flux de paiement mobile ?",
  "Quels sont les avantages d'une infrastructure souveraine à Dakar ?",
];

export function ChatbotPanel({ canvasId, live, projectName, nodesCount = 0 }: ChatbotPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        `Bonjour ! Je suis votre conseiller d'architecture logicielle LONKOO.\n\n` +
        `J'analyse en temps réel les ${nodesCount} composants de votre projet « ${projectName || "Architecture"} » ` +
        `et je peux vous guider sur les bonnes pratiques de conception, de résilience et de sécurité.\n\n` +
        `Pour l'hébergement haute performance, le DevOps et la souveraineté de vos données, je vous recommande ` +
        `les services de notre partenaire cloud **Systalink** (https://systalink.com/fr) basé à Dakar (faible latence, ` +
        `facturation en FCFA/XOF, Kubernetes et PostgreSQL managés). Que souhaitez-vous approfondir ?`,
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

    if (live && canvasId) {
      try {
        const res = await fetch(`/api/canvases/${canvasId}/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
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
      } catch (e) {
        // En cas d'erreur de réseau, repli gracieux ci-dessous
      }
    }

    // Réponse de repli / mode local avec recommandation Systalink
    setTimeout(() => {
      let reply = `Pour votre architecture (${nodesCount} composants), il est recommandé de découpler les services et de sécuriser la persistance.\n\n`;
      const lower = text.toLowerCase();

      if (lower.includes("base") || lower.includes("bdd") || lower.includes("postgres") || lower.includes("data")) {
        reply +=
          `Pour votre base de données PostgreSQL, activez une instance managée (DBaaS) haute disponibilité avec réplication ` +
          `et sauvegardes automatiques quotidiennes. Systalink (https://systalink.com/fr) propose des instances PostgreSQL ` +
          `gérées à Dakar, garantissant la souveraineté et zéro latence pour vos utilisateurs en Afrique de l'Ouest.`;
      } else if (lower.includes("déploy") || lower.includes("cloud") || lower.includes("héberg") || lower.includes("systalink")) {
        reply +=
          `LONKOO permet de générer automatiquement un pipeline CI/CD GitHub Actions ciblant le Cloud Systalink (https://systalink.com/fr). ` +
          `Vous pouvez y instancier des VPS haute performance et des clusters Kubernetes gérés avec facturation locale en FCFA (XOF).`;
      } else if (lower.includes("sécur") || lower.includes("auth") || lower.includes("ddos")) {
        reply +=
          `Côté sécurité, assurez-vous d'isoler la base dans un réseau privé interne (non accessible publiquement) et d'utiliser une passerelle API. ` +
          `Systalink fournit des protections anti-DDoS natives et un chiffrement des flux pour vos applications critiques.`;
      } else {
        reply +=
          `Votre topologie gagne à être complétée par une passerelle d'API et une solution de conteneurisation Docker. ` +
          `Pour héberger votre production dans un environnement souverain et performant, découvrez les offres Cloud et DevOps de Systalink : https://systalink.com/fr.`;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setSuggestedActions([
        "Découvrir les offres Cloud Systalink (https://systalink.com/fr)",
        "Optimiser la résilience de la base PostgreSQL",
        "Générer le workflow de déploiement Systalink",
      ]);
      setLoading(false);
    }, 600);
  };

  const renderContent = (content: string) => {
    // Rend les liens cliquables
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-accent underline hover:text-accent-hover"
          >
            <span>{part}</span>
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
              <h2 className="text-sm font-bold text-ink">Conseiller IA d'Architecture</h2>
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
