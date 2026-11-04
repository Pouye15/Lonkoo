"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "lonkoo.theme";
const MEDIA = "(prefers-color-scheme: dark)";

/**
 * Script exécuté avant le premier rendu (inséré dans <head> par le layout racine) :
 * pose la classe « dark » tout de suite pour éviter un flash de thème clair.
 */
export const themeInitScript = `(function(){try{var p=localStorage.getItem('${STORAGE_KEY}');var d=p==='dark'||((p===null||p==='system')&&window.matchMedia('${MEDIA}').matches);var r=document.documentElement;if(d){r.classList.add('dark')}r.style.colorScheme=d?'dark':'light'}catch(e){}})();`;

/** Choix de la session quand le stockage du navigateur est indisponible (navigation privée). */
let memoryPreference: ThemePreference | null = null;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function readPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // Stockage bloqué : on retombe sur la mémoire de la session.
  }
  return memoryPreference ?? "system";
}

function subscribePreference(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function subscribeSystem(onChange: () => void) {
  const media = window.matchMedia(MEDIA);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const systemPrefersDark = () => window.matchMedia(MEDIA).matches;

interface ThemeContextValue {
  /** Choix de l'utilisateur (clair, sombre ou suivre le système). */
  preference: ThemePreference;
  /** Thème réellement appliqué. */
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribePreference,
    readPreference,
    () => "system",
  );
  const systemDark = useSyncExternalStore(subscribeSystem, systemPrefersDark, () => false);
  const resolved: ResolvedTheme = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    memoryPreference = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Stockage indisponible (navigation privée) : le choix vaut pour la session seulement.
    }
    notify();
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme doit être utilisé dans un ThemeProvider");
  return context;
}
