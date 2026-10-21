# Serveur temps réel Lonkoo (Hocuspocus + Yjs)
FROM node:24-slim
WORKDIR /app

# Dépendances de production uniquement.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src

# Utilisateur non root.
USER node

ENV NODE_ENV=production
EXPOSE 1234
CMD ["node", "src/index.js"]