"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Hexagon,
  Folders,
  SlidersHorizontal,
  Compass,
  GitPullRequest,
  PlugsConnected,
  GearSix,
  UserCirclePlus,
  GitBranch,
  Tag,
  Sun,
  Moon,
  CaretLeft,
  CaretRight,
  List,
  X,
  ArrowsInSimple,
  ArrowsOutSimple,
} from "@phosphor-icons/react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  count?: number;
}

const WORKSPACE_LINKS: NavItem[] = [
  {
    label: "Projets",
    href: "/dashboard",
    icon: Folders,
  },
  {
    label: "Studio",
    href: "/studio",
    icon: SlidersHorizontal,
  },
  {
    label: "Revues & Équipe",
    href: "/reviews",
    icon: GitPullRequest,
    count: 2,
  },
];

const COMMUNITY_LINKS: NavItem[] = [
  {
    label: "Communauté & Profils",
    href: "/palabre",
    icon: Compass,
  },
];

const ENGINEERING_LINKS: NavItem[] = [
  {
    label: "Déploiement & MCP",
    href: "/deploy",
    icon: PlugsConnected,
  },
  {
    label: "Configuration initiale",
    href: "/onboarding",
    icon: UserCirclePlus,
  },
  {
    label: "Paramètres",
    href: "/settings",
    icon: GearSix,
  },
];

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  fullHeight?: boolean;
}

