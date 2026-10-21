package com.lonkoo.backend.generation;

import java.util.Map;

/**
 * Écrit l'infrastructure du dépôt : {@code docker-compose.yml}, {@code .env.example}, {@code .gitignore} et le
 * workflow de déploiement {@code .github/workflows/deploy-systalink.yml}. Les services portent des noms dérivés
 * du slug du projet et des identifiants du contrat, jamais du texte libre.
 */
final class InfraWriter {

    /** Chemin du workflow de déploiement : GitHub refuse de le recevoir sans l'autorisation « workflow ». */
    static final String WORKFLOW_PATH = ".github/workflows/deploy-systalink.yml";

    private final BlueprintModel model;
    private final Map<String, String> files;
    private final SpringBackendWriter backend;
    private final FrontendWriter frontends;

    InfraWriter(BlueprintModel model, Map<String, String> files, SpringBackendWriter backend, FrontendWriter frontends) {
        this.model = model;
        this.files = files;
        this.backend = backend;
        this.frontends = frontends;
    }

    void write() {
        files.put("docker-compose.yml", compose());
        files.put(".env.example", envExample());
        files.put(".gitignore", "target/\nnode_modules/\n.next/\n.env\n*.log\n.idea/\n.vscode/\n");
        files.put(WORKFLOW_PATH, workflow());
    }

    private String compose() {
        StringBuilder y = new StringBuilder();
        y.append("# Environnement d'exécution du projet (généré par LONKOO). Usage : docker compose up --build\n");
        y.append("# Les valeurs par défaut conviennent au développement local (la base n'est pas publiée sur l'hôte).\n");
        y.append("# En production, définir un fichier .env (voir .env.example) avec de vrais mots de passe.\n");
        y.append("name: ").append(model.slug).append("\n\nservices:\n");

        if (backend.hasEntities()) {
            y.append("""
                      db:
                        image: postgres:16
                        restart: unless-stopped
                        environment:
                          POSTGRES_DB: ${POSTGRES_DB:-app}
                          POSTGRES_USER: ${POSTGRES_USER:-postgres}
                          POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
                        volumes:
                          - db-data:/var/lib/postgresql/data
                        healthcheck:
                          test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-app}"]
                          interval: 5s
                          timeout: 5s
                          retries: 12
                        security_opt:
                          - no-new-privileges:true
                        mem_limit: 512m

                    """);
        }
        y.append("  backend:\n    build: ./backend\n    restart: unless-stopped\n");
        if (backend.hasEntities()) {
            y.append("""
                        environment:
                          DB_URL: jdbc:postgresql://db:5432/${POSTGRES_DB:-app}
                          DB_USER: ${POSTGRES_USER:-postgres}
                          DB_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
                        depends_on:
                          db:
                            condition: service_healthy
                    """);
        }
        y.append("""
                    ports:
                      - "${BACKEND_PORT:-8080}:8080"
                    cap_drop:
                      - ALL
                    security_opt:
                      - no-new-privileges:true
                    mem_limit: 768m
                    cpus: 1.0
                """);

        int index = 0;
        for (FrontendWriter.Frontend frontend : frontends.frontends()) {
            String variable = index == 0 ? "FRONTEND_PORT" : "FRONTEND_" + (index + 1) + "_PORT";
            y.append("\n  ").append(frontend.service()).append(":\n    build: ./").append(frontend.directory()).append("\n    restart: unless-stopped\n");
            y.append("    depends_on:\n      - backend\n");
            y.append("    ports:\n      - \"${").append(variable).append(":-").append(3000 + index).append("}:3000\"\n");
            y.append("    cap_drop:\n      - ALL\n    security_opt:\n      - no-new-privileges:true\n    mem_limit: 512m\n    cpus: 1.0\n");
            index++;
        }
        if (backend.hasEntities()) {
            y.append("\nvolumes:\n  db-data:\n");
        }
        return y.toString();
    }

    private String envExample() {
        StringBuilder env = new StringBuilder("# Copier ce fichier en .env (jamais dans Git) et changer les mots de passe en production.\n");
        if (backend.hasEntities()) {
            env.append("POSTGRES_DB=app\nPOSTGRES_USER=postgres\nPOSTGRES_PASSWORD=change-me\n");
        }
        env.append("BACKEND_PORT=8080\n");
        int index = 0;
        for (FrontendWriter.Frontend ignored : frontends.frontends()) {
            env.append(index == 0 ? "FRONTEND_PORT=3000\n" : "FRONTEND_" + (index + 1) + "_PORT=" + (3000 + index) + "\n");
            index++;
        }
        return env.toString();
    }

    private String workflow() {
        return """
                # Déploiement sur un serveur Systalink : lancé à la main (onglet Actions) ou par LONKOO.
                # Secrets à créer dans les réglages du dépôt :
                #   SYSTALINK_SSH_HOST, SYSTALINK_SSH_USER, SYSTALINK_SSH_PRIVATE_KEY, SYSTALINK_SSH_KNOWN_HOSTS
                name: Déployer sur Systalink

                on:
                  workflow_dispatch:

                permissions:
                  contents: read

                concurrency:
                  group: deploy-systalink
                  cancel-in-progress: false

                jobs:
                  deploy:
                    runs-on: ubuntu-latest
                    timeout-minutes: 30
                    env:
                      SSH_HOST: ${{ secrets.SYSTALINK_SSH_HOST }}
                      SSH_USER: ${{ secrets.SYSTALINK_SSH_USER }}
                      APP_DIR: apps/@@SLUG@@
                    steps:
                      - uses: actions/checkout@v4

                      - name: Préparer la connexion SSH
                        env:
                          SSH_KEY: ${{ secrets.SYSTALINK_SSH_PRIVATE_KEY }}
                          KNOWN_HOSTS: ${{ secrets.SYSTALINK_SSH_KNOWN_HOSTS }}
                        run: |
                          install -m 700 -d ~/.ssh
                          printf '%s\\n' "$SSH_KEY" > ~/.ssh/deploy_key
                          chmod 600 ~/.ssh/deploy_key
                          printf '%s\\n' "$KNOWN_HOSTS" > ~/.ssh/known_hosts

                      - name: Envoyer le projet
                        run: |
                          tar czf - --exclude=.git . | ssh -i ~/.ssh/deploy_key -o StrictHostKeyChecking=yes "$SSH_USER@$SSH_HOST" "mkdir -p $APP_DIR && tar xzf - -C $APP_DIR"

                      - name: Démarrer les conteneurs
                        run: |
                          ssh -i ~/.ssh/deploy_key -o StrictHostKeyChecking=yes "$SSH_USER@$SSH_HOST" "cd $APP_DIR && docker compose up -d --build"

                      - name: Vérifier la santé de l'API
                        run: |
                          ssh -i ~/.ssh/deploy_key -o StrictHostKeyChecking=yes "$SSH_USER@$SSH_HOST" "curl -fsS --retry 30 --retry-delay 4 --retry-connrefused http://localhost:8080/actuator/health"
                """.replace("@@SLUG@@", model.slug);
    }
}
