"use client";

import { createContext, useContext } from "react";

export interface ShellContextValue {
  /** Conteneur des actions de la page, dans l'en-tête (null en mode bulle ou avant le montage). */
  actionsHost: HTMLElement | null;
  setTitle: (title: string) => void;
  /** Le contenu de la page occupe toute la zone (tableau blanc du studio). */
  setFullBleed: (value: boolean) => void;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const context = useContext(ShellContext);
  if (!context) throw new Error("useShell doit être utilisé dans l'AppShell");
  return context;
}
