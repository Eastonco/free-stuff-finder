# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A free-listings scraper + self-serve web app. A Python loop scrapes each user's saved searches, runs every new free item through Claude Haiku (via OpenRouter in the TS worker; the Anthropic API directly in the legacy Python loop) to judge whether they'd want it, and notifies them via ntfy/SMS/Discord. A Next.js app (`apps/web`) lets users manage their profile and gives an admin dashboard. Designed to run on a Raspberry Pi.

## The one architectural fact that explains everything

**The backend (Python, `backend/`) and web app (Next.js, `apps/web/`) are independent services that share nothing but the Postgres schema.** There is no API between them. They communicate entirely through the database.

- **`@fsf/db` (`packages/db`) owns the schema.** `packages/db/src/schema.ts` (Drizzle) is the single source of truth; numbered SQL migrations live in `packages/db/migrations` and are applied by `pnpm --filter @fsf/db db:migrate` (the compose `migrate` service runs it before web starts). The web app imports tables from `@fsf/db`.
- **Python is a legacy reader/writer** (being replaced by the TypeScript worker — see the refactor plan). `backend/models.py` still calls `create_all`, which only creates *missing* tables, so it is harmless against a migrated DB. The scraper writes `listings`, heartbeats `scraper_status`, and reads `users`/`searches`.

- **`@fsf/engine` (`packages/engine`) is the TypeScript replacement for `backend/`'s logic**, as a pure library: Craigslist parsing over plain HTTP (no browser; see `docs/decisions/0001-http-not-browser.md`), the exclude filter, the Claude classifier, notifiers, and the shared form validation (`@fsf/engine/validate`, which the web app re-exports from `lib/validate.ts`). Functions take their dependencies (fetch, Anthropic client, clock) as arguments. `apps/worker` wires it up.

- **`apps/worker` (`@fsf/worker`) is the TypeScript scraper loop**, built on pg-boss queues stored in the same Postgres (schema `pgboss`): `schedule` (cron, every minute: syncs `search_urls`/`search_watches` from active searches, claims due URLs, heartbeats `worker_status`, requeues stuck matches) → `scrape-url` (one per *distinct* URL, inserts `posts`, creates `matches` rows) → `match` (exclude filter, post-page fetch, classify) → `notify`. The first scrape of each (search, URL) pair is a no-alert baseline. The admin kill-switch is `worker_status.enabled` (the Overview toggle). `NOTIFY_DRY_RUN=1` (via `WORKER_NOTIFY_DRY_RUN` in compose) records `notifications` as `dry_run` and sends nothing.
- **`listings` is a frozen archive.** It holds the Python scraper's history, which migration 0004 copied into `posts`/`matches` at the cutover so the worker never re-alerts on a post Python already judged. Everything in the app reads `matches` + `posts`; only `eval:classifier` still reads `listings` (as labeled history).

- **All model calls go through OpenRouter (`@openrouter/sdk`); there is no Anthropic SDK in the TS code.** `@fsf/engine` has two interchangeable classifiers. `createClassifier` is Claude Haiku via OpenRouter chat: title + photo + description, with a JSON-schema response format and a one-line reason. `createOpenRouterClassifier` is jev via the Decisions API: one `noul` probability, text only, no reason. The worker picks one with `CLASSIFIER=haiku|jev` and needs only `OPENROUTER_API_KEY`. The web "GET" pickup draft uses the same client and model. `pnpm --filter @fsf/worker eval:classifier [n]` replays historical labeled posts through both (read-only against `DB_*`) and reports agreement, a threshold sweep, latency and cost.

### Consequences you must respect

- **To change the schema:** edit `packages/db/src/schema.ts`, run `pnpm --filter @fsf/db db:generate --name <what>`, review the generated SQL, commit both. CI fails if `schema.ts` has changes with no migration. While `backend/` still exists, mirror column changes the scraper touches in `backend/models.py` too.
- **Migration 0000 is a baseline** matching what `create_all` produced, down to constraint names. `db:migrate` detects a pre-migrations DB (tables exist, no `drizzle.__drizzle_migrations`) and records 0000 as applied instead of running it. Never edit an applied migration — add a new one.

## Commands

### Backend (Python, run from repo root)
```sh
pip install -r requirements.txt
python -m backend.main        # the scraper loop (reads active searches, scrapes, classifies, notifies)
python -m backend.classify    # self-check for the AI gate (runs _demo(); live half needs ANTHROPIC_API_KEY)
```
Several modules have an `if __name__ == "__main__": _demo()` self-check — run the module directly to exercise it.

### Web + monorepo (TypeScript, pnpm workspaces + Turborepo, run from repo root)
Requires Node 22 (`.nvmrc`). The Next.js app lives in `apps/web` (package `@fsf/web`).
```sh
pnpm install
pnpm dev           # turbo → next dev on :8000
pnpm build         # turbo → next build (standalone output)
pnpm typecheck     # tsc --noEmit across packages
pnpm test          # vitest across packages
TEST_DB_PORT=55432 TEST_DB_NAME=workertest pnpm test   # also run worker integration tests (wipes that DB; name must contain "test")
pnpm --filter @fsf/worker dev   # worker with reload (needs OPENROUTER_API_KEY; set NOTIFY_DRY_RUN=1 to send nothing)
pnpm lint          # biome check (pnpm format to auto-fix)
pnpm --filter @fsf/db db:generate --name <what>   # write a migration after editing packages/db/src/schema.ts
pnpm --filter @fsf/db db:migrate                  # apply pending migrations (uses DB_* env)
```
CI (`.github/workflows/ci.yml`) runs lint, typecheck, test and build on every PR.

