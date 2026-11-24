# syntax=docker/dockerfile:1
FROM oven/bun:1.3.9 AS bun
FROM node:24-bookworm-slim AS base
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

FROM base AS dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM dependencies AS build
COPY . .
RUN bun run build

FROM base AS production-dependencies
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile --ignore-scripts

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 BODY_SIZE_LIMIT=12M SHUTDOWN_TIMEOUT=30
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --chown=node:node package.json bun.lock ./
# Bun runs the TypeScript workers and database administration scripts.
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node src/lib ./src/lib
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", "build"]
