"use client";

import { useEffect, useState } from "react";
import { ApiError, IS_LIVE_API } from "@/lib/api";
import { lastMessageId, unreadFrom, unreadPollDelayMs } from "@/lib/discussion";
import { listMessages } from "@/lib/discussion-api";
import { markSeen, readSeen } from "@/lib/discussion-seen";

/**
 * Le nombre de messages que d'autres personnes ont écrits dans la discussion du projet depuis la dernière fois que
 * celle-ci a été lue, pour la pastille de « Revues » dans la barre latérale. Mode API seulement.
 *
 * `reading` est vrai quand la page de la discussion est ouverte : elle marque elle-même les messages comme vus, et il
 * n'y a rien à compter. La toute première fois (rien de « vu » pour ce projet), on part des messages d'aujourd'hui :
 * une personne qui rejoint une longue conversation n'est pas accueillie par « 99+ ».
 */
export function useUnreadDiscussion(projectId: string | null, reading: boolean): number {
  const [state, setState] = useState<{ projectId: string; count: number } | null>(null);

  useEffect(() => {
    if (!IS_LIVE_API || !projectId || reading) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let stopped = false;

    async function check(id: string) {
      try {
        const seen = readSeen(id);
        const batch = await listMessages(id, { after: seen ?? undefined, signal: controller.signal });
        if (seen === null) {
          markSeen(id, lastMessageId(batch) ?? 0);
          setState({ projectId: id, count: 0 });
        } else {
          setState({ projectId: id, count: unreadFrom(batch, seen) });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        // Pas (ou plus) membre du projet : inutile d'insister.
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) stopped = true;
      }
      if (!stopped) {
        timer = window.setTimeout(() => void check(id), unreadPollDelayMs(document.visibilityState === "visible"));
      }
    }

    void check(projectId);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [projectId, reading]);

  // Le compte d'un autre projet, ou celui d'avant l'ouverture de la discussion, ne vaut plus.
  return state !== null && state.projectId === projectId && !reading ? state.count : 0;
}
