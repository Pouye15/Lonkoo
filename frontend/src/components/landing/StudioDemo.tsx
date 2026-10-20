"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Cloud, Cube, ShieldCheck, SlidersHorizontal } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import {
  CHAPTER_BOUNDS,
  TOTAL_FRAMES,
  chapterAt,
  renderFrame,
  type FrameFonts,
} from "./sequence/render-frame";

const CHAPTERS = [
  {
    label: "Concevoir",
    status: "Édition en direct",
    icon: SlidersHorizontal,
    text: "Dessinez le système à plusieurs. Les curseurs et les modifications de toute l'équipe apparaissent en direct, sans verrou.",
  },
  {
    label: "Auditer",
    status: "Audit en cours",
    icon: ShieldCheck,
    text: "Demandez un audit à l'IA : points de défaillance, failles, surcoûts. Chaque proposition est à vous d'accepter ou non.",
  },
  {
    label: "Générer",
    status: "Génération du projet",
    icon: Cube,
    text: "Une version validée devient un projet de démarrage : contrat OpenAPI, entités, Dockerfile, docker-compose et README.",
  },
  {
    label: "Déployer",
    status: "Déploiement",
    icon: Cloud,
    text: "Poussez le projet sur GitHub, puis déployez-le sur un serveur cloud à Dakar avec un état suivi en direct.",
  },
] as const;

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const readReducedMotion = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;

/** Image de repos quand l'animation liée au défilement est désactivée : le schéma est complet. */
const STATIC_FRAMES = CHAPTER_BOUNDS.slice(0, 4).map((start) => start + 40);

