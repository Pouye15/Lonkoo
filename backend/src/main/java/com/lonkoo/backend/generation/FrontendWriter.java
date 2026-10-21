package com.lonkoo.backend.generation;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * Écrit un squelette Next.js par bloc « application web » : une route par page déclarée. Seuls les identifiants
 * des pages entrent dans les noms de dossiers et dans le code ; le titre du bloc n'apparaît que comme chaîne JSON.
 */
final class FrontendWriter {

    /** Un frontend écrit : son dossier, son nom de service et son bloc. */
    record Frontend(String directory, String service, BlueprintModel.Block block, List<String> pages) {
    }

    private final BlueprintModel model;
    private final Map<String, String> files;
    private final List<Frontend> frontends = new ArrayList<>();

    FrontendWriter(BlueprintModel model, Map<String, String> files) {
        this.model = model;
        this.files = files;
    }

    List<Frontend> frontends() {
        return frontends;
    }

    void write() {
        List<BlueprintModel.Block> webapps = model.ofType("webapp");
        for (BlueprintModel.Block webapp : webapps) {
            String directory = webapps.size() == 1 ? "frontend" : "frontend-" + webapp.name().replace('_', '-');
            List<String> pages = new ArrayList<>(new LinkedHashSet<>(model.list(webapp, "pages")));
            Frontend frontend = new Frontend(directory, directory, webapp, pages);
            frontends.add(frontend);
            writeApp(frontend);
        }
    }

    private void put(Frontend frontend, String path, String content) {
        files.put(frontend.directory() + "/" + path, content);
    }

    private void writeApp(Frontend frontend) {
        String title = Texts.json(frontend.block().title());
        put(frontend, "package.json", """
                {
                  "name": "@@SLUG@@-@@DIR@@",
                  "version": "0.1.0",
                  "private": true,
                  "scripts": {
                    "dev": "next dev",
                    "build": "next build",
                    "start": "next start"
                  },
                  "dependencies": {
                    "next": "^16.4.2",
                    "react": "^19.3.1",
                    "react-dom": "^19.3.1"
                  },
                  "devDependencies": {
                    "@types/node": "^22.0.0",
                    "@types/react": "^19.3.0",
                    "@types/react-dom": "^19.3.0",
                    "typescript": "~6.0.3"
                  }
                }
                """.replace("@@SLUG@@", model.slug).replace("@@DIR@@", frontend.directory()));
        put(frontend, "tsconfig.json", """
                {
                  "compilerOptions": {
                    "target": "ES2022",
                    "lib": ["dom", "dom.iterable", "esnext"],
                    "allowJs": false,
                    "skipLibCheck": true,
                    "strict": true,
                    "noEmit": true,
                    "esModuleInterop": true,
                    "module": "esnext",
                    "moduleResolution": "bundler",
                    "resolveJsonModule": true,
                    "isolatedModules": true,
                    "jsx": "react-jsx",
                    "incremental": true,
                    "plugins": [{ "name": "next" }],
                    "paths": { "@/*": ["./*"] }
                  },
                  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
                  "exclude": ["node_modules"]
                }
                """);
        put(frontend, "next.config.mjs", """
                // Image autonome (Dockerfile) ; sans optimisation d'images, donc sans dépendance native.
                const nextConfig = {
                  output: "standalone",
                  images: { unoptimized: true },
                };

                export default nextConfig;
                """);
        put(frontend, "public/robots.txt", "User-agent: *\nAllow: /\n");
        put(frontend, "app/layout.tsx", """
                import type { ReactNode } from "react";

                export const metadata = { title: @@TITLE@@ };

                export default function RootLayout({ children }: { children: ReactNode }) {
                  return (
                    <html lang="fr">
                      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "2rem" }}>{children}</body>
                    </html>
                  );
                }
                """.replace("@@TITLE@@", title));

        StringBuilder list = new StringBuilder();
        for (String page : frontend.pages()) {
            list.append("  ").append(Texts.json(page)).append(",\n");
        }
        put(frontend, "app/page.tsx", """
                import Link from "next/link";

                const pages: string[] = [
                @@PAGES@@];

                export default function Home() {
                  return (
                    <main>
                      <h1>{@@TITLE@@}</h1>
                      {pages.length === 0 ? (
                        <p>Aucune page n'est déclarée dans le canvas.</p>
                      ) : (
                        <ul>
                          {pages.map((page) => (
                            <li key={page}>
                              <Link href={`/${page}`}>{page}</Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </main>
                  );
                }
                """.replace("@@PAGES@@", list.toString()).replace("@@TITLE@@", title));

        for (String page : frontend.pages()) {
            put(frontend, "app/" + page + "/page.tsx", """
                    export default function Page() {
                      return (
                        <main>
                          <h1>@@PAGE@@</h1>
                          <p>Page à compléter.</p>
                        </main>
                      );
                    }
                    """.replace("@@PAGE@@", page));
        }

        put(frontend, "Dockerfile", """
                # Étape 1 : construction
                FROM node:24-slim AS build
                WORKDIR /app
                COPY package.json ./
                RUN npm install --no-audit --no-fund
                COPY . .
                ARG NEXT_PUBLIC_API_URL=
                ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
                RUN npm run build

                # Étape 2 : exécution (sortie « standalone »), utilisateur non root
                FROM node:24-slim
                WORKDIR /app
                ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
                COPY --from=build /app/.next/standalone ./
                COPY --from=build /app/.next/static ./.next/static
                COPY --from=build /app/public ./public
                USER node
                EXPOSE 3000
                CMD ["node", "server.js"]
                """);
        put(frontend, ".dockerignore", "node_modules\n.next\n*.log\n.env*\n");
    }
}
