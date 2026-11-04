"use client";

import React, { useId, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

const QUESTIONS = [
  {
    q: "Faut-il un compte pour essayer ?",
    a: "Non. L'accès sans compte ouvre un espace de démonstration avec un modèle déjà rempli, valable 24 heures. Pour pousser votre projet sur GitHub, connectez votre compte GitHub : Lonkoo demande l'accès à votre profil et à vos dépôts publics, et ne conserve aucun jeton.",
  },
  {
    q: "L'IA décide-t-elle à ma place ?",
    a: "Jamais. Elle intervient sur demande : esquisse depuis un cahier des charges, complétion d'un sous-schéma, audit de l'architecture. Chaque proposition est à accepter, et l'audit est consultatif : il ne modifie rien.",
  },
  {
    q: "Que génère Lonkoo exactement ?",
    a: "Un projet de démarrage à partir d'une version validée de votre schéma : contrat OpenAPI, entités, Dockerfile, docker-compose et README avec les schémas d'architecture. Seuls les identifiants techniques validés entrent dans le code généré.",
  },
  {
    q: "Où mon projet est-il déployé ?",
    a: "Sur un serveur cloud à Dakar, avec Docker Compose et des conteneurs aux ressources limitées. L'état du déploiement (en attente, en cours, déployé) s'affiche dans l'interface.",
  },
  {
    q: "Mes schémas restent-ils privés ?",
    a: "Chaque projet est privé ou public, au choix, et seuls les membres de votre équipe peuvent le modifier. Vous pouvez changer la visibilité à tout moment.",
  },
] as const;

export function Faq() {
  const baseId = useId();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="px-5 py-24 sm:py-28">
      <div className="mx-auto max-w-3xl">
        <div className="reveal text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Questions fréquentes</h2>
          <p className="mt-3 text-[15px] text-ink-2">Ce qu&apos;il faut savoir avant de commencer.</p>
        </div>

        <div className="mt-10 divide-y divide-edge rounded-2xl border border-edge bg-surface">
          {QUESTIONS.map((item, index) => {
            const isOpen = open === index;
            const panelId = `${baseId}-panel-${index}`;
            const buttonId = `${baseId}-button-${index}`;
            return (
              <div key={item.q}>
                <h3>
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? null : index)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold text-ink transition-colors hover:text-accent"
                  >
                    {item.q}
                    <Plus
                      size={18}
                      weight="bold"
                      className={cn("flex-shrink-0 text-ink-3 transition-transform duration-200", isOpen && "rotate-45")}
                    />
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-out",
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm leading-relaxed text-ink-2">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
