"use client";

import React, { useEffect, useRef, useState } from "react";
import { CloudSlash, PaperPlaneRight, WarningCircle } from "@phosphor-icons/react";
import { ApiError, messageOf, relativeTime } from "@/lib/api";
import {
  COUNTER_FROM_CHARS,
  MAX_MESSAGE_CHARS,
  draftProblem,
  enterSends,
  fullDate,
  isBlank,
  isNearBottom,
  lastMessageId,
  mergeMessages,
  pollDelayMs,
  type DiscussionMessage,
} from "@/lib/discussion";
import { listMessages, sendMessage } from "@/lib/discussion-api";
import { markSeen } from "@/lib/discussion-seen";
import { avatarColor, memberInitials } from "@/lib/members";
import { listMembers } from "@/lib/members-api";

type Status = "loading" | "ready" | "forbidden";

/**
 * Discussion d'un projet en mode API : un fil partagé par tous les membres (quel que soit leur rôle), qui se met à jour
 * tout seul (lecture toutes les 3 s tant que l'onglet est visible, plus lente sinon). Le texte est affiché tel quel,
 * jamais interprété : pas de lien cliquable, pas de mise en forme.
 *
 * Le composant se monte avec `key={projectId}` : changer de projet repart d'un état neuf.
 */
export function ProjectDiscussion({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<readonly DiscussionMessage[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [offline, setOffline] = useState(false);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // Les heures relatives (« Il y a 3 min ») se rafraîchissent toutes les 30 s, sans attendre un nouveau message.
  const [now, setNow] = useState(() => Date.now());

  const listRef = useRef<HTMLDivElement>(null);
  // Vrai tant que la liste est en bas : un nouveau message la fait suivre. Écrit par le défilement, lu à l'arrivée.
  const followRef = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    let failures = 0;
    let lastId: number | undefined;
    let stopped = false;

    async function read() {
      try {
        const incoming = await listMessages(projectId, { after: lastId, signal: controller.signal });
        failures = 0;
        setOffline(false);
        setStatus("ready");
        if (incoming.length > 0) {
          lastId = lastMessageId(incoming);
          setMessages((previous) => mergeMessages(previous, incoming));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        // Pas (ou plus) membre du projet : inutile d'insister.
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          setStatus("forbidden");
          stopped = true;
          return;
        }
        failures += 1;
        if (failures >= 2) setOffline(true);
      }
      if (!stopped) schedule();
    }

    function schedule() {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, pollDelayMs({ visible: document.visibilityState === "visible", failures }));
    }

    // En revenant sur l'onglet, on lit tout de suite plutôt que d'attendre la lecture lente.
    function onVisible() {
      if (document.visibilityState !== "visible" || stopped) return;
      window.clearTimeout(timer);
      void read();
    }

    void read();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [projectId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Le nombre de membres : un renseignement, sans enjeu ; s'il manque, l'en-tête s'en passe.
  useEffect(() => {
    const controller = new AbortController();
    listMembers(projectId, controller.signal)
      .then((members) => setMemberCount(members.length))
      .catch(() => undefined);
    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    const list = listRef.current;
    if (list && followRef.current) list.scrollTop = list.scrollHeight;
  }, [messages, status]);

  // Ce qui est affiché dans un onglet visible est lu : la pastille de « Revues » n'en tient plus compte.
  useEffect(() => {
    const last = lastMessageId(messages);
    if (last !== undefined && document.visibilityState === "visible") markSeen(projectId, last);
  }, [messages, projectId]);

  async function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (sending || isBlank(draft) || draftProblem(draft)) return;
    setSending(true);
    setSendError(null);
    try {
      const created = await sendMessage(projectId, draft);
      setMessages((previous) => mergeMessages(previous, [created]));
      setDraft("");
      // Ce qu'on écrit soi-même, on le voit arriver.
      followRef.current = true;
    } catch (error) {
      // Le texte reste dans la zone de saisie : rien n'est perdu (limite de débit, réseau coupé…).
      setSendError(messageOf(error));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Entrée envoie au clavier ; sur un écran tactile elle va à la ligne et le bouton envoie (voir enterSends).
    const touchScreen = window.matchMedia("(pointer: coarse)").matches;
    if (enterSends({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing }, touchScreen)) {
      event.preventDefault();
      void submit();
    }
  }

  const problem = draftProblem(draft);
  const length = draft.trim().length;

  return (
    // Sur un petit écran la discussion passe avant les propositions (fictives et longues) : elle reste à portée de pouce.
    <div className="order-first flex h-[660px] flex-col overflow-hidden rounded-xl border border-edge bg-surface lg:order-none lg:col-span-5">
      <div className="flex items-center justify-between border-b border-edge bg-surface p-3.5">
        <h2 className="text-xs font-bold text-ink">Discussion d&apos;équipe</h2>
        {memberCount !== null && (
          <span className="text-[11px] text-ink-3">
            {memberCount} {memberCount > 1 ? "membres" : "membre"}
          </span>
        )}
      </div>

      {offline && (
        <div role="status" className="flex items-center gap-2 border-b border-edge bg-sunken px-3.5 py-2 text-xs text-ink-2">
          <CloudSlash size={14} />
          Connexion perdue, nouvelle tentative en cours…
        </div>
      )}

      {status === "forbidden" ? (
        <div className="flex flex-1 items-center justify-center bg-sunken p-6 text-center text-xs text-ink-3">
          La discussion est réservée aux membres du projet.
        </div>
      ) : (
        <>
          <div
            ref={listRef}
            role="log"
            aria-live="polite"
            aria-label="Messages de l'équipe"
            onScroll={(event) => {
              followRef.current = isNearBottom(event.currentTarget);
            }}
            className="flex-1 space-y-2.5 overflow-y-auto bg-sunken p-3.5"
          >
            {status === "loading" && <p className="text-xs text-ink-3">Chargement…</p>}
            {status === "ready" && messages.length === 0 && (
              <p className="py-8 text-center text-xs text-ink-3">
                Aucun message pour l&apos;instant. Écrivez le premier : toute l&apos;équipe le verra ici.
              </p>
            )}
            {messages.map((message) => (
              <article key={message.id} className="space-y-1.5 rounded-lg border border-edge bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      style={{ backgroundColor: avatarColor(message.authorId ?? message.authorName) }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    >
                      {memberInitials({ displayName: message.authorName, login: message.authorName })}
                    </span>
                    <span className="truncate text-xs font-bold text-ink">{message.authorName}</span>
                    {message.mine && <span className="text-[11px] text-ink-4">vous</span>}
                  </div>
                  <time dateTime={message.createdAt} title={fullDate(message.createdAt)} className="shrink-0 font-mono text-[11px] text-ink-4">
                    {relativeTime(message.createdAt, now)}
                  </time>
                </div>
                {/* Texte brut : les retours à la ligne sont gardés, rien n'est interprété. */}
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-2">{message.body}</p>
              </article>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-2 border-t border-edge bg-surface p-3">
            {(sendError || problem) && (
              <p role="alert" className="flex items-start gap-1.5 text-xs text-danger">
                <WarningCircle size={14} weight="fill" className="mt-px shrink-0" />
                <span>{sendError ?? problem}</span>
              </p>
            )}
            <div className="flex items-end gap-2">
              <label htmlFor="discussion-draft" className="sr-only">
                Votre message
              </label>
              <textarea
                id="discussion-draft"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                placeholder="Écrire à l'équipe…"
                className="min-h-[3rem] flex-1 resize-none rounded-lg border border-edge bg-sunken px-3 py-2 text-xs text-ink focus:border-accent focus:bg-surface focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || isBlank(draft) || problem !== null}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-xs font-medium text-white hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-50"
              >
                <PaperPlaneRight size={14} weight="fill" />
                <span>Envoyer</span>
              </button>
            </div>
            <p className="hidden text-[11px] text-ink-4 pointer-fine:block">
              Entrée pour envoyer, Maj+Entrée pour aller à la ligne
            </p>
            {length >= COUNTER_FROM_CHARS && (
              <p className={`text-right text-[11px] ${length > MAX_MESSAGE_CHARS ? "text-danger" : "text-ink-3"}`}>
                {length} / {MAX_MESSAGE_CHARS}
              </p>
            )}
          </form>
        </>
      )}
    </div>
  );
}
