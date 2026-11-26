# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder
WORKDIR /app

ARG VITE_APP_VERSION=v1.0.0
ENV VITE_APP_VERSION=$VITE_APP_VERSION

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm ci --legacy-peer-deps

COPY shared ./shared
COPY server ./server
COPY client ./client

RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app

ARG APP_VERSION=v1.0.0
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV LOG_DIR=/app/logs
ENV APP_VERSION=$APP_VERSION

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared/package.json ./shared/
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

RUN mkdir -p /app/logs && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "server/dist/index.js"]
