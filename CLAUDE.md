# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A free-listings scraper + self-serve web app. A worker scrapes each user's saved Craigslist searches, runs every new free item through Claude Haiku (via OpenRouter) to judge whether they'd want it, and notifies them via ntfy/SMS/Discord. A Next.js app (`apps/web`) gives users accounts to manage their searches and gives admins a dashboard. Production is `docker compose` on a Mac mini behind a Cloudflare tunnel.

## The one architectural fact that explains everything

**The worker (`apps/worker`) and the web app (`apps/web`) are independent services that share nothing but the Postgres schema.** There is no API between them; they communicate entirely through the database.

- **`@fsf/db` (`packages/db`) owns the schema.** `packages/db/src/schema.ts` (Drizzle) is the single source of truth; numbered SQL migrations live in `packages/db/migrations` and are applied by `pnpm --filter @fsf/db db:migrate` (the compose `migrate` service runs it before web and worker start). It also re-exports drizzle's operators (`eq`, `and`, `sql`, …) — import them from `@fsf/db`, not `drizzle-orm`, so every workspace shares one drizzle instance.
- **`@fsf/engine` (`packages/engine`) is the domain logic as a pure library**: Craigslist parsing over plain HTTP (no browser; see `docs/decisions/0001-http-not-browser.md`), the exclude filter, the classifiers, notifiers, and the shared form validation (`@fsf/engine/validate`). Functions take their dependencies (fetch, OpenRouter client, clock) as arguments.
- **`apps/worker` (`@fsf/worker`) wires the engine to Postgres with pg-boss queues** (schema `pgboss` in the same DB): `schedule` (cron, every minute: syncs `search_urls`/`search_watches` from active searches, claims due URLs, heartbeats `worker_status`, requeues stuck matches) → `scrape-url` (one per *distinct* URL, inserts `posts`, creates `matches` rows) → `match` (exclude filter, post-page fetch, classify) → `notify`. The first scrape of each (search, URL) pair is a no-alert baseline. The admin kill-switch is `worker_status.enabled`. `NOTIFY_DRY_RUN=1` (`WORKER_NOTIFY_DRY_RUN` in compose) records `notifications` as `dry_run` and sends nothing.
- **All model calls go through OpenRouter (`@openrouter/sdk`).** `createClassifier` is Claude Haiku via OpenRouter chat (title + photo + description, JSON-schema response format, one-line reason); `createOpenRouterClassifier` is jev via the Decisions API (one `noul` probability, text only). The worker picks one with `CLASSIFIER=haiku|jev`. Classification **fails open**: on error the verdict is `want` with `error` set; retryable errors go back to pg-boss, and a sliding failure window stops fail-open verdicts from alerting once too many pile up. The web "GET" pickup draft uses the same client and model. `pnpm --filter @fsf/worker eval:classifier [n]` replays labeled history through both classifiers (read-only).
- **`listings` is a frozen archive** of the retired Python scraper's history. Migration 0004 copied it into `posts`/`matches` at the cutover so the worker never re-alerts on a post already judged. Nothing writes to it; only `eval:classifier` reads it.

### Consequences you must respect

- **To change the schema:** edit `packages/db/src/schema.ts`, run `pnpm --filter @fsf/db db:generate --name <what>`, review the generated SQL (type changes from text need a hand-written `USING`), commit both. CI fails if `schema.ts` has changes with no migration. Data migrations: `pnpm --filter @fsf/db exec drizzle-kit generate --custom --name <what>`.
- **Migration 0000 is a baseline** matching what the old SQLAlchemy `create_all` produced, down to constraint names. `db:migrate` detects a pre-migrations DB and records 0000 as applied instead of running it. Never edit an applied migration — add a new one.
- **Production is the user's checkout.** The repo directory is also the live deploy dir; do feature work in a git worktree, never switch branches there.

## Commands

