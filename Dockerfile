# syntax=docker/dockerfile:1
FROM oven/bun:1.3.9@sha256:856da45d07aeb62eb38ea3e7f9e1794c0143a4ff63efb00e6c4491b627e2a521 AS bun
FROM node:24-bookworm-slim@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530 AS base
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
# Apply Bookworm security fixes for PAM and zstd to the pinned runtime image.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --only-upgrade --no-install-recommends \
        libpam-modules libpam-modules-bin libpam-runtime libpam0g libzstd1 \
    && rm -rf /var/lib/apt/lists/*
# npm, corepack, and yarn are unused at runtime (the image runs node and bun
# directly); removing them keeps their bundled dependencies out of the
# vulnerability surface.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg
# 17M covers the contacts API's 16 MB request bodies and 10 MB knowledge uploads.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 BODY_SIZE_LIMIT=17M SHUTDOWN_TIMEOUT=30
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
