import React from "react";
import {
  Bell,
  CheckCircle,
  Circle,
  CloudArrowUp,
  Cube,
  DeviceMobile,
  GitBranch,
  Receipt,
  ShieldCheck,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/cn";

function Card({
  className,
  icon: Icon,
  title,
  children,
  visual,
  delay = 0,
}: {
  className?: string;
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  visual?: React.ReactNode;
  delay?: number;
}) {
  return (
    <article
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
      className={cn("reveal flex flex-col rounded-2xl border border-edge bg-surface p-6", className)}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-subtle text-ink">
        <Icon size={20} weight="bold" />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{children}</p>
      {visual && <div className="mt-5 flex-1">{visual}</div>}
    </article>
  );
}

/** Extrait de canevas : quatre blocs reliés et deux curseurs d'équipe. */
function CanvasVisual() {
  const font = "var(--font-geist-sans), system-ui, sans-serif";
  return (
    <svg viewBox="0 0 520 190" fill="none" role="img" aria-label="Deux personnes éditent le même schéma" className="h-auto w-full">
      <g stroke="var(--edge-strong)" strokeWidth="2" strokeLinecap="round">
        <path d="M132 78H206M336 78H410M271 96C271 140 290 146 372 146" />
      </g>
      {[
        { x: 20, y: 60, w: 112, label: "Boutique web" },
        { x: 206, y: 60, w: 130, label: "API marketplace" },
        { x: 410, y: 60, w: 90, label: "Base" },
        { x: 372, y: 128, w: 128, label: "Paiement mobile" },
      ].map((node) => (
        <g key={node.label}>
          <rect x={node.x} y={node.y} width={node.w} height={36} rx={10} fill="var(--surface)" stroke="var(--edge-strong)" strokeWidth="1.5" />
          <text x={node.x + node.w / 2} y={node.y + 23} textAnchor="middle" fontSize="12.5" fontWeight="600" fill="var(--ink)" fontFamily={font}>
            {node.label}
          </text>
        </g>
      ))}
      <g>
        <path d="M150 112l0 18 5-4.5 3.8 8 3-1.4-3.8-7.6 6.6 0z" fill="#1265dd" stroke="var(--surface)" strokeWidth="1.2" />
        <rect x="168" y="132" width="62" height="20" rx="10" fill="#1265dd" />
        <text x="199" y="146" textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff" fontFamily={font}>
          Aminata
        </text>
      </g>
      <g>
        <path d="M330 6l0 18 5-4.5 3.8 8 3-1.4-3.8-7.6 6.6 0z" fill="#d97706" stroke="var(--surface)" strokeWidth="1.2" />
        <rect x="348" y="26" width="48" height="20" rx="10" fill="#d97706" />
        <text x="372" y="40" textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff" fontFamily={font}>
          Koffi
        </text>
      </g>
    </svg>
  );
}

function SuggestionVisual() {
  return (
    <div className="rounded-xl border border-edge bg-sunken p-3.5">
      <div className="flex items-center gap-2 text-sm font-semibold text-warn">
        <WarningCircle size={16} weight="fill" />
        Point de défaillance unique
      </div>
      <p className="mt-1 text-sm text-ink-2">La base reçoit tout le trafic, sans réplique.</p>
      <div className="mt-3 flex items-center gap-2">
        <span className="rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white">Ajouter une réplique</span>
        <span className="rounded-md bg-subtle px-2.5 py-1 text-xs font-medium text-ink-2">Ignorer</span>
      </div>
    </div>
  );
}

function VersionsVisual() {
  const rows = [
    { name: "Cache ajouté", meta: "Version 3" },
    { name: "Paiement mobile", meta: "Version 2" },
    { name: "Première esquisse", meta: "Version 1" },
  ];
  return (
    <ul className="space-y-1.5">
      {rows.map((row, index) => (
        <li
          key={row.meta}
          className={cn(
            "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
            index === 0 ? "border-accent bg-sunken" : "border-edge",
          )}
        >
          <span className="font-medium text-ink">{row.name}</span>
          <span className="font-mono text-xs text-ink-3">{row.meta}</span>
        </li>
      ))}
    </ul>
  );
}

function FilesVisual() {
  return (
    <ul className="space-y-1 rounded-xl bg-sunken p-3.5 font-mono text-xs text-ink-2">
      {["openapi.yaml", "Dockerfile", "docker-compose.yml", "backend/", "frontend/", "README.md"].map((file) => (
        <li key={file} className="flex items-center gap-2">
          <span className="h-1 w-1 rounded-full bg-ink-4" />
          {file}
        </li>
      ))}
    </ul>
  );
}

function DeployVisual() {
  const steps = [
    { label: "Projet généré", state: "done" },
    { label: "Poussé sur GitHub", state: "done" },
    { label: "Déploiement en cours", state: "active" },
    { label: "En ligne", state: "todo" },
  ] as const;
  return (
    <ol className="space-y-2">
      {steps.map((step) => (
        <li
          key={step.label}
          className={cn(
            "flex items-center gap-2.5 text-sm",
            step.state === "todo" ? "text-ink-4" : "text-ink",
          )}
        >
          {step.state === "done" ? (
            <CheckCircle size={18} weight="fill" className="text-ok" />
          ) : step.state === "active" ? (
            <span className="flex h-[18px] w-[18px] items-center justify-center">
              <span className="h-3 w-3 animate-pulse rounded-full bg-brand" />
            </span>
          ) : (
            <Circle size={18} />
          )}
          {step.label}
        </li>
      ))}
    </ol>
  );
}

const LOCAL_BLOCKS = [
  { label: "Paiement mobile", icon: DeviceMobile },
  { label: "SMS, USSD, WhatsApp", icon: Bell },
  { label: "Facturation", icon: Receipt },
] as const;

export function Features() {
  return (
    <section id="fonctionnalites" className="px-5 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="reveal max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Tout ce qu&apos;il faut pour passer de l&apos;idée au projet en ligne
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            Une équipe, un canevas, un copilote qui reste à sa place, et un chemin direct vers GitHub et le déploiement.
          </p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-6">
          <Card
            className="lg:col-span-4"
            icon={UsersThree}
            title="Un canevas partagé, en temps réel"
            visual={<CanvasVisual />}
          >
            Placez les blocs, reliez-les, voyez les curseurs de vos collègues. Les modifications se fusionnent sans
            verrou, et le travail est conservé pour la prochaine session.
          </Card>

          <Card className="lg:col-span-2" icon={ShieldCheck} title="Un copilote à la demande" visual={<SuggestionVisual />} delay={80}>
            Audit, complétion, esquisse : l&apos;IA propose, vous décidez. Rien n&apos;est modifié sans votre accord.
          </Card>

          <Card className="lg:col-span-2" icon={GitBranch} title="Des versions nommées" visual={<VersionsVisual />} delay={0}>
            Figez l&apos;état de votre architecture à chaque jalon, avec un message, et revenez à n&apos;importe quelle version.
          </Card>

          <Card className="lg:col-span-2" icon={Cube} title="Un projet généré" visual={<FilesVisual />} delay={80}>
            D&apos;une version validée, Lonkoo produit un projet de démarrage avec son contrat d&apos;API et ses fichiers de
            conteneur.
          </Card>

          <Card className="lg:col-span-2" icon={CloudArrowUp} title="GitHub puis en ligne" visual={<DeployVisual />} delay={160}>
            Poussez le dépôt sur GitHub, puis déployez sur un serveur à Dakar en suivant l&apos;état en direct.
          </Card>

          <article className="reveal rounded-2xl border border-edge bg-surface p-6 lg:col-span-6">
            <div className="grid items-center gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-lg font-semibold text-ink">Des blocs pensés pour les produits africains</h3>
                <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink-2">
                  Paiement mobile, messagerie par SMS, USSD ou WhatsApp, facturation : des blocs génériques, sans marque ni
                  intégration imposée, pour modéliser ce que vos utilisateurs utilisent vraiment.
                </p>
              </div>
              <ul className="grid gap-2 sm:grid-cols-3">
                {LOCAL_BLOCKS.map(({ label, icon: Icon }) => (
                  <li key={label} className="flex items-center gap-2.5 rounded-xl border border-edge bg-sunken px-3.5 py-3 text-sm font-medium text-ink">
                    <Icon size={18} weight="bold" className="flex-shrink-0 text-ink-2" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
