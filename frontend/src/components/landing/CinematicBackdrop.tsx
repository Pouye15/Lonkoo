"use client";

import { useEffect, useRef } from "react";
import { useVideoFrames, VIDEO_FRAME_COUNT } from "./sequence/use-frame-images";

/**
 * Arrière-plan cinématique fixe de toute la landing page.
 *
 * La vidéo (100 images) avance avec le scroll global du document. Deux images
 * voisines sont fondues l'une dans l'autre pour un défilement continu, puis la
 * scène est teintée au bleu Systalink et assombrie pour rester un décor :
 * le contenu passe toujours au premier plan.
 */
export function CinematicBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { get } = useVideoFrames();
  const getRef = useRef(get);
  getRef.current = get;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let target = 0;
    let smooth = 0;
    let drawn = -1;
    let rafId = 0;
    let running = false;
    let needsResize = true;

    const readTarget = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      target = p * (VIDEO_FRAME_COUNT - 1);
    };

    const resize = () => {
      // Le décor est volontairement rendu à 1x : il est teinté et adouci,
      // la haute densité n'apporterait que du coût GPU.
      const w = Math.min(window.innerWidth, 1920);
      const h = Math.round((w / window.innerWidth) * window.innerHeight);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        drawn = -1;
      }
      needsResize = false;
    };

    const drawCover = (img: HTMLImageElement, alpha: number, zoom: number, w: number, h: number) => {
      const ir = img.naturalWidth / img.naturalHeight;
      const cr = w / h;
      let dw = w;
      let dh = h;
      if (ir > cr) dw = h * ir;
      else dh = w / ir;
      dw *= zoom;
      dh *= zoom;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    };

    const draw = (f: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const i0 = Math.floor(f);
      const t = f - i0;
      const a = getRef.current(i0);
      if (!a) return false;
      const b = t > 0.01 ? getRef.current(i0 + 1) : null;
      const progress = f / (VIDEO_FRAME_COUNT - 1);
      const zoom = 1.12 - 0.1 * progress; // travelling avant léger

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#04111d";
      ctx.fillRect(0, 0, w, h);
      drawCover(a, 1, zoom, w, h);
      if (b && b !== a) drawCover(b, t, zoom, w, h);

      // Teinte bleu Systalink (multiplication) puis voile nuit
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "rgb(52, 112, 214)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(4, 17, 29, 0.52)";
      ctx.fillRect(0, 0, w, h);
      return true;
    };

    const tick = () => {
      if (needsResize) resize();
      const diff = target - smooth;
      smooth = reduceMotion || Math.abs(diff) < 0.002 ? target : smooth + diff * 0.09;

      if (Math.abs(smooth - drawn) > 0.001) {
        if (draw(smooth)) drawn = smooth;
      }

      // La boucle s'arrête d'elle-même une fois l'image stabilisée et chargée
      if (smooth !== target || drawn !== smooth) {
        rafId = requestAnimationFrame(tick);
      } else {
        running = false;
      }
    };

    const wake = () => {
      readTarget();
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(tick);
      }
    };

    const onResize = () => {
      needsResize = true;
      wake();
    };

    // Relance tant que les premières images arrivent
    const warmup = window.setInterval(() => {
      drawn = -1;
      wake();
    }, 250);
    const stopWarmup = window.setTimeout(() => window.clearInterval(warmup), 4000);

    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", onResize);
    wake();

    return () => {
      cancelAnimationFrame(rafId);
      window.clearInterval(warmup);
      window.clearTimeout(stopWarmup);
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {/* Vignettage et fondus pour fondre la vidéo dans la page */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_65%_at_50%_45%,transparent_0%,rgba(4,17,29,0.55)_70%,rgba(4,17,29,0.92)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#04111d] to-transparent" />
      <div className="absolute inset-0 opacity-[0.35] dot-grid" />
    </div>
  );
}