Requires Node 22 (`.nvmrc`) and pnpm (`corepack enable`). Run from the repo root.
```sh
pnpm install
pnpm dev           # turbo → next dev on :8000
pnpm build         # turbo → next build (standalone output)
pnpm typecheck     # tsc --noEmit across packages
pnpm test          # vitest across packages
TEST_DB_PORT=55432 TEST_DB_NAME=workertest pnpm test   # also run the Postgres integration tests (wipes that DB; name must contain "test")
pnpm lint          # biome check (pnpm format to auto-fix)
pnpm --filter @fsf/worker dev                     # worker with reload (needs OPENROUTER_API_KEY; NOTIFY_DRY_RUN=1 to send nothing)
pnpm --filter @fsf/db db:generate --name <what>   # write a migration after editing packages/db/src/schema.ts
pnpm --filter @fsf/db db:migrate                  # apply pending migrations (uses DB_* env)
pnpm --filter @fsf/db grant-admin <target|id>     # mark a user admin
```
CI (`.github/workflows/ci.yml`) runs lint, typecheck, test and build, applies migrations to an empty Postgres, and runs the integration tests on every PR.

### Docker
```sh
docker compose up -d --build                      # Postgres + migrate + web + worker
docker compose --profile tunnel up -d --build     # also the Cloudflare tunnel
git pull && docker compose up -d --build migrate web worker   # deploy an update
```
Plain `docker compose up` runs the web app as the production standalone build (what the tunnel serves). For local development with live reload: `docker compose -f docker-compose.yml -f compose.dev.yml watch`.

## Web app structure (`apps/web`)

Next.js 15 App Router, React 19, Radix Themes, Drizzle + `postgres`. Signed-in pages are dynamic server components with live DB reads. Mutations are server actions, not API routes.

- **Accounts and sign-in (`lib/auth/`):** no passwords. A user signs in by entering their alert destination (ntfy topic, phone or Discord webhook); a one-time link (15 min, 60 s cooldown) is sent *to that destination*. The link page only shows a button; the token is used up on POST, because chat link previews would otherwise consume it. Sessions last 30 days in an httpOnly cookie. Session, login and legacy edit-link tokens are all stored only as sha256 hashes. `core.ts` is framework-free and tested against Postgres; `session.ts` holds the cookie and the `requireUser()`/`requireAdmin()` guards. Creating an account needs `INVITE_CODE`; signing in doesn't. Old `/profile/<edit_token>` links still sign their owner in.
- **Authorization lives in the server actions, not just the layouts.** Server actions are public POST endpoints, so every action calls `requireUser()`/`requireAdmin()` itself and checks ownership (admins may edit anyone's). Admin pages 404 for non-admins.
- **Routes:** `app/(public)` holds the landing page, `/signin`, `/signup` and `/auth/verify`; `app/(app)` holds the signed-in shell with `/searches`, `/account` and `/admin/*`. Forms are shared between the user and admin sides (`components/`). Sign-in links use `APP_URL` (required in production, so a spoofed Host header can't redirect them). `AUTH_DEV_LOG_LINKS=1` prints links instead of sending them, in dev only.
- **Admin data layer:** `app/(app)/admin/queries.ts` (reads from `matches`/`posts`/`worker_status`) and `app/(app)/admin/actions.ts` (writes). List pages paginate via `?page=N` (`pager.tsx`), deriving "has next page" by fetching one row past the page size. Times display in `DISPLAY_TIMEZONE` (default America/Los_Angeles) via `lib/time.ts`.
- **`db/index.ts`** builds the pool via `createDb()` from `@fsf/db` (size: `DB_POOL_MAX`, default 10) and caches it on `globalThis` across dev hot-reloads.

## Config

All runtime config lives in `.env` at repo root (gitignored; copy from `.env.example`). Key vars: `OPENROUTER_API_KEY`, `INVITE_CODE`, `APP_URL`, `DB_*`. Compose overrides `DB_*` for the container network, so those in `.env` only matter for bare-metal runs. DB defaults are `postgres`/`postgres`/`craigslist` on `:5432`; web serves on `:8000`.

## Code style

This repo uses "ponytail" comments (`// ponytail:`) to mark deliberate simplifications and name their upgrade path. They're intent, not TODOs — read them before "fixing" something that looks too simple.
