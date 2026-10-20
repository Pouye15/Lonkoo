"use client";

import { useEffect } from "react";

/**
 * Active les révélations au scroll de toute la page.
 * Chaque élément `.reveal` reçoit `data-visible="true"` à son entrée dans
 * l'écran ; la transition (CSS) est jouée une seule fois, puis l'élément
 * n'est plus observé. Le décalage entre éléments se règle avec `--d`.
 */
export function ScrollReveal() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window)) {
      elements.forEach((el) => (el.dataset.visible = "true"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.visible = "true";
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
