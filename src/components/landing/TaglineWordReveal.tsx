"use client";

import React, { useEffect, useRef } from "react";

const METRICS = [
  {
    value: 1420,
    decimals: 0,
    suffix: "+",
    label: "Architectures & sous-graphes publiés, notés et forkables par la communauté",
    color: "text-brand-soft",
  },
  {
    value: 100,
    decimals: 0,
    suffix: "%",
    label: "Synchronisation bidirectionnelle entre versions d'architecture et GitHub Releases",
    color: "text-mint",
  },
  {
    value: 4.9,
    decimals: 1,
    suffix: " / 5",
    label: "Précision du scanner IA sur la cohérence de stack et la détection de goulots",
    color: "text-amber",
  },
  {
    value: 2,
    decimals: 0,
    suffix: " modes",
    label: "Implémentation directe : Serveur MCP pour agents IA ou constructeur Orion",
    color: "text-brand-soft",
  },
] as const;

const LINE_ONE = "Vos schémas d'architecture ne doivent plus finir oubliés dans un document statique.".split(" ");
const LINE_TWO = "Chaque brique modélisée dans LONKOO est versionnée avec Git, documentée par IA et prête à être implémentée via MCP ou Orion.".split(" ");
const HIGHLIGHTS = new Set(["LONKOO", "Git,", "IA", "MCP", "Orion."]);
const WORDS = [...LINE_ONE, ...LINE_TWO];

const formatFr = (v: number, decimals: number) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export function TaglineWordReveal() {
  const taglineRef = useRef<HTMLDivElement>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const metricRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const metricsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = taglineRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let target = 0;
    let smooth = 0;
    let lit = -1;
    let rafId = 0;
    let running = false;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      target = Math.min(1, Math.max(0, (vh * 0.85 - rect.top) / (vh * 0.6 + rect.height * 0.4)));
    };

    const paint = () => {
      const count = Math.round(smooth * WORDS.length);
      if (count === lit) return;
      lit = count;
      wordRefs.current.forEach((w, i) => {
        if (w) w.dataset.on = i < count ? "true" : "false";
      });
    };

    const tick = () => {
      const d = target - smooth;
      smooth = reduce || Math.abs(d) < 0.001 ? target : smooth + d * 0.14;
      paint();
      if (smooth !== target) rafId = requestAnimationFrame(tick);
      else running = false;
    };

    const wake = () => {
      measure();
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(tick);
      }
    };

    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
    wake();
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
    };
  }, []);

  useEffect(() => {
    const el = metricsRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let rafId = 0;

    const run = () => {
      const start = performance.now();
      const duration = reduce ? 0 : 1600;
      const step = (now: number) => {
        const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
        const e = 1 - Math.pow(1 - t, 4);
        METRICS.forEach((m, i) => {
          const node = metricRefs.current[i];
          if (node) node.textContent = formatFr(m.value * e, m.decimals) + m.suffix;
        });
        if (t < 1) rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          run();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);

  let wordIndex = 0;
  const renderLine = (words: string[]) =>
    words.map((word) => {
      const i = wordIndex++;
      return (
        <span
          key={i}
          ref={(node) => {
            wordRefs.current[i] = node;
          }}
          data-on="false"
          className={`inline-block mr-[0.28em] transition-[color,opacity] duration-500 ease-out opacity-25 text-mist data-[on=true]:opacity-100 ${
            HIGHLIGHTS.has(word) ? "data-[on=true]:text-brand-soft" : "data-[on=true]:text-white"
          }`}
        >
          {word}
        </span>
      );
    });

  return (
    <section className="relative text-mist py-24 px-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-transparent via-[#04111d]/55 to-[#04111d]/30 pointer-events-none"
      />

      <div className="relative max-w-5xl mx-auto">
        <div
          ref={metricsRef}
          className="reveal grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 rounded-2xl p-6 sm:p-8 bg-[#04111d]/55 border border-white/[0.08] backdrop-blur-md"
        >
          {METRICS.map((item, idx) => (
            <div
              key={item.label}
              className={
                idx < METRICS.length - 1
                  ? "border-b sm:border-b-0 lg:border-r border-white/[0.08] pb-6 sm:pb-0 lg:pr-6"
                  : ""
              }
            >
              <span
                ref={(node) => {
                  metricRefs.current[idx] = node;
                }}
                className={`block text-3xl sm:text-4xl font-bold font-mono tabular-nums ${item.color}`}
              >
                {formatFr(0, item.decimals) + item.suffix}
              </span>
              <p className="mt-2 text-xs text-mist/60 leading-relaxed">{item.label}</p>
            </div>
          ))}
        </div>

        <div ref={taglineRef} className="py-28 text-center max-w-[840px] mx-auto">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-[1.22] tracking-tight">
            <span className="block mb-6">{renderLine(LINE_ONE)}</span>
            <span className="block">{renderLine(LINE_TWO)}</span>
          </h2>
        </div>
      </div>
    </section>
  );
}
