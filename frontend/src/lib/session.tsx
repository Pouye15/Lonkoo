"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { IS_LIVE_API, onUnauthorized } from "@/lib/api";
import { clearStoredGraphs } from "@/lib/project-graph";
import { resetWorkspace, setWorkspaceUser } from "@/lib/workspace";

/**
 * Session de l'utilisateur.
 *
 * Contrat visé (docs/ROADMAP-BACKEND.md, § 7.1) :
 *   GET  /api/me                → { id, login, displayName, avatarUrl?, isGuest }  (401 sans session)
 *   POST /api/auth/guest        → 201, même forme que /me
 *   GET  /api/auth/github/login → redirection vers GitHub puis retour sur /dashboard
 *   POST /api/auth/logout       → 204
 *
 * Tant que le backend n'est pas branché, un adaptateur simulé (localStorage) tient lieu de session.
 * Passer NEXT_PUBLIC_API_MODE=live au build pour utiliser l'API réelle.
 */

export interface SessionUser {
  id: string;
  /** Identifiant public sans « @ ». */
  login: string;
  displayName: string;
  avatarUrl?: string;
  isGuest: boolean;
}

export type SessionStatus = "loading" | "authenticated" | "anonymous";

interface SessionAdapter {
  load(): Promise<SessionUser | null>;
  guest(): Promise<SessionUser>;
  github(): Promise<SessionUser | null>;
  logout(): Promise<void>;
}

export const IS_MOCK_SESSION = !IS_LIVE_API;

/* ------------------------------------------------------------------ */
/* Adaptateur simulé                                                    */
/* ------------------------------------------------------------------ */

const MOCK_KEY = "lonkoo.session";
const GUEST_TTL_MS = 24 * 60 * 60 * 1000;

interface StoredSession {
  user: SessionUser;
  expiresAt: number | null;
}

function randomSuffix(length: number): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

/** Les projets et graphes simulés vivent dans le navigateur : ils ne doivent pas passer d'un compte au suivant. */
function clearLocalData() {
  resetWorkspace();
  clearStoredGraphs();
}

