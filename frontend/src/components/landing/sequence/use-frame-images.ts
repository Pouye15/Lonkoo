"use client";

import { useEffect, useRef } from "react";

export const VIDEO_FRAME_COUNT = 100;

function framePath(index0: number): string {
  return `/sequence/frames/ezgif-frame-${String(index0 + 1).padStart(3, "0")}.jpg`;
}

/**
 * Précharge les 100 images de la vidéo d'arrière-plan.
 * Les premières images sont demandées en priorité, le reste suit dans l'ordre,
 * et `get` renvoie toujours l'image disponible la plus proche pour éviter
 * tout trou visuel pendant un scroll rapide.
 */
export function useVideoFrames() {
  const framesRef = useRef<(HTMLImageElement | null)[]>(
    new Array(VIDEO_FRAME_COUNT).fill(null),
  );

  useEffect(() => {
    let cancelled = false;
    const pending: HTMLImageElement[] = [];

    const load = (i: number, priority: "high" | "low" | "auto") => {
      const img = new Image();
      img.decoding = "async";
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = priority;
      img.src = framePath(i);
      pending.push(img);
      const done = () => {
        if (cancelled) return;
        framesRef.current[i] = img;
      };
      // decode() évite le décodage synchrone au premier drawImage
      img
        .decode()
        .then(done)
        .catch(() => {
          img.onload = done;
        });
    };

    for (let i = 0; i < 6; i++) load(i, "high");
    for (let i = 6; i < VIDEO_FRAME_COUNT; i++) load(i, "low");

    return () => {
      cancelled = true;
      for (const img of pending) img.onload = null;
    };
  }, []);

  const get = (index: number): HTMLImageElement | null => {
    const frames = framesRef.current;
    const i = Math.max(0, Math.min(VIDEO_FRAME_COUNT - 1, index));
    if (frames[i]) return frames[i];
    for (let d = 1; d < VIDEO_FRAME_COUNT; d++) {
      const a = frames[i - d];
      if (a) return a;
      const b = frames[i + d];
      if (b) return b;
    }
    return null;
  };

  return { get };
}
