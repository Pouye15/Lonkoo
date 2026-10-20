"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowsInSimple,
  ArrowsOutSimple,
  CaretDoubleLeft,
  CaretDoubleRight,
  Compass,
  Folders,
  GearSix,
  GitPullRequest,
  List,
  RocketLaunch,
  SlidersHorizontal,
  X,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { ARCHITECTURE_REVIEWS } from "@/lib/lonkoo-data";
import { useSession } from "@/lib/session";
import { useWorkspace } from "@/lib/workspace";
import { Logo, LogoMark } from "@/components/ui/Logo";
import { usePersistentFlag } from "@/components/ui/use-persistent-flag";
import { ThemeSegmented } from "@/components/theme/ThemeToggle";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { UserMenu } from "./UserMenu";
import { ShellContext, type ShellContextValue } from "./shell-context";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  /** Le lien conserve le projet actif (?project=…). */
  scoped?: boolean;
  count?: number;
}

const OPEN_REVIEWS = ARCHITECTURE_REVIEWS.filter((review) => review.status === "open").length;

const NAV_GROUPS: ReadonlyArray<{ title: string; items: NavItem[] }> = [
  {
    title: "Espace de travail",
    items: [
      { label: "Projets", href: "/dashboard", icon: Folders },
      { label: "Studio", href: "/studio", icon: SlidersHorizontal, scoped: true },
      { label: "Revues", href: "/reviews", icon: GitPullRequest, count: OPEN_REVIEWS },
    ],
  },
  { title: "Réseau", items: [{ label: "Communauté", href: "/palabre", icon: Compass }] },
  {
    title: "Ingénierie",
    items: [
      { label: "Déploiement", href: "/deploy", icon: RocketLaunch, scoped: true },
      { label: "Paramètres", href: "/settings", icon: GearSix },
    ],
  },
];

/** Pages rattachées à un projet : le fil d'Ariane affiche alors le projet actif. */
const PROJECT_ROUTES = ["/studio", "/deploy", "/reviews"];

export function ShellLoader() {
  return (
    <div className="grid h-dvh place-items-center bg-canvas" role="status" aria-label="Chargement">
      <LogoMark size={36} className="animate-pulse" />
    </div>
  );
}

