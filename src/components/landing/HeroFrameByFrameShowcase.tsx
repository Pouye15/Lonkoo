"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CORE_STUDIO_NODES } from "@/lib/lonkoo-data";
import {
  IconBolt,
  IconCheckCircle,
  IconCloudUpload,
  IconCompass,
  IconCpu,
  IconDatabase,
  IconPlay,
  IconRouter,
  IconShieldCheck,
} from "@/components/icons/LonkooIcons";

export function HeroFrameByFrameShowcase() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [smoothProgress, setSmoothProgress] = useState(0);
  const [redisRedundancyApplied, setRedisRedundancyApplied] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("edge-gateway");

  useEffect(() => {
    let target = 0;
    let current = 0;
    let rafId = 0;

    const computeTarget = () => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const totalScrollable = Math.max(
        1,
        trackRef.current.offsetHeight - window.innerHeight
      );
      const scrolled = Math.max(0, -rect.top);
      target = Math.min(1, Math.max(0, scrolled / totalScrollable));
    };

    const tick = () => {
      computeTarget();
      const diff = target - current;
      if (Math.abs(diff) > 0.0005) {
        current += diff * 0.085;
        setSmoothProgress(current);
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  // Smooth Outcrowd-style wide expansion & 3D flattening
  const expandEase = 1 - Math.pow(1 - smoothProgress, 2.6);
  const showcaseWidthVw = 74 + expandEase * 20; // 74vw -> 94vw wide screen
  const rotateXDeg = (1 - expandEase) * 7.5; // 7.5deg -> 0deg
  const scaleVal = 0.95 + expandEase * 0.05; // 0.95 -> 1.0

  // Smooth resilience score progression (78 -> 94, or 99 if redundancy applied)
  const baseScore = Math.round(78 + expandEase * 16);
  const resilienceScore = redisRedundancyApplied ? 99 : baseScore;

  // Smooth collaborator cursor trajectories
  const aminataX = 18 + Math.sin(expandEase * Math.PI) * 16;
  const aminataY = 22 + expandEase * 18;
  const koffiX = 64 - expandEase * 18;
  const koffiY = 72 - Math.sin(expandEase * Math.PI) * 14;

  const renderNodeIcon = (role: string) => {
    switch (role) {
      case "gateway":
        return <IconRouter className="w-4 h-4 text-[#00E5FF]" />;
      case "auth":
        return <IconShieldCheck className="w-4 h-4 text-[#00E5FF]" />;
      case "database":
        return <IconDatabase className="w-4 h-4 text-[#00E5FF]" />;
      default:
        return <IconBolt className="w-4 h-4 text-[#00E5FF]" />;
    }
  };

  return (
    <section
      ref={trackRef}
      className="relative min-h-[215vh] bg-[#061826] grid-pattern pt-36 pb-20"
    >
      {/* Ambient Deep Glows (Variant 3) */}
      <div className="pointer-events-none absolute top-28 left-1/2 -translate-x-1/2 w-[640px] h-[520px] bg-[#00E5FF]/8 rounded-full blur-[130px]" />
      <div className="pointer-events-none absolute top-64 right-12 w-[380px] h-[380px] bg-[#FF6B00]/8 rounded-full blur-[110px]" />

      {/* Top Hero Copy */}
      <div className="max-w-5xl mx-auto px-4 text-center relative z-10">
        <div className="inline-flex items-center gap-2.5 glass-panel px-4 py-1.5 rounded-full mb-8 text-xs text-[#00E5FF]">
          <span className="w-2 h-2 rounded-full bg-[#00E5FF] animate-pulse" />
          <span>
            Infrastructure souveraine Systalink Dakar active · Latence 11.4 ms
          </span>
        </div>

        <h1 className="max-w-[780px] mx-auto text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-[1.08]">
          Concevez, validez et déployez vos architectures cloud en{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00E5FF] via-white to-[#FF6B00]">
            Afrique
          </span>
        </h1>

        <p className="max-w-[660px] mx-auto text-base md:text-lg text-[#94A3B8] mt-6 leading-relaxed">
          LONKOO unit la modélisation collaborative en temps réel, l&apos;audit
          de résilience par le copilote Nianthio et le déploiement direct sur
          les serveurs souverains Systalink à Dakar.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/studio"
            className="w-full sm:w-auto bg-gradient-to-r from-[#FF6B00] to-[#ff8c3b] hover:opacity-95 text-white font-semibold px-8 py-4 rounded-2xl shadow-xl shadow-[#FF6B00]/25 transition-all flex items-center justify-center gap-2.5"
          >
            <IconPlay className="w-4 h-4" />
            <span>Ouvrir LONKOO Studio gratuitement</span>
          </Link>
          <Link
            href="/palabre"
            className="w-full sm:w-auto glass-panel text-[#00E5FF] hover:bg-[#00E5FF]/10 font-semibold px-8 py-4 rounded-2xl transition-all flex items-center justify-center gap-2.5 border border-[#00E5FF]/30"
          >
            <IconCompass className="w-4 h-4" />
            <span>Explorer La Palabre Tech</span>
          </Link>
        </div>

        <p className="text-xs text-[#94A3B8] mt-5 flex items-center justify-center gap-2">
          <IconCheckCircle className="w-3.5 h-3.5 text-[#00E5FF]" />
          <span>
            Plan gratuit sans carte bancaire · Synchronisation GitHub et GitLab
            native · Mode hors ligne inclus
          </span>
        </p>
      </div>

      {/* Sticky Wide-Expanding Studio Showcase (Outcrowd + GitHub smooth physics) */}
      <div className="sticky top-20 z-20 mt-14 flex flex-col items-center px-3 sm:px-6">
        <div
          style={{
            width: `min(${showcaseWidthVw.toFixed(2)}vw, 1520px)`,
            transform: `perspective(1400px) rotateX(${rotateXDeg.toFixed(
              2
            )}deg) scale(${scaleVal.toFixed(3)})`,
            transformOrigin: "center top",
            willChange: "width, transform",
          }}
          className="rounded-3xl glass-panel p-5 sm:p-6 neomorphic-glow text-left transition-shadow duration-500"
        >
          {/* Window Top Bar */}
          <div className="flex flex-wrap items-center justify-between pb-4 mb-5 border-b border-white/10 gap-4">
            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-green-500/80 inline-block" />
              </div>
              <div className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-2 text-xs font-mono text-[#00E5FF]">
                <span>dakar-fintech / passerelle-mobile-money</span>
                <span className="text-white/30">·</span>
                <span className="text-[#A6F5C0]">main</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30 px-3 py-1.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-pulse" />
                <span>Synchronisé · Mode Hors Ligne Prêt</span>
              </span>
              <Link
                href="/deploy"
                className="px-4 py-1.5 bg-gradient-to-r from-[#FF6B00] to-[#ff8c3b] hover:opacity-95 text-white rounded-xl text-xs font-semibold shadow-md flex items-center gap-1.5"
              >
                <IconCloudUpload className="w-3.5 h-3.5" />
                <span>Déployer sur Systalink Dakar</span>
              </Link>
            </div>
          </div>

          {/* Studio 4-Column Interior */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-[430px]">
            {/* Left 3 Cols: Dark Tissage Canvas */}
            <div className="lg:col-span-3 rounded-2xl bg-[#04101a]/90 border border-white/10 p-6 relative grid-pattern-dense flex flex-col justify-between overflow-hidden">
              {/* Animated SVG Connection Beams between the 4 nodes */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none z-0"
                viewBox="0 0 800 420"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient
                    id="beamCyan"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="rgba(0, 229, 255, 0.15)" />
                    <stop offset="50%" stopColor="rgba(0, 229, 255, 0.85)" />
                    <stop offset="100%" stopColor="rgba(255, 107, 0, 0.65)" />
                  </linearGradient>
                </defs>
                {/* Horizontal Top Link */}
                <path
                  d="M 260 125 C 360 125, 440 125, 540 125"
                  fill="none"
                  stroke="rgba(0, 229, 255, 0.16)"
                  strokeWidth="2"
                />
                <path
                  d="M 260 125 C 360 125, 440 125, 540 125"
                  fill="none"
                  stroke="url(#beamCyan)"
                  strokeWidth="2.5"
                  strokeDasharray="16 24"
                  strokeDashoffset={-smoothProgress * 220}
                />
                {/* Horizontal Bottom Link */}
                <path
                  d="M 260 285 C 360 285, 440 285, 540 285"
                  fill="none"
                  stroke="rgba(0, 229, 255, 0.16)"
                  strokeWidth="2"
                />
                <path
                  d="M 260 285 C 360 285, 440 285, 540 285"
                  fill="none"
                  stroke="url(#beamCyan)"
                  strokeWidth="2.5"
                  strokeDasharray="16 24"
                  strokeDashoffset={-smoothProgress * 260}
                />
                {/* Diagonal Cross Link */}
                <path
                  d="M 260 135 C 380 180, 420 230, 540 275"
                  fill="none"
                  stroke="rgba(166, 245, 192, 0.18)"
                  strokeWidth="1.75"
                  strokeDasharray="6 8"
                  strokeDashoffset={-smoothProgress * 180}
                />
              </svg>

              {/* Smooth Damped Multiplayer Cursors */}
              <div
                style={{
                  transform: `translate3d(${aminataX}px, ${aminataY}px, 0)`,
                }}
                className="absolute top-3 left-1/4 z-20 flex items-center gap-1.5 bg-[#00E5FF] text-[#061826] font-bold text-[10px] px-2.5 py-1 rounded-full shadow-lg pointer-events-none"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#061826]" />
                <span>Aminata · Architecte</span>
              </div>

              <div
                style={{
                  transform: `translate3d(${-koffiX * 0.4}px, ${
                    -koffiY * 0.25
                  }px, 0)`,
                }}
                className="absolute bottom-12 right-1/4 z-20 flex items-center gap-1.5 bg-[#FF6B00] text-white font-bold text-[10px] px-2.5 py-1 rounded-full shadow-lg pointer-events-none"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                <span>Koffi · DevOps</span>
              </div>

              {/* 4 Clean Architecture Nodes (Variant 3 exact cards) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 relative z-10 my-auto py-4">
                {CORE_STUDIO_NODES.map((node, index) => {
                  const isSelected = selectedNodeId === node.id;
                  const isLeft = index % 2 === 0;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`glass-card rounded-2xl p-5 text-left relative group transition-all ${
                        isSelected
                          ? "border-[#00E5FF]/50 shadow-[0_0_30px_rgba(0,229,255,0.14)]"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          {renderNodeIcon(node.role)}
                          <span className="font-semibold text-sm text-white">
                            {node.title}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono bg-[#00E5FF]/10 text-[#00E5FF] px-2 py-0.5 rounded border border-[#00E5FF]/20">
                          {node.id === "redis-async" && redisRedundancyApplied
                            ? "Redis Sentinel HA"
                            : node.tech}
                        </span>
                      </div>

                      <p className="text-xs text-[#94A3B8] leading-relaxed">
                        {node.description}
                      </p>

                      <div className="mt-4 flex items-center justify-between text-[11px] text-[#00E5FF] font-mono">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF]" />
                          <span>{node.status}</span>
                        </span>
                        <span>
                          {node.metricLabel}: {node.metricValue}
                        </span>
                      </div>

                      {/* Connection Port Dot */}
                      <div
                        className={`hidden md:block absolute ${
                          isLeft ? "-right-1.5" : "-left-1.5"
                        } top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#00E5FF] border-2 border-[#061826]`}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Bottom Canvas Status Strip */}
              <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between text-xs text-[#94A3B8] gap-2 relative z-10">
                <span className="font-mono text-[11px]">
                  Grille Tissage active (16px) · Nœud actif:{" "}
                  <strong className="text-[#00E5FF]">{selectedNodeId}</strong>
                </span>
                <span className="font-mono text-[11px]">
                  Expansion viewport: {Math.round(74 + expandEase * 26)}% · CRDT
                  Engine v4.2
                </span>
              </div>
            </div>

            {/* Right 1 Col: Copilote IA Nianthio Inspector */}
            <div className="glass-card rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                  <div className="flex items-center gap-2">
                    <IconCpu className="w-4 h-4 text-[#00E5FF]" />
                    <span className="font-semibold text-sm text-white">
                      Copilote IA Nianthio
                    </span>
                  </div>
                  <span className="text-[10px] font-mono bg-[#00E5FF]/20 text-[#00E5FF] px-2.5 py-0.5 rounded-full border border-[#00E5FF]/30">
                    Actif
                  </span>
                </div>

                {/* Resilience Score */}
                <div className="bg-[#061826] p-3.5 rounded-xl border border-white/10 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-[#94A3B8]">
                      Score de résilience
                    </span>
                    <span className="text-sm font-bold font-mono text-[#00E5FF]">
                      {resilienceScore}/100
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${resilienceScore}%` }}
                      className="h-full bg-gradient-to-r from-[#00E5FF] to-[#A6F5C0] transition-all duration-300"
                    />
                  </div>
                </div>

                {/* Clean Diagnostics Items */}
                <div className="space-y-3 mb-4">
                  <div className="text-xs bg-white/5 border border-white/10 p-3 rounded-xl">
                    <div className="flex items-start gap-2.5">
                      <IconShieldCheck className="w-4 h-4 text-[#00E5FF] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-white">
                          Conformité données
                        </p>
                        <p className="text-[11px] text-[#94A3B8] mt-0.5">
                          CDP Sénégal &amp; RGPD validée sans anomalie.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs bg-white/5 border border-white/10 p-3 rounded-xl">
                    <div className="flex items-start gap-2.5">
                      <IconDatabase className="w-4 h-4 text-[#FF6B00] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-white">
                          Estimation VPS Systalink
                        </p>
                        <p className="text-[11px] text-[#00E5FF] font-mono mt-0.5">
                          {redisRedundancyApplied
                            ? "22 000 FCFA / mois (HA)"
                            : "18 500 FCFA / mois"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setRedisRedundancyApplied((prev) => !prev)}
                className={`w-full py-3 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 shadow-md ${
                  redisRedundancyApplied
                    ? "bg-[#A6F5C0]/15 text-[#A6F5C0] border-[#A6F5C0]/40"
                    : "bg-[#00E5FF]/10 hover:bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/30"
                }`}
              >
                <IconBolt className="w-3.5 h-3.5" />
                <span>
                  {redisRedundancyApplied
                    ? "Redondance Redis Sentinel Active"
                    : "Appliquer la redondance Redis"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