export function AppShell({
  children,
  title,
  actions,
  fullHeight = false,
}: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navbarBubble, setNavbarBubble] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const renderSection = (sectionTitle: string, items: NavItem[]) => (
    <div className="mb-5">
      {!collapsed && (
        <div className="px-2.5 mb-1.5 text-[11px] font-medium text-slate-400">
          {sectionTitle}
        </div>
      )}
      <div className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? item.label : undefined}
              className={`group flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                active
                  ? "bg-[#1265DD] text-white"
                  : "text-slate-600 hover:text-slate-950 hover:bg-slate-100"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon
                  size={17}
                  weight={active ? "fill" : "regular"}
                  className={
                    active
                      ? "text-white flex-shrink-0"
                      : "text-slate-500 group-hover:text-slate-900 flex-shrink-0"
                  }
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </div>

              {!collapsed && item.count !== undefined && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                    active
                      ? "bg-white text-[#1265DD]"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {item.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex overflow-x-hidden">
      {/* Overlay Mobile / Tablette */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* SIDEBAR GAUCHE */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen bg-white border-r border-slate-200 flex flex-col justify-between transition-all duration-200 flex-shrink-0 ${
          collapsed ? "w-16" : "w-60"
        } ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-3.5 flex flex-col flex-1 min-h-0">
          {/* Logo */}
          <div className="flex items-center justify-between gap-2 mb-5 pb-3 border-b border-slate-100">
            <Link href="/" className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#1265DD] flex items-center justify-center text-white flex-shrink-0">
                <Hexagon size={18} weight="fill" />
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <span className="font-bold tracking-tight text-slate-950 text-sm font-mono block truncate">
                    LONKOO
                  </span>
                </div>
              )}
            </Link>

            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
              className="hidden lg:flex w-7 h-7 rounded-md border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 items-center justify-center transition-colors cursor-pointer"
            >
              {collapsed ? <CaretRight size={13} /> : <CaretLeft size={13} />}
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Fermer le menu"
              className="lg:hidden w-7 h-7 rounded-md border border-slate-200 text-slate-500 flex items-center justify-center"
            >
              <X size={14} />
            </button>
          </div>

          {/* Contexte Dépôt Actif */}
          {!collapsed && (
            <div className="mb-5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-xs font-mono text-slate-900 mb-1">
                <span className="font-semibold truncate">payment-mesh-core</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="Synchronisé" />
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                <span className="flex items-center gap-1">
                  <GitBranch size={12} className="text-slate-400" />
                  main
                </span>
                <span className="flex items-center gap-1 text-slate-700 font-medium">
                  <Tag size={12} className="text-slate-400" />
                  v2.4.0
                </span>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto pr-0.5">
            {renderSection("Espace de travail", WORKSPACE_LINKS)}
            {renderSection("Réseau", COMMUNITY_LINKS)}
            {renderSection("Ingénierie", ENGINEERING_LINKS)}
          </nav>
        </div>

        {/* Bas de Sidebar */}
        <div className="p-3.5 border-t border-slate-200 bg-slate-50 space-y-3">
          {!collapsed && (
            <div className="grid grid-cols-2 p-0.5 rounded-lg bg-slate-200 text-[11px]">
              <button
                type="button"
                className="py-1 px-2 rounded-md bg-white text-slate-900 font-semibold flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <Sun size={12} weight="fill" className="text-[#1265DD]" />
                <span>Clair</span>
              </button>
              <button
                type="button"
                title="Thème sombre bientôt disponible"
                className="py-1 px-2 rounded-md text-slate-500 cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <Moon size={12} />
                <span>Sombre</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#1265DD] text-white font-bold text-[11px] flex items-center justify-center flex-shrink-0">
                AS
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    Aminata S.
                  </div>
                  <div className="text-[11px] text-slate-500 truncate font-mono">
                    @aminata-arch
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* ZONE PRINCIPALE */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {navbarBubble ? (
          <div className="fixed top-3 left-4 lg:left-64 z-40 bg-white px-3.5 py-2 rounded-full border border-slate-200 shadow-md flex items-center gap-2.5 text-xs">
            <Link href="/" className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md bg-[#1265DD] flex items-center justify-center text-white">
                <Hexagon size={12} weight="fill" />
              </div>
              <span className="font-bold text-slate-950 font-mono text-[11px]">LONKOO</span>
            </Link>
            <div className="h-3.5 w-px bg-slate-200" />
            <div className="flex items-center gap-1.5 font-mono text-slate-700 text-[11px] truncate max-w-[220px] sm:max-w-none">
              <span className="text-slate-400 hidden sm:inline">lonkoo-org</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <span className="font-semibold text-slate-950 truncate">payment-mesh-core</span>
              <span className="text-slate-300">·</span>
              <span className="text-[#1265DD] font-semibold">v2.4.0</span>
            </div>
            <div className="h-3.5 w-px bg-slate-200" />
            <button
              type="button"
              onClick={() => setNavbarBubble(false)}
              title="Déplier la barre de navigation"
              className="p-1 rounded-md hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              <ArrowsOutSimple size={13} weight="bold" />
            </button>
          </div>
        ) : (
          <header className="h-14 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-30 flex-shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Ouvrir le menu"
                className="lg:hidden w-8 h-8 rounded-lg border border-slate-200 text-slate-700 flex items-center justify-center hover:bg-slate-50 flex-shrink-0"
              >
                <List size={17} />
              </button>

              <div className="flex items-center gap-2 min-w-0">
                <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-slate-500">
                  <span>lonkoo-org</span>
                  <span className="text-slate-300">/</span>
                  <span className="font-semibold text-slate-900">payment-mesh-core</span>
                </div>
                {title && (
                  <>
                    <span className="hidden sm:inline text-slate-300">/</span>
                    <h1 className="text-xs sm:text-sm font-semibold text-slate-950 truncate">
                      {title}
                    </h1>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {actions}

              <button
                type="button"
                onClick={() => setNavbarBubble(true)}
                title="Réduire en bulle"
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-950 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowsInSimple size={14} />
                <span className="hidden xl:inline">Réduire</span>
              </button>
            </div>
          </header>
        )}

        {/* Corps de la page */}
        <main
          className={`flex-1 ${
            fullHeight ? "flex flex-col overflow-hidden p-2 sm:p-4" : "p-3 sm:p-6 lg:p-8"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