export function StudioDemo() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const railFillRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef(0);
  const wakeRef = useRef<() => void>(() => undefined);

  const reduceMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
  const [chapter, setChapter] = useState(0);
  const chapterRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const section = sectionRef.current;
    if (!canvas || !section) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const readFont = (variable: string, fallback: string) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
      return value ? `${value}, ${fallback}` : fallback;
    };
    let fonts: FrameFonts = {
      sans: readFont("--font-geist-sans", "system-ui, sans-serif"),
      mono: readFont("--font-geist-mono", "ui-monospace, monospace"),
    };

    const state = { smooth: 0, drawn: -1, width: 0, height: 0, dpr: 1, running: false, raf: 0 };

    const measure = () => {
      if (reduceMotion) {
        // Sans animation liée au défilement : on montre le schéma complet de la première étape.
        if (targetRef.current === 0) targetRef.current = STATIC_FRAMES[0] ?? 40;
        return;
      }
      const rect = section.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const progress = travel > 0 ? clamp01(-rect.top / travel) : 0;
      targetRef.current = progress * (TOTAL_FRAMES - 1);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width !== state.width || height !== state.height || dpr !== state.dpr) {
        state.width = width;
        state.height = height;
        state.dpr = dpr;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        state.drawn = -1;
      }
    };

    const tick = () => {
      const target = targetRef.current;
      const delta = target - state.smooth;
      state.smooth = reduceMotion || Math.abs(delta) < 0.01 ? target : state.smooth + delta * 0.12;

      if (Math.abs(state.smooth - state.drawn) > 0.02) {
        resize();
        renderFrame(ctx, state.smooth, { width: state.width, height: state.height, dpr: state.dpr }, fonts, {
          transparent: false,
        });
        state.drawn = state.smooth;
        if (railFillRef.current) {
          railFillRef.current.style.transform = `scaleX(${state.smooth / (TOTAL_FRAMES - 1)})`;
        }
        const next = chapterAt(Math.round(state.smooth));
        if (next !== chapterRef.current) {
          chapterRef.current = next;
          setChapter(next);
        }
      }

      if (state.smooth === target) state.running = false;
      else state.raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      measure();
      if (!state.running) {
        state.running = true;
        state.raf = requestAnimationFrame(tick);
      }
    };
    wakeRef.current = wake;

    const onResize = () => {
      state.drawn = -1;
      wake();
    };

    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(() => {
      fonts = {
        sans: readFont("--font-geist-sans", "system-ui, sans-serif"),
        mono: readFont("--font-geist-mono", "ui-monospace, monospace"),
      };
      onResize();
    });
    wake();

    return () => {
      cancelAnimationFrame(state.raf);
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", onResize);
    };
  }, [reduceMotion]);

  const goToChapter = useCallback(
    (index: number) => {
      const section = sectionRef.current;
      if (!section) return;
      const start = CHAPTER_BOUNDS[index] ?? 0;
      if (reduceMotion) {
        targetRef.current = STATIC_FRAMES[index] ?? start;
        wakeRef.current();
        return;
      }
      const rect = section.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const sectionTop = window.scrollY + rect.top;
      const progress = (start + 3) / (TOTAL_FRAMES - 1);
      window.scrollTo({ top: sectionTop + progress * travel, behavior: "smooth" });
    },
    [reduceMotion],
  );

  const active = CHAPTERS[chapter] ?? CHAPTERS[0];

  return (
    <section
      ref={sectionRef}
      id="parcours"
      aria-label="Du schéma au déploiement"
      className={cn("relative", reduceMotion ? "py-20" : "h-[360vh]")}
    >
      <div
        className={cn(
          "flex flex-col justify-center gap-8 px-5",
          reduceMotion ? "" : "sticky top-16 h-[calc(100dvh-4rem)] py-6",
        )}
      >
        <div className="mx-auto grid w-full max-w-7xl items-center gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Chapitres */}
          <div className="lg:col-span-3">
            <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl lg:text-[1.75rem] lg:leading-tight xl:text-3xl">
              Du schéma au déploiement
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
              Un seul parcours, quatre étapes. Faites défiler pour le voir se dérouler.
            </p>

            <ol className="mt-6 hidden space-y-1 lg:block">
              {CHAPTERS.map((item, index) => {
                const Icon = item.icon;
                const isActive = chapter === index;
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() => goToChapter(index)}
                      aria-current={isActive ? "step" : undefined}
                      className={cn(
                        "w-full rounded-xl border p-4 text-left transition-colors",
                        isActive ? "border-edge bg-surface shadow-card" : "border-transparent hover:bg-subtle",
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors",
                            isActive ? "bg-brand text-white" : "bg-subtle text-ink-3",
                          )}
                        >
                          <Icon size={16} weight={isActive ? "fill" : "regular"} />
                        </span>
                        <span className="flex items-baseline gap-2">
                          <span className="font-mono text-xs text-ink-4">0{index + 1}</span>
                          <span className={cn("text-[15px] font-semibold", isActive ? "text-ink" : "text-ink-2")}>
                            {item.label}
                          </span>
                        </span>
                      </span>
                      {isActive && <p className="mt-2.5 pl-11 text-sm leading-relaxed text-ink-2">{item.text}</p>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Fenêtre du studio */}
          <div className="lg:col-span-9">
            <div className="overflow-hidden rounded-2xl border border-edge-strong bg-[#061826] shadow-pop">
              <div className="flex h-11 items-center justify-between gap-3 border-b border-[#17334b] bg-[#0a2236] px-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="truncate font-mono text-xs text-[#e7f2f7]">marketplace-mobile</span>
                  <span className="flex -space-x-1.5" aria-hidden="true">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1265dd] text-[10px] font-semibold text-white ring-2 ring-[#0a2236]">
                      A
                    </span>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#fb8500] text-[10px] font-semibold text-[#061826] ring-2 ring-[#0a2236]">
                      K
                    </span>
                  </span>
                </div>
                <span className="flex items-center gap-2 text-xs font-medium text-[#8ea3b5]" aria-live="polite">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
                  {active.status}
                </span>
              </div>

              <div className="relative aspect-[16/10] w-full">
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-label="Animation du studio : conception collaborative, audit IA, génération du projet puis déploiement"
                  className="absolute inset-0 block h-full w-full"
                />
              </div>

              <div className="h-1 bg-[#0a2236]">
                <div
                  ref={railFillRef}
                  className="h-full origin-left bg-[#1265dd]"
                  style={{ transform: "scaleX(0)" }}
                />
              </div>
            </div>

            {/* Chapitres sur petit écran */}
            <div className="mt-5 lg:hidden">
              <div className="flex gap-1 overflow-x-auto rounded-xl border border-edge bg-surface p-1" role="group" aria-label="Étapes">
                {CHAPTERS.map((item, index) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => goToChapter(index)}
                    aria-current={chapter === index ? "step" : undefined}
                    className={cn(
                      "flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      chapter === index ? "bg-subtle text-ink" : "text-ink-3",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-2">{active.text}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
