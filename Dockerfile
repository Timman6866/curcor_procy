# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY esbuild.config.mjs tsconfig.json ./
COPY src ./src
RUN npm run build:prod

FROM node:22-bookworm-slim AS runtime
ARG LOG_POLICY=standard
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    CURSOR_RUNTIME=cloud \
    LOG_POLICY=${LOG_POLICY}

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh

RUN if [ "$LOG_POLICY" = "no-log" ]; then find /app/dist -name '*.map' -delete; fi

RUN mkdir -p /app/.scratch && chown -R node:node /app && chmod +x /app/scripts/docker-entrypoint.sh
USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["/app/scripts/docker-entrypoint.sh"]