### Full stack (Docker, from repo root)
```sh
docker compose up --build      # Postgres + migrate + web + TS worker (dry-run) + legacy Python scraper/Selenium
docker compose --profile tunnel up --build   # also start the Cloudflare tunnel
```
**Prod vs dev:** plain `docker compose up` runs the web app as the production standalone build (what the tunnel serves). For local development with live reload, use the override: `docker compose -f docker-compose.yml -f compose.dev.yml watch`. Without `watch`, source edits sit on disk while the container runs stale code.

## How a scrape cycle works (`backend/main.py`)

`main()` loops forever. Each cycle: `record_cycle()` writes the heartbeat (and now carries the `scraper_enabled` kill-switch the admin toggle flips) → if disabled, skip the cycle → otherwise fetch all `active` searches and `process_search()` each.

`process_search()` key behaviors:
- **Backfill on first sight:** the first time a search is ever seen (no listings yet), every current item is stored as a baseline with no alert and no API call — so a new search doesn't flood the user or burn classification spend. Alerts begin next cycle.
- **Cheap pre-filter before the AI:** `exclude_filters` (whole-word, case-insensitive) hard-skips obvious junk so it never reaches Claude.
- **Classification fails OPEN:** `classify()` returns `want` on any API/parse error (see `backend/classify.py`) — a transient hiccup never silently drops a real find.

Scraping is Selenium/Firefox parsing the source site's gallery cards (`parse_listings`). In Docker it talks to the `selenium` service via `SELENIUM_REMOTE_URL`; bare-metal it uses a local geckodriver.

## Web app structure (`apps/web`)

Next.js 15 App Router, React 19, Radix Themes, Drizzle + `postgres`. Signed-in pages are dynamic server components with live DB reads. Mutations are server actions, not API routes.

- **Accounts and sign-in (`lib/auth/`):** there are no passwords. A user signs in by entering their alert destination (ntfy topic, phone or Discord webhook), and a one-time link (15 min, 60 s cooldown) is sent *to that destination* via `@fsf/engine`'s notifier. The link page only shows a button; the token is used up on POST, because chat link previews would otherwise consume it. Sessions last 30 days in an httpOnly cookie. Both tokens are stored only as sha256 hashes (`sessions`, `login_tokens`). `core.ts` is framework-free and tested against Postgres; `session.ts` holds the cookie and the `requireUser()`/`requireAdmin()` guards. Creating an account needs `INVITE_CODE`; signing in doesn't. Old `/profile/<edit_token>` links still sign their owner in.
- **Authorization lives in the server actions, not just the layouts.** Server actions are public POST endpoints, so every action calls `requireUser()`/`requireAdmin()` itself and checks ownership (admins may edit anyone's). `users.is_admin` is granted with `pnpm --filter @fsf/db grant-admin <target|id>`. Admin pages 404 for non-admins.
- **Routes:** `app/(public)` holds the landing page, `/signin`, `/signup` and `/auth/verify`; `app/(app)` holds the signed-in shell with `/searches`, `/account` and `/admin/*`. Forms are shared between the user and admin sides (`components/`). Sign-in links use `APP_URL` (required in production, so a spoofed Host header can't redirect them). `AUTH_DEV_LOG_LINKS=1` prints links instead of sending them, in dev only.
- **`db/index.ts`** builds the pool via `createDb()` from `@fsf/db` (size: `DB_POOL_MAX`, default 10) and caches it on `globalThis` across dev hot-reloads to avoid connection leaks; reads the same `DB_*` env vars as the Python side.
- **Admin data layer:** `app/(app)/admin/queries.ts` (reads, all from `matches`/`posts`/`worker_status`) and `app/(app)/admin/actions.ts` (server-action writes). List/overview pages paginate via `?page=N` URL params (`app/admin/pager.tsx`), deriving "has next page" by fetching one row past the page size (no count query).

## Config

All runtime config lives in `.env` at repo root (gitignored; copy from `.env.example`). Key vars: `OPENROUTER_API_KEY` (TS worker + web), `ANTHROPIC_API_KEY` (legacy Python only), `INVITE_CODE`, `APP_URL`, `DB_*`. Compose overrides `DB_HOST`/`SELENIUM_REMOTE_URL` for the container network, so the `DB_*` values in `.env` only matter for bare-metal runs. DB defaults are `postgres`/`postgres`/`craigslist` on `:5432`; web serves on `:8000`.

## Code style

This repo uses "ponytail" comments (`# ponytail:` / `// ponytail:`) to mark deliberate simplifications and name their upgrade path. They're intent, not TODOs — read them before "fixing" something that looks too simple.
