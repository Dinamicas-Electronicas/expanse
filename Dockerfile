# syntax=docker.io/docker/dockerfile:1

# Expanse — IDE visual de Docker Compose
# Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
# Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
# Consulta el archivo LICENSE en la raíz del proyecto.

FROM node:24-alpine AS base

# Keep the pnpm version in sync with the "packageManager" field in
# package.json. pnpm >=11 is required because the project settings
# (overrides, patchedDependencies, allowBuilds) live in pnpm-workspace.yaml.
ARG PNPM_VERSION=12.3.4

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat git
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY patches ./patches
RUN npm install -g pnpm@${PNPM_VERSION} && pnpm install --frozen-lockfile


# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
ENV NEXT_TELEMETRY_DISABLED=1
ENV MONGODB_URI="mongodb://localhost:27017"
RUN npm install -g pnpm@${PNPM_VERSION} && pnpm sync-icons && pnpm typecheck && SECRET_KEY="dummy_secret_for_build" pnpm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

LABEL org.opencontainers.image.title="Expanse"
LABEL org.opencontainers.image.description="IDE visual para diseñar, desplegar y monitorear Docker Compose"
LABEL org.opencontainers.image.authors="Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>"
LABEL org.opencontainers.image.url="https://github.com/Dinamicas-Electronicas/expanse"
LABEL org.opencontainers.image.source="https://github.com/Dinamicas-Electronicas/expanse"
LABEL org.opencontainers.image.licenses="MIT"

# Docker CLI + Compose + Buildx are required because the app shells out to
# `docker compose`. buildx avoids the "Docker Compose requires buildx plugin"
# warning and is needed by `docker compose up --build`.
RUN apk add --no-cache ca-certificates docker-cli docker-cli-compose docker-cli-buildx \
    && apk upgrade --no-cache

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

# Set the correct permission for prerender cache and client exports
RUN mkdir -p .next public/exports \
    && chown nextjs:nodejs .next public/exports

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# The runtime only needs `node server.js`: drop npm/yarn/corepack and the Node
# headers. This removes ~25 MB and, more importantly, the bundled npm
# dependencies that image scanners report as vulnerable.
RUN rm -rf \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /opt/yarn-v* \
      /usr/local/include/node \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/corepack \
      /usr/local/bin/yarn \
      /usr/local/bin/yarnpkg \
      /root/.npm \
      /root/.cache


# The compose file runs the container as root so it can access
# /var/run/docker.sock. This default is used when running the image directly.
USER nextjs

EXPOSE 3000

ENV PORT=3000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
