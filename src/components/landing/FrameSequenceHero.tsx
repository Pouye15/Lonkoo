"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  renderFrame,
  chapterAt,
  chapterProgress,
  resilienceAt,
  TOTAL_FRAMES,
  CHAPTER_BOUNDS,
  type FrameFonts,
} from "./sequence/render-frame";
import {
  ArrowRight,
  ArrowDown,
  Play,
  ShieldCheck,
  Cpu,
  Terminal,
  PlugsConnected,
  SlidersHorizontal,
} from "@phosphor-icons/react";

const CHAPTERS = [
  {
    id: 0,
    label: "Modéliser",
    icon: SlidersHorizontal,
    text: "Collaborez en temps réel sur l'architecture et versionnez chaque brique de votre stack.",
  },
  {
    id: 1,
    label: "Scanner & Simuler",
    icon: Cpu,
    text: "L'assistant IA détecte les faiblesses, applique ses suggestions et simule la charge.",
  },
  {
    id: 2,
    label: "Documenter",
    icon: Terminal,
    text: "Documentation technique, ADR et contrats d'API sont générés et maintenus par IA.",
  },
  {
    id: 3,
    label: "Implémenter",
    icon: PlugsConnected,
    text: "Liez vos versions aux tags GitHub et implémentez via serveur MCP ou Orion.",
  },
] as const;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Distance de scroll (en px) sur laquelle se joue la séquence de 240 images. */
function sequenceSpan(windowHeight: number, vh: number) {
  return windowHeight * 0.9 + vh * 0.55;
}

