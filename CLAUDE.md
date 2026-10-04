# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A free-listings scraper + self-serve web app. A Python loop scrapes each user's saved searches, runs every new free item through Claude Haiku (`claude-haiku-4-5`) to judge whether they'd want it, and notifies them via ntfy/SMS/Discord. A Next.js app (`apps/web`) lets users manage their profile and gives an admin dashboard. Designed to run on a Raspberry Pi.

## The one architectural fact that explains everything

**The backend (Python, `backend/`) and web app (Next.js, `apps/web/`) are independent services that share nothing but the Postgres schema.** There is no API between them. They communicate entirely through the database.

- **Python owns the schema.** `backend/models.py` (SQLAlchemy) defines the tables; `init_db()` (`Base.metadata.create_all`) creates them on the scraper's first run. The scraper writes `listings`, heartbeats `scraper_status`, and reads `users`/`searches`.
- **The web app uses a typed mirror.** `apps/web/db/schema.ts` is a hand-kept Drizzle copy of the Python schema, regenerated from the live DB with `pnpm --filter @fsf/web db:pull`. The web app reads/writes `users`/`searches` directly via Drizzle.

### Consequences you must respect

- **A schema change is a two-file change:** edit `backend/models.py` AND `apps/web/db/schema.ts` to keep them in sync (or run `pnpm --filter @fsf/web db:pull` after the Python side is live).
- **`create_all` never alters existing tables.** Adding a column to a table that already exists in a running DB requires a manual migration, e.g.:
  ```sh
  docker compose exec -T db psql -U postgres -d craigslist -c \
    "ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <col> <type> NOT NULL DEFAULT <x>;"
  ```
  Without this, both the scraper and the web queries will error on the missing column.

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
pnpm lint          # biome check (pnpm format to auto-fix)
pnpm --filter @fsf/web db:pull   # regenerate apps/web/db/schema.ts from the live Postgres
```
CI (`.github/workflows/ci.yml`) runs lint, typecheck, test and build on every PR.

### Full stack (Docker, from repo root)
```sh
docker compose up --build      # Postgres + headless Firefox (Selenium) + web + scraper
docker compose --profile tunnel up --build   # also start the Cloudflare tunnel
```
**Dev footgun:** the web container only live-syncs source edits when started with **`docker compose watch`** (or `up --watch`). A plain `docker compose up` does NOT sync your edits into the container — they'll sit on disk while the container runs stale code. Either run `docker compose watch web`, or `docker compose cp ./apps/web/<file> web:/app/apps/web/<file>` to push individual files (Next dev then hot-reloads).

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
- **`db/index.ts`** caches the postgres pool on `globalThis` across dev hot-reloads to avoid connection leaks; reads the same `DB_*` env vars as the Python side.
- **Admin data layer:** `app/admin/queries.ts` (reads) and `app/admin/actions.ts` (server-action writes). List/overview pages paginate via `?page=N` URL params (`app/admin/pager.tsx`), deriving "has next page" by fetching one row past the page size (no count query).

## Config

All runtime config lives in `.env` at repo root (gitignored; copy from `.env.example`). Key vars: `ANTHROPIC_API_KEY`, `INVITE_CODE`, `ADMIN_PASSWORD`, `DB_*`. Compose overrides `DB_HOST`/`SELENIUM_REMOTE_URL` for the container network, so the `DB_*` values in `.env` only matter for bare-metal runs. DB defaults are `postgres`/`postgres`/`craigslist` on `:5432`; web serves on `:8000`.

## Code style

This repo uses "ponytail" comments (`# ponytail:` / `// ponytail:`) to mark deliberate simplifications and name their upgrade path. They're intent, not TODOs — read them before "fixing" something that looks too simple.
