# Interface LONKOO (Next.js)
#
# Les variables NEXT_PUBLIC_* sont fixées à la CONSTRUCTION de l'image (Next les inscrit dans le code du
# navigateur) : elles se règlent avec --build-arg, pas au démarrage du conteneur.
#   - NEXT_PUBLIC_API_MODE : « live » (par défaut ici) branche l'interface sur l'API ; sans lui elle tournerait
#     sur des données simulées du navigateur, sans aucune erreur visible. Ne pas le changer en production.
#   - NEXT_PUBLIC_REALTIME_URL : « /ws » (par défaut) = chemin servi par Caddy sur l'origine du site.
#
#   docker build -t lonkoo-frontend frontend

# Étape 1 : construction (dépendances complètes, dont celles de développement)
FROM node:24-slim AS build
WORKDIR /app

# sharp (libvips, LGPL) est remplacé par un stub local, workspace npm : il doit être présent avant « npm ci ».
COPY package.json package-lock.json ./
COPY stubs ./stubs
RUN npm ci --no-audit --no-fund

COPY . .
ARG NEXT_PUBLIC_API_MODE=live
ARG NEXT_PUBLIC_REALTIME_URL=/ws
ENV NEXT_PUBLIC_API_MODE=$NEXT_PUBLIC_API_MODE \
    NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Étape 2 : dépendances d'exécution seulement
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY stubs ./stubs
RUN npm ci --omit=dev --no-audit --no-fund

# Étape 3 : exécution, utilisateur non root
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json /app/next.config.ts ./
USER node
EXPOSE 3000
# Caddy (infra/Caddyfile) relaie « / » vers ce conteneur ; /api et /ws vont au backend et au temps réel.
CMD ["node_modules/.bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
