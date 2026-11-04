"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Globe } from "@phosphor-icons/react";
import { messageOf, relativeTime } from "@/lib/api";
import { listPublicProjects } from "@/lib/public-projects-api";
import type { PublicProject } from "@/lib/public-projects";

/**
 * Galerie publique (mode API) : les projets que leurs propriétaires ont rendus publics. On les ouvre en lecture
 * seule ; les projets d'invités n'y figurent pas (docs/openapi.yaml, `GET /projects/public`).
 */
export function PublicGallery() {
  const [projects, setProjects] = useState<PublicProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listPublicProjects(24, controller.signal)
      .then(setProjects)
      .catch((failure) => {
        if (!controller.signal.aborted) setError(messageOf(failure));
      });
    return () => controller.abort();
  }, []);

  return (
    <section aria-labelledby="public-gallery" className="rounded-xl border border-edge bg-surface p-5">
      <h2 id="public-gallery" className="flex items-center gap-2 text-sm font-bold text-ink">
        <Globe size={16} />
        Galerie publique
      </h2>
      <p className="mt-1 text-sm text-ink-3">
        Les architectures que leurs auteurs ont rendues publiques. Vous les ouvrez en lecture seule.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {!projects && !error && <p className="mt-3 text-sm text-ink-3">Chargement de la galerie…</p>}
      {projects && projects.length === 0 && (
        <p className="mt-3 text-sm text-ink-3">
          Aucune architecture publique pour le moment. Rendez l&apos;un de vos projets public depuis la liste de vos
          projets pour l&apos;y voir apparaître.
        </p>
      )}
      {projects && projects.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id} className="flex flex-col justify-between rounded-lg border border-edge p-4">
              <div>
                <h3 className="truncate font-mono text-sm font-semibold text-ink">{project.name}</h3>
                {project.description && <p className="mt-1 line-clamp-2 text-sm text-ink-3">{project.description}</p>}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-xs text-ink-3">
                  {project.ownerName} · {relativeTime(project.updatedAt)}
                </span>
                <Link
                  href={`/studio?project=${project.id}`}
                  className="inline-flex flex-shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline"
                  aria-label={`Consulter ${project.name} en lecture seule`}
                >
                  Consulter
                  <ArrowRight size={12} />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
