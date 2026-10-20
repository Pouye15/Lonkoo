"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { clampZoom, fitView, type Point, type Rect, type View } from "./geometry";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

const INITIAL_VIEW: View = { x: 48, y: 48, zoom: 1 };

/**
 * Déplacement et zoom du canevas, façon draw.io.
 *
 * La vue vit dans une référence et s'applique directement au DOM (transform du calque, position de la
 * grille) : pendant un geste, React ne re-rend pas les blocs. L'état React `view` n'est rafraîchi
 * qu'une fois par image, pour l'affichage du zoom et la mini-carte.
 *
 * Le hook crée deux références à poser sur le DOM : `containerRef` (zone visible : reçoit la molette et porte
 * la grille de fond) et `layerRef` (calque des blocs et des liaisons, déplacé et mis à l'échelle).
 *
 *  - molette ou glissement à deux doigts : déplacement ;
 *  - Ctrl/Cmd + molette, pincement du trackpad : zoom autour du curseur ;
 *  - Maj + molette : déplacement horizontal.
 */
export function useViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>(INITIAL_VIEW);
  const [view, setViewState] = useState<View>(INITIAL_VIEW);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const stateFrame = useRef(0);
  const animFrame = useRef(0);

  const syncDom = useCallback(() => {
    const { x, y, zoom } = viewRef.current;
    const layerEl = layerRef.current;
    if (layerEl) layerEl.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${zoom})`;
    const box = containerRef.current;
    if (box) {
      // La grille s'espace quand on dézoome, pour rester lisible.
      const step = (zoom < 0.45 ? 40 : 20) * zoom;
      box.style.backgroundSize = `${step}px ${step}px`;
      box.style.backgroundPosition = `${x}px ${y}px`;
    }
  }, []);

  const scheduleState = useCallback(() => {
    if (stateFrame.current) return;
    stateFrame.current = requestAnimationFrame(() => {
      stateFrame.current = 0;
      setViewState(viewRef.current);
    });
  }, []);

  const setView = useCallback(
    (next: View) => {
      viewRef.current = { x: next.x, y: next.y, zoom: clampZoom(next.zoom) };
      syncDom();
      scheduleState();
    },
    [syncDom, scheduleState],
  );

  const cancelAnimation = useCallback(() => {
    if (animFrame.current) cancelAnimationFrame(animFrame.current);
    animFrame.current = 0;
  }, []);

  const panBy = useCallback(
    (dx: number, dy: number) => {
      cancelAnimation();
      const v = viewRef.current;
      setView({ ...v, x: v.x + dx, y: v.y + dy });
    },
    [cancelAnimation, setView],
  );

  /** Zoom autour d'un point exprimé dans le repère du conteneur. */
  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      cancelAnimation();
      const v = viewRef.current;
      const zoom = clampZoom(v.zoom * factor);
      const k = zoom / v.zoom;
      setView({ zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
    },
    [cancelAnimation, setView],
  );

  const animateTo = useCallback(
    (target: View, duration = 240) => {
      cancelAnimation();
      const from = { ...viewRef.current };
      const goal = { ...target, zoom: clampZoom(target.zoom) };
      const start = performance.now();
      const step = (now: number) => {
        const t = clamp01((now - start) / duration);
        const e = 1 - Math.pow(1 - t, 3);
        setView({
          x: lerp(from.x, goal.x, e),
          y: lerp(from.y, goal.y, e),
          zoom: from.zoom * Math.pow(goal.zoom / from.zoom, e),
        });
        animFrame.current = t < 1 ? requestAnimationFrame(step) : 0;
      };
      animFrame.current = requestAnimationFrame(step);
    },
    [cancelAnimation, setView],
  );

  /** Zoom d'un cran autour du centre de la zone visible, avec animation. */
  const zoomStep = useCallback(
    (direction: 1 | -1) => {
      const box = containerRef.current;
      if (!box) return;
      const v = viewRef.current;
      const zoom = clampZoom(v.zoom * (direction > 0 ? 1.25 : 1 / 1.25));
      const k = zoom / v.zoom;
      const cx = box.clientWidth / 2;
      const cy = box.clientHeight / 2;
      animateTo({ zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }, 180);
    },
    [animateTo],
  );

  const zoomTo = useCallback(
    (zoom: number) => {
      const box = containerRef.current;
      if (!box) return;
      const v = viewRef.current;
      const k = clampZoom(zoom) / v.zoom;
      const cx = box.clientWidth / 2;
      const cy = box.clientHeight / 2;
      animateTo({ zoom: clampZoom(zoom), x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }, 200);
    },
    [animateTo],
  );

  /** Cadre le contenu (ou un rectangle donné) dans la zone visible. */
  const fit = useCallback(
    (bounds: Rect | null, animate = true, bottomInset = 0) => {
      const box = containerRef.current;
      if (!box) return;
      const target = fitView(bounds, box.clientWidth, box.clientHeight, 72, 1.25, bottomInset);
      if (animate) animateTo(target, 260);
      else setView(target);
    },
    [animateTo, setView],
  );

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const box = containerRef.current;
      const rect = box?.getBoundingClientRect();
      const v = viewRef.current;
      return { x: (clientX - (rect?.left ?? 0) - v.x) / v.zoom, y: (clientY - (rect?.top ?? 0) - v.y) / v.zoom };
    },
    [],
  );

  // Application initiale au DOM, avant le premier affichage.
  useLayoutEffect(() => {
    syncDom();
  }, [syncDom]);

  // Taille de la zone visible.
  useEffect(() => {
    const box = containerRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => setSize({ w: box.clientWidth, h: box.clientHeight }));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Molette et pincement : écouteur natif non passif (React attache la molette en passif).
  useEffect(() => {
    const box = containerRef.current;
    if (!box) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = box.getBoundingClientRect();

      if (event.ctrlKey || event.metaKey) {
        // Cran de molette de souris : pas fixe. Pincement de trackpad : changements fins et continus.
        const notch = event.deltaMode !== 0 || Math.abs(event.deltaY) >= 50;
        const factor = notch ? (event.deltaY < 0 ? 1.15 : 1 / 1.15) : Math.exp(-event.deltaY * 0.012);
        zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
        return;
      }

      let dx = event.deltaX;
      let dy = event.deltaY;
      if (event.deltaMode === 1) {
        dx *= 16;
        dy *= 16;
      } else if (event.deltaMode === 2) {
        dx *= rect.width;
        dy *= rect.height;
      }
      if (event.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      panBy(-dx, -dy);
    };

    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [panBy, zoomAt]);

  useEffect(
    () => () => {
      cancelAnimation();
      if (stateFrame.current) cancelAnimationFrame(stateFrame.current);
    },
    [cancelAnimation],
  );

  return { containerRef, layerRef, view, viewRef, size, setView, panBy, zoomAt, zoomStep, zoomTo, animateTo, fit, screenToWorld, cancelAnimation };
}
