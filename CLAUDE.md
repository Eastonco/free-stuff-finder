# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A free-listings scraper + self-serve web app. A Python loop scrapes each user's saved searches, runs every new free item through Claude Haiku (`claude-haiku-4-5`) to judge whether they'd want it, and notifies them via ntfy/SMS/Discord. A Next.js app (`apps/web`) lets users manage their profile and gives an admin dashboard. Designed to run on a Raspberry Pi.

## The one architectural fact that explains everything

**The backend (Python, `backend/`) and web app (Next.js, `apps/web/`) are independent services that share nothing but the Postgres schema.** There is no API between them. They communicate entirely through the database.

- **`@fsf/db` (`packages/db`) owns the schema.** `packages/db/src/schema.ts` (Drizzle) is the single source of truth; numbered SQL migrations live in `packages/db/migrations` and are applied by `pnpm --filter @fsf/db db:migrate` (the compose `migrate` service runs it before web starts). The web app imports tables from `@fsf/db`.
- **Python is a legacy reader/writer** (being replaced by the TypeScript worker — see the refactor plan). `backend/models.py` still calls `create_all`, which only creates *missing* tables, so it is harmless against a migrated DB. The scraper writes `listings`, heartbeats `scraper_status`, and reads `users`/`searches`.

- **`@fsf/engine` (`packages/engine`) is the TypeScript replacement for `backend/`'s logic**, as a pure library: Craigslist parsing over plain HTTP (no browser; see `docs/decisions/0001-http-not-browser.md`), the exclude filter, the Claude classifier, notifiers, and the shared form validation (`@fsf/engine/validate`, which the web app re-exports from `lib/validate.ts`). Functions take their dependencies (fetch, Anthropic client, clock) as arguments. `apps/worker` wires it up.

- **`apps/worker` (`@fsf/worker`) is the TypeScript scraper loop**, built on pg-boss queues stored in the same Postgres (schema `pgboss`): `schedule` (cron, every minute: syncs `search_urls`/`search_watches` from active searches, claims due URLs, heartbeats `worker_status`, requeues stuck matches) → `scrape-url` (one per *distinct* URL, inserts `posts`, creates `matches` rows) → `match` (exclude filter, post-page fetch, classify) → `notify`. The first scrape of each (search, URL) pair is a no-alert baseline. It honors the same `scraper_status.scraper_enabled` kill-switch. **Shadow mode:** `NOTIFY_DRY_RUN=1` (the compose default via `WORKER_NOTIFY_DRY_RUN`) records `notifications` as `dry_run` and sends nothing, so it can run next to the Python scraper. The Python scraper writes `listings`; the worker writes `posts`/`matches`. They don't overlap.

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
pnpm --filter @fsf/worker dev   # worker with reload (needs ANTHROPIC_API_KEY; set NOTIFY_DRY_RUN=1 to send nothing)
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

Next.js 15 App Router, React 19, Radix Themes, Drizzle + `postgres`. All admin pages are server components marked `force-dynamic` (live DB reads). Mutations are server actions, not API routes.

- **`middleware.ts` runs two separate gates:** `/admin/*` is HTTP Basic Auth (`admin` / `ADMIN_PASSWORD`); everything else requires the invite-code cookie set by `/gate` (`INVITE_CODE`). Both use a hand-rolled constant-time compare because middleware runs on the Edge runtime (no `node:crypto`). Leaving `ADMIN_PASSWORD` unset locks `/admin` to everyone.
- **`db/index.ts`** builds the pool via `createDb()` from `@fsf/db` (size: `DB_POOL_MAX`, default 10) and caches it on `globalThis` across dev hot-reloads to avoid connection leaks; reads the same `DB_*` env vars as the Python side.
- **Admin data layer:** `app/admin/queries.ts` (reads) and `app/admin/actions.ts` (server-action writes). List/overview pages paginate via `?page=N` URL params (`app/admin/pager.tsx`), deriving "has next page" by fetching one row past the page size (no count query).

## Config

All runtime config lives in `.env` at repo root (gitignored; copy from `.env.example`). Key vars: `ANTHROPIC_API_KEY`, `INVITE_CODE`, `ADMIN_PASSWORD`, `DB_*`. Compose overrides `DB_HOST`/`SELENIUM_REMOTE_URL` for the container network, so the `DB_*` values in `.env` only matter for bare-metal runs. DB defaults are `postgres`/`postgres`/`craigslist` on `:5432`; web serves on `:8000`.

## Code style

This repo uses "ponytail" comments (`# ponytail:` / `// ponytail:`) to mark deliberate simplifications and name their upgrade path. They're intent, not TODOs — read them before "fixing" something that looks too simple.