function writeMock(session: StoredSession | null) {
  try {
    if (session) window.localStorage.setItem(MOCK_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(MOCK_KEY);
  } catch {
    // Stockage indisponible : la session ne survivra pas au rechargement.
  }
}

const mockAdapter: SessionAdapter = {
  async load() {
    try {
      const raw = window.localStorage.getItem(MOCK_KEY);
      if (!raw) return null;
      const stored = JSON.parse(raw) as StoredSession;
      if (stored.expiresAt && stored.expiresAt < Date.now()) {
        writeMock(null);
        clearLocalData();
        return null;
      }
      return stored.user;
    } catch {
      return null;
    }
  },
  async guest() {
    const suffix = randomSuffix(4);
    const user: SessionUser = {
      id: `guest-${suffix}`,
      login: `invite-${suffix}`,
      displayName: "Invité",
      isGuest: true,
    };
    writeMock({ user, expiresAt: Date.now() + GUEST_TTL_MS });
    return user;
  },
  async github() {
    const user: SessionUser = {
      id: "gh-demo",
      login: "aminata-arch",
      displayName: "Aminata S.",
      isGuest: false,
    };
    writeMock({ user, expiresAt: null });
    return user;
  },
  async logout() {
    writeMock(null);
  },
};

/* ------------------------------------------------------------------ */
/* Adaptateur API réelle                                                */
/* ------------------------------------------------------------------ */

function toSessionUser(json: unknown): SessionUser {
  const data = json as Partial<SessionUser>;
  if (!data || typeof data.id !== "string" || typeof data.login !== "string") {
    throw new Error("Réponse de session invalide");
  }
  return {
    id: data.id,
    login: data.login,
    displayName: data.displayName ?? data.login,
    avatarUrl: data.avatarUrl,
    isGuest: Boolean(data.isGuest),
  };
}

const JSON_HEADERS = { Accept: "application/json", "Content-Type": "application/json" };

const apiAdapter: SessionAdapter = {
  async load() {
    const response = await fetch("/api/me", { headers: { Accept: "application/json" }, cache: "no-store" });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(`Session indisponible (${response.status})`);
    return toSessionUser(await response.json());
  },
  async guest() {
    const response = await fetch("/api/auth/guest", { method: "POST", headers: JSON_HEADERS, body: "{}" });
    if (response.status === 429) {
      // Limite d'invités par adresse (un Wi-Fi partagé, par exemple) : le serveur écrit combien de temps attendre.
      const detail = await response.json().then((problem: { detail?: unknown }) => problem.detail, () => undefined);
      throw new Error(
        typeof detail === "string"
          ? detail
          : "Trop d'espaces de démonstration ont été ouverts depuis cette adresse. Réessayez plus tard, ou connectez-vous avec GitHub.",
      );
    }
    if (!response.ok) throw new Error(`Impossible d'ouvrir l'espace de démonstration (${response.status})`);
    return toSessionUser(await response.json());
  },
  async github() {
    // Sondage préalable : si le serveur n'a pas d'application OAuth (503), on l'explique ici plutôt que
    // d'envoyer le navigateur sur une page de JSON brut. Une redirection vers GitHub reste « opaque » (non lue).
    let probe: Response;
    try {
      probe = await fetch("/api/auth/github/login", { redirect: "manual", cache: "no-store" });
    } catch {
      throw new Error("Le serveur est injoignable. Réessayez dans un instant.");
    }
    if (probe.status === 503) {
      throw new Error("La connexion GitHub n'est pas encore configurée sur ce serveur. Utilisez « Essayer sans compte ».");
    }
    // Navigation complète vers le backend (route hors de l'application Next) : le flux OAuth quitte la page.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/api/auth/github/login");
    // La page quitte l'application : on laisse l'état « en cours » jusqu'au retour de GitHub.
    return new Promise<SessionUser | null>(() => undefined);
  },
  async logout() {
    await fetch("/api/auth/logout", { method: "POST", headers: JSON_HEADERS });
  },
};

const adapter: SessionAdapter = IS_MOCK_SESSION ? mockAdapter : apiAdapter;

/* ------------------------------------------------------------------ */
/* Contexte                                                             */
/* ------------------------------------------------------------------ */

interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  signInAsGuest: () => Promise<SessionUser>;
  signInWithGitHub: () => Promise<SessionUser | null>;
  signOut: () => Promise<void>;
  /** Relit la session sur le serveur (après avoir rejoint un projet par lien, qui peut ouvrir une session d'invité). */
  refresh: () => Promise<SessionUser | null>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ status: SessionStatus; user: SessionUser | null }>({
    status: "loading",
    user: null,
  });

  useEffect(() => {
    let cancelled = false;
    adapter
      .load()
      .then((user) => {
        if (!cancelled) setState({ status: user ? "authenticated" : "anonymous", user });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "anonymous", user: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Mode API : la liste des projets est celle de la personne connectée.
  useEffect(() => {
    if (IS_MOCK_SESSION) return;
    const user = state.user;
    setWorkspaceUser(user ? { id: user.id, login: user.login, displayName: user.displayName } : null);
  }, [state.user]);

  // Une réponse 401 de l'API (session expirée) renvoie à la connexion.
  useEffect(() => {
    if (IS_MOCK_SESSION) return;
    return onUnauthorized(() => setState((current) => (current.status === "anonymous" ? current : { status: "anonymous", user: null })));
  }, []);

  const refresh = useCallback(async () => {
    const user = await adapter.load();
    setState({ status: user ? "authenticated" : "anonymous", user });
    return user;
  }, []);

  const signInAsGuest = useCallback(async () => {
    const user = await adapter.guest();
    setState({ status: "authenticated", user });
    return user;
  }, []);

  const signInWithGitHub = useCallback(async () => {
    const user = await adapter.github();
    if (user) setState({ status: "authenticated", user });
    return user;
  }, []);

  const signOut = useCallback(async () => {
    await adapter.logout().catch(() => undefined);
    clearLocalData();
    setState({ status: "anonymous", user: null });
  }, []);

  const value = useMemo(
    () => ({ ...state, signInAsGuest, signInWithGitHub, signOut, refresh }),
    [state, signInAsGuest, signInWithGitHub, signOut, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession doit être utilisé dans un SessionProvider");
  return context;
}

/**
 * N'accepte qu'un chemin interne (évite les redirections vers un site tiers après la connexion).
 * Les caractères de contrôle et les barres obliques inverses sont refusés : les navigateurs les
 * normalisent (« /<tabulation>/site.example » devient « //site.example »).
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const base = "http://lonkoo.invalid";
    const url = new URL(next, base);
    return url.origin === base ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}

export { initialsOf } from "@/lib/initials";