export function FrameSequenceHero() {
  const heroRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameLabelRef = useRef<HTMLSpanElement>(null);
  const chapterPctRef = useRef<HTMLSpanElement>(null);
  const resilienceRef = useRef<HTMLSpanElement>(null);
  const railFillRef = useRef<HTMLDivElement>(null);

  const [activeChapter, setActiveChapter] = useState(0);
  const activeChapterRef = useRef(0);

  const seekToChapter = useCallback((chapterIndex: number) => {
    const win = windowRef.current;
    if (!win) return;
    const vh = window.innerHeight;
    const rect = win.getBoundingClientRect();
    const span = sequenceSpan(rect.height, vh);
    const p = ((CHAPTER_BOUNDS[chapterIndex] ?? 0) + 2) / (TOTAL_FRAMES - 1);
    const desiredTop = vh * 0.8 - p * span;
    window.scrollTo({ top: window.scrollY + rect.top - desiredTop, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const win = windowRef.current;
    const hero = heroRef.current;
    if (!canvas || !win || !hero) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fonts: FrameFonts = {
      sans: "var(--font-geist-sans), system-ui, sans-serif",
      mono: "var(--font-geist-mono), monospace",
    };

    const state = {
      targetFrame: 0,
      smoothFrame: 0,
      drawnFrame: -1,
      targetEnter: 0,
      smoothEnter: 0,
      heroFade: 0,
      width: 0,
      height: 0,
      dpr: 1,
      running: false,
      rafId: 0,
    };

    const measure = () => {
      const vh = window.innerHeight;
      const rect = win.getBoundingClientRect();

      state.targetEnter = clamp01((vh - rect.top) / (vh * 0.85));

      const span = sequenceSpan(rect.height, vh);
      const p = clamp01((vh * 0.8 - rect.top) / span);
      state.targetFrame = p * (TOTAL_FRAMES - 1);

      state.heroFade = clamp01(window.scrollY / (vh * 0.75));
    };

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w !== state.width || h !== state.height || dpr !== state.dpr) {
        state.width = w;
        state.height = h;
        state.dpr = dpr;
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        state.drawnFrame = -1;
      }
    };

    const tick = () => {
      const k = reduceMotion ? 1 : 0.11;

      const df = state.targetFrame - state.smoothFrame;
      state.smoothFrame = Math.abs(df) < 0.01 ? state.targetFrame : state.smoothFrame + df * k;

      const de = state.targetEnter - state.smoothEnter;
      state.smoothEnter = Math.abs(de) < 0.0005 ? state.targetEnter : state.smoothEnter + de * k;

      const hf = state.heroFade;
      hero.style.transform = `translate3d(0, ${hf * -90}px, 0) scale(${1 - hf * 0.04})`;
      hero.style.opacity = String(1 - hf * 0.9);

      const e = easeOut(state.smoothEnter);
      win.style.transform = `translate3d(0, ${(1 - e) * 80}px, 0) rotateX(${(1 - e) * 16}deg) scale(${0.9 + e * 0.1})`;
      win.style.opacity = String(0.35 + e * 0.65);

      const f = state.smoothFrame;
      if (Math.abs(f - state.drawnFrame) > 0.02) {
        resizeCanvas();
        renderFrame(ctx, f, { width: state.width, height: state.height, dpr: state.dpr }, fonts, {
          transparent: true,
        });
        state.drawnFrame = f;

        const rounded = Math.round(f);
        const chapter = chapterAt(rounded);
        if (frameLabelRef.current) frameLabelRef.current.textContent = String(rounded).padStart(3, "0");
        if (chapterPctRef.current)
          chapterPctRef.current.textContent = `${Math.round(chapterProgress(rounded, chapter) * 100)}%`;
        if (resilienceRef.current) {
          const score = resilienceAt(rounded);
          resilienceRef.current.textContent = `${score}%`;
          resilienceRef.current.dataset.ok = score >= 90 ? "true" : "false";
        }
        if (railFillRef.current) railFillRef.current.style.transform = `scaleX(${f / (TOTAL_FRAMES - 1)})`;
        if (chapter !== activeChapterRef.current) {
          activeChapterRef.current = chapter;
          setActiveChapter(chapter);
        }
      }

      const settled =
        state.smoothFrame === state.targetFrame && state.smoothEnter === state.targetEnter;
      if (settled) {
        state.running = false;
      } else {
        state.rafId = requestAnimationFrame(tick);
      }
    };

    const wake = () => {
      measure();
      if (!state.running) {
        state.running = true;
        state.rafId = requestAnimationFrame(tick);
      }
    };

    const onResize = () => {
      state.drawnFrame = -1;
      wake();
    };

    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(onResize);
    wake();

    return () => {
      cancelAnimationFrame(state.rafId);
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <>
      {/* 1. Hero plein écran posé directement sur la vidéo */}
      <section className="relative min-h-[100svh] flex items-center justify-center px-6 pt-28 pb-24">
        <div ref={heroRef} className="relative max-w-5xl mx-auto text-center will-change-transform">
          <div
            className="intro inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-abyss/60 border border-brand/30 text-xs text-brand-soft mb-8 backdrop-blur-sm"
            style={{ "--i": 0 } as React.CSSProperties}
          >
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
            <span className="font-mono">
              Collaboration Architecturale · Versioning Git · Serveur MCP &amp; Orion
            </span>
          </div>

          <h1
            className="intro font-bold tracking-tight text-white leading-[1.04] text-[clamp(2.5rem,6vw,5.25rem)] max-w-[16ch] sm:max-w-[19ch] mx-auto"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            Modélisez, versionnez et implémentez vos{" "}
            <span className="text-hero">architectures</span> en équipe
          </h1>

          <p
            className="intro mt-7 text-base sm:text-lg text-mist/75 max-w-2xl mx-auto leading-relaxed"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            Concevez vos systèmes à plusieurs, laissez l&apos;IA scanner votre stack et générer la
            documentation, forkez des sous-graphes communautaires et implémentez directement via{" "}
            <strong className="text-white font-semibold">MCP</strong>,{" "}
            <strong className="text-white font-semibold">Orion</strong> et{" "}
            <strong className="text-white font-semibold">GitHub Releases</strong>.
          </p>

          <div
            className="intro mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            style={{ "--i": 3 } as React.CSSProperties}
          >
            <Link
              href="/dashboard"
              className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-sm bg-amber text-abyss hover:bg-[#ff951a] transition-colors shadow-lg shadow-amber/25 flex items-center justify-center gap-2"
            >
              <Play size={16} weight="fill" />
              <span>Accéder à ma Bibliothèque</span>
            </Link>
            <Link
              href="/palabre"
              className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-sm bg-abyss/50 backdrop-blur-sm hover:bg-navy/60 text-mist transition-colors border border-line-strong flex items-center justify-center gap-2"
            >
              <span>Explorer les Templates</span>
              <ArrowRight size={16} />
            </Link>
          </div>

          <p
            className="intro mt-6 text-xs text-mist/60 flex items-center justify-center gap-2"
            style={{ "--i": 4 } as React.CSSProperties}
          >
            <ShieldCheck size={15} className="text-mint" weight="fill" />
            <span>
              Espaces publics &amp; privés façon Git · Fork partiel ou complet · Revues type Pull Request
            </span>
          </p>
        </div>

        {/* Indicateur de scroll */}
        <div
          className="intro absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[11px] font-mono text-mist/50"
          style={{ "--i": 6 } as React.CSSProperties}
        >
          <span>Faites défiler</span>
          <span className="scroll-cue w-8 h-8 rounded-full border border-line-strong flex items-center justify-center">
            <ArrowDown size={14} />
          </span>
        </div>
      </section>

      {/* 2. Fenêtre LONKOO Studio : l'architecture flotte au-dessus de la vidéo */}
      <section ref={stageRef} className="relative px-3 sm:px-6 pb-28 [perspective:1600px]">
        {/* Halo de marque derrière la fenêtre */}
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-24 -translate-x-1/2 w-[80%] h-[60%] rounded-full bg-brand/25 blur-[120px] pointer-events-none"
        />

        <div
          ref={windowRef}
          className="relative mx-auto w-full max-w-[1320px] h-[68vh] min-h-[460px] max-h-[820px] rounded-[28px] overflow-hidden flex flex-col will-change-transform [transform-origin:50%_0%] border border-white/[0.09] bg-[#04111d]/45 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.06)]"
          style={{ opacity: 0.35 }}
        >
          {/* Liseré lumineux supérieur */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-soft/70 to-transparent z-20"
          />

          {/* Barre supérieure */}
          <div className="h-12 bg-[#04111d]/55 backdrop-blur-md border-b border-white/[0.07] px-5 flex items-center justify-between whitespace-nowrap gap-4 z-10 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
              </div>
              <div className="h-4 w-px bg-line" />
              <div className="text-xs font-mono text-brand-soft truncate">
                lonkoo-org / payment-mesh-core <span className="text-muted">·</span>{" "}
                <span className="text-ice">tag v2.4.0</span>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-1">
              {CHAPTERS.map((ch) => {
                const active = activeChapter === ch.id;
                const Icon = ch.icon;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => seekToChapter(ch.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors duration-300 flex items-center gap-1.5 ${
                      active ? "bg-brand text-white" : "text-muted hover:text-mist hover:bg-white/5"
                    }`}
                  >
                    <Icon size={14} weight={active ? "bold" : "regular"} />
                    <span>{ch.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-xs font-mono bg-abyss/60 px-3 py-1 rounded-lg border border-line">
              <span className="text-muted hidden sm:inline">Score IA</span>
              <span
                ref={resilienceRef}
                data-ok="false"
                className="font-semibold text-amber data-[ok=true]:text-mint transition-colors duration-500"
              >
                71%
              </span>
            </div>
          </div>

          {/* Canvas transparent : la vidéo reste visible sous le schéma */}
          <div className="relative flex-1 min-h-0">
            <canvas
              ref={canvasRef}
              aria-label="Séquence animée : modélisation collaborative, scanner IA, documentation et implémentation MCP"
              role="img"
              className="absolute inset-0 w-full h-full block"
            />
          </div>

          {/* Barre inférieure */}
          <div className="h-10 bg-[#04111d]/55 backdrop-blur-md border-t border-white/[0.07] px-5 flex items-center justify-between text-xs text-muted font-mono z-10 flex-shrink-0">
            <span>
              Frame <span ref={frameLabelRef} className="text-brand-soft font-semibold">000</span> / {TOTAL_FRAMES}
            </span>
            <span className="hidden sm:inline text-[11px]">
              Collaboration CRDT · Versioning de Stack · Serveur MCP &amp; Orion
            </span>
            <span>
              <span className="text-ice font-semibold">{CHAPTERS[activeChapter]?.label}</span>{" "}
              <span ref={chapterPctRef}>0%</span>
            </span>
          </div>
        </div>

        {/* Rail des chapitres sous la fenêtre */}
        <div className="relative mx-auto max-w-[1320px] mt-10">
          <div className="h-px bg-white/10 overflow-hidden rounded-full">
            <div
              ref={railFillRef}
              className="h-full bg-gradient-to-r from-brand to-brand-soft origin-left"
              style={{ transform: "scaleX(0)" }}
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">
            {CHAPTERS.map((ch) => {
              const active = activeChapter === ch.id;
              const done = activeChapter > ch.id;
              const Icon = ch.icon;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => seekToChapter(ch.id)}
                  className={`text-left transition-all duration-500 ${
                    active ? "opacity-100 translate-y-0" : done ? "opacity-60" : "opacity-35"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Icon size={16} className={active ? "text-brand-soft" : "text-muted"} />
                    <span className="font-mono text-[11px] text-muted">0{ch.id + 1}</span>
                    <span>{ch.label}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-mist/60 leading-relaxed">{ch.text}</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
