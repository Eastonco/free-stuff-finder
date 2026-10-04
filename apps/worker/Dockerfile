# Built from the repo root (compose sets context: .). Same prune → install
# pattern as apps/web; the worker runs TypeScript directly via tsx.
FROM node:22-alpine AS base
RUN npm install -g pnpm@10.30.1
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2 prune @fsf/worker --docker

FROM base AS runner
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
ENV NODE_ENV=production
USER node
WORKDIR /app/apps/worker
CMD ["pnpm", "start"]
