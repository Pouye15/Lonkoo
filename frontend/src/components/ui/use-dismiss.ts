"use client";

import { useEffect, type RefObject } from "react";

/** Ferme un menu flottant au clic à l'extérieur du conteneur ou sur Échap. */
export function useDismiss(open: boolean, onClose: () => void, container: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, container]);
}