function NavLink({
  item,
  href,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  href: string;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group flex items-center rounded-lg text-sm font-medium transition-colors",
        collapsed ? "h-10 justify-center" : "justify-between gap-2.5 px-2.5 py-2",
        active ? "bg-brand text-white" : "text-ink-2 hover:bg-subtle hover:text-ink",
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon size={18} weight={active ? "fill" : "regular"} className="flex-shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </span>
      {!collapsed && item.count !== undefined && item.count > 0 && (
        <span
          className={cn(
            "rounded px-1.5 font-mono text-[11px] font-semibold leading-5",
            active ? "bg-white text-brand" : "bg-subtle text-ink-2",
          )}
        >
          {item.count}
        </span>
      )}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const { status, user } = useSession();
  const { activeProject, setActiveProjectSlug } = useWorkspace();

  const [collapsed, setCollapsed] = usePersistentFlag("lonkoo.sidebar.collapsed", false);
  const [bubble, setBubble] = usePersistentFlag("lonkoo.navbar.bubble", false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [fullBleed, setFullBleed] = useState(false);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);

  // Garde d'accès : sans session, retour à la connexion puis à la page demandée.
  const query = search.toString();
  useEffect(() => {
    if (status !== "anonymous") return;
    const target = pathname + (query ? `?${query}` : "");
    router.replace(`/login?next=${encodeURIComponent(target)}`);
  }, [status, pathname, query, router]);

  // Le projet de l'URL (?project=…) devient le projet actif.
  const urlProject = search.get("project");
  useEffect(() => {
    if (urlProject) setActiveProjectSlug(urlProject);
  }, [urlProject, setActiveProjectSlug]);

  const shell = useMemo<ShellContextValue>(
    () => ({ actionsHost, setTitle, setFullBleed }),
    [actionsHost],
  );

  if (status !== "authenticated" || !user) return <ShellLoader />;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const hrefFor = (item: NavItem) =>
    item.scoped && activeProject ? `${item.href}?project=${activeProject.slug}` : item.href;

  const projectRoute = PROJECT_ROUTES.some((route) => pathname.startsWith(route));
  const namespace = activeProject?.githubRepo.split("/")[0] ?? user.login;

  const breadcrumb = (
    <nav aria-label="Fil d'Ariane" className="flex min-w-0 items-center gap-1.5 text-sm">
      {projectRoute && activeProject && (
        <>
          <span className="hidden font-mono text-ink-3 sm:inline">{namespace}</span>
          <span className="hidden text-ink-4 sm:inline">/</span>
          <span className="truncate font-mono font-medium text-ink">{activeProject.name}</span>
          {title && <span className="text-ink-4">/</span>}
        </>
      )}
      {title && <h1 className="truncate text-sm font-semibold text-ink">{title}</h1>}
    </nav>
  );

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
        {mobileOpen && (
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-scrim lg:hidden"
          />
        )}

        {/* Barre latérale */}
        <aside
          className={cn(
            "fixed left-0 top-0 z-50 flex h-dvh flex-shrink-0 flex-col border-r border-edge bg-surface transition-[transform,width] duration-200 lg:static",
            collapsed ? "lg:w-[4.5rem]" : "lg:w-64",
            "w-64",
            mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-3">
            <div className={cn("flex h-9 items-center", collapsed ? "justify-center" : "justify-between px-1")}>
              <Logo href="/dashboard" markOnly={collapsed} />
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label="Replier le menu"
                  className="hidden h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-subtle hover:text-ink lg:flex"
                >
                  <CaretDoubleLeft size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Fermer le menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 hover:bg-subtle lg:hidden"
              >
                <X size={16} />
              </button>
            </div>

            <ProjectSwitcher collapsed={collapsed} />

            <nav aria-label="Navigation principale" className="-mx-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-1">
              {NAV_GROUPS.map((group) => (
                <div key={group.title}>
                  {!collapsed && (
                    <div className="mb-1.5 px-2.5 text-xs font-medium text-ink-3">{group.title}</div>
                  )}
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.href}
                        item={item}
                        href={hrefFor(item)}
                        active={isActive(item.href)}
                        collapsed={collapsed}
                        onNavigate={() => setMobileOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>

          <div className="space-y-2 border-t border-edge p-3">
            {collapsed ? (
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                aria-label="Déplier le menu"
                title="Déplier le menu"
                className="hidden h-9 w-full items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-subtle hover:text-ink lg:flex"
              >
                <CaretDoubleRight size={14} />
              </button>
            ) : (
              <ThemeSegmented compact />
            )}
            <UserMenu collapsed={collapsed} />
          </div>
        </aside>

        {/* Zone principale */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {bubble ? (
            <div className="absolute left-3 top-3 z-40 flex max-w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-full border border-edge bg-surface py-1.5 pl-2 pr-1.5 shadow-pop sm:left-4">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Ouvrir le menu"
                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-2 hover:bg-subtle lg:hidden"
              >
                <List size={16} />
              </button>
              <Link href="/dashboard" aria-label="LONKOO, projets" className="hidden flex-shrink-0 lg:block">
                <LogoMark size={22} />
              </Link>
              <div className="min-w-0">{breadcrumb}</div>
              <button
                type="button"
                onClick={() => setBubble(false)}
                aria-label="Déplier la barre de navigation"
                title="Déplier la barre de navigation"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
              >
                <ArrowsOutSimple size={14} weight="bold" />
              </button>
            </div>
          ) : (
            <header className="z-30 flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-edge bg-surface px-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  aria-label="Ouvrir le menu"
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-edge text-ink-2 hover:bg-subtle lg:hidden"
                >
                  <List size={18} />
                </button>
                {breadcrumb}
              </div>

              <div className="flex flex-shrink-0 items-center gap-2">
                <div ref={setActionsHost} className="flex items-center gap-2" />
                <button
                  type="button"
                  onClick={() => setBubble(true)}
                  title="Réduire la barre en bulle"
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-edge px-2.5 text-xs font-medium text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
                >
                  <ArrowsInSimple size={14} />
                  <span className="hidden xl:inline">Réduire</span>
                </button>
              </div>
            </header>
          )}

          <main id="contenu" className={cn("min-h-0 flex-1", fullBleed ? "overflow-hidden" : "overflow-y-auto")}>
            <div className={cn(fullBleed ? "h-full p-2 sm:p-3" : "p-4 sm:p-6 lg:p-8", bubble && !fullBleed && "pt-16 sm:pt-16 lg:pt-16")}>
              {children}
            </div>
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
