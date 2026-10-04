# Built from the repo root (compose sets context: .) so workspace packages are
# visible. `turbo prune` cuts the monorepo down to just @fsf/web and its deps,
# so unrelated changes don't bust the install layer.
FROM node:22-alpine AS base
RUN npm install -g pnpm@10.30.1
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2 prune @fsf/web --docker

# Install from the pruned manifests + lockfile only (cached until deps change).
FROM base AS deps
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# Dev stage: source copied here on build, then kept live via docker watch sync.
FROM deps AS dev
COPY --from=pruner /app/out/full/ .
WORKDIR /app/apps/web
ENV PORT=8000 HOSTNAME=0.0.0.0
CMD ["pnpm", "dev"]

# One-shot schema migrator (compose `migrate` service). Reuses the pruned
# install, which already includes @fsf/db and its drizzle tooling.
FROM deps AS migrate
COPY --from=pruner /app/out/full/ .
CMD ["pnpm", "--filter", "@fsf/db", "db:migrate"]

FROM deps AS build
COPY --from=pruner /app/out/full/ .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@fsf/web

# Standalone runtime: no dev deps, no source, non-root.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 8000
CMD ["node", "apps/web/server.js"]
