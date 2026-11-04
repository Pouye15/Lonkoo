"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useShell } from "./shell-context";

interface PageHeaderProps {
  /** Titre de la page : fil d'Ariane et titre de l'onglet. */
  title: string;
  /** Actions rapides affichées à droite de l'en-tête. */
  actions?: React.ReactNode;
  /** La page occupe toute la zone de contenu, sans marges (tableau blanc). */
  fullBleed?: boolean;
}

/**
 * À placer en tête de chaque page de l'espace de travail.
 * L'en-tête appartient au shell (il reste monté entre deux pages) ; la page y dépose son titre
 * et ses actions, qui gardent l'état et les gestionnaires de la page.
 */
export function PageHeader({ title, actions, fullBleed = false }: PageHeaderProps) {
  const { actionsHost, setTitle, setFullBleed } = useShell();

  useEffect(() => {
    setTitle(title);
    document.title = `${title} | LONKOO`;
    return () => setTitle("");
  }, [title, setTitle]);

  useEffect(() => {
    setFullBleed(fullBleed);
    return () => setFullBleed(false);
  }, [fullBleed, setFullBleed]);

  return actions && actionsHost ? createPortal(actions, actionsHost) : null;
}
