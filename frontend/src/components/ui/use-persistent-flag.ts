"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Map<string, Set<() => void>>();
/** Valeurs de la session quand le stockage du navigateur est indisponible (navigation privée). */
const memory = new Map<string, boolean>();

function notify(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

/**
 * Booléen mémorisé dans le navigateur (barre latérale repliée, barre réduite en bulle…).
 * Lecture compatible avec le rendu serveur : la valeur initiale s'applique jusqu'à l'hydratation.
 */
export function usePersistentFlag(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const subscribe = useCallback(
    (listener: () => void) => {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(listener);
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) listener();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        set.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );

  const getSnapshot = useCallback(() => {
    try {
      const value = window.localStorage.getItem(key);
      if (value !== null) return value === "1";
    } catch {
      // Stockage bloqué : on retombe sur la mémoire de la session.
    }
    return memory.get(key) ?? initial;
  }, [key, initial]);

  const value = useSyncExternalStore(subscribe, getSnapshot, () => initial);

  const setValue = useCallback(
    (next: boolean) => {
      memory.set(key, next);
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Stockage indisponible : le choix n'est pas conservé.
      }
      notify(key);
    },
    [key],
  );

  return [value, setValue];
}
