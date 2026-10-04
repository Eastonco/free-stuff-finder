# free-stuff finder

Scrapes **free** listings, runs each new post through **Claude (Haiku, via OpenRouter)**
to decide whether you'd actually want it, and pushes the keepers to you via
**ntfy**, SMS, or Discord. You and a few friends each have an account with your own
searches (what to watch and what you're after), managed through a small web app
exposed publicly via a **Cloudflare Tunnel**.

```
cloudflared (freestuff.yourdomain.com) ──► web (apps/web, Next.js) ─┐
                                                                    ├─► Postgres
worker (apps/worker) ──► Craigslist (plain HTTP) ───────────────────┘   users / searches /
   │                                                                    posts / matches
   └─► Claude Haiku via OpenRouter ──► ntfy / SMS / Discord
```

The web app and the worker share nothing but the Postgres schema, which lives in
`packages/db` (Drizzle, with SQL migrations). The worker's logic (parsing,
classifying, notifying) is a library in `packages/engine`.

# Setup

## Requirements
* Docker (recommended), or Node 22 + pnpm + Postgres for bare-metal
* An [OpenRouter API key](https://openrouter.ai/) (classification is pennies a day at this volume)
* The free [ntfy app](https://ntfy.sh/) on your phone (or a Twilio number for SMS, or a Discord webhook)

## Environment
Copy `.env.example` to `.env` and fill it in (`.env` is gitignored):
```sh
cp .env.example .env
```
At minimum set `OPENROUTER_API_KEY`, `INVITE_CODE`, and `APP_URL` (the public URL sign-in links point to). The `DB_*` values only matter for bare-metal runs.

## Admin dashboard
There are no admin passwords. Create your own account like anyone else, then mark
it admin once:
```sh
pnpm --filter @fsf/db grant-admin <your ntfy topic | phone | user id>
```
Admin accounts see an **Admin** tab with the overview, every search, user and listing,
and worker health.

# Run with Docker (recommended: works on Mac, Pi, anywhere)

Brings up Postgres, the migrations, the web app and the worker.

```sh
cp .env.example .env        # set OPENROUTER_API_KEY, INVITE_CODE, APP_URL
docker compose up -d --build
```

- Web app → http://localhost:8000
- Postgres data persists in the `pgdata` volume.
- The worker checks every saved search every ~90 s. The first scrape of a new search
  records what's already listed as a baseline (no alerts), so nobody gets flooded.
- To record alerts without sending them (e.g. while testing), set
  `WORKER_NOTIFY_DRY_RUN=1` in `.env`.

To deploy an update: `git pull && docker compose up -d --build migrate web worker`.

# Running bare-metal

```sh
# from the repo root; needs Node 22 (see .nvmrc) and pnpm (`corepack enable`)
pnpm install
pnpm --filter @fsf/db db:migrate   # apply schema migrations
pnpm --filter @fsf/worker start    # the worker
pnpm dev                           # the web app on :8000 (or: pnpm build && pnpm --filter @fsf/web start)
```

## (Optional) Expose the web app with a Cloudflare Tunnel
Gives you a stable public URL (e.g. `freestuff.yourdomain.com`) with no port-forwarding.
**Entirely optional** — skip it and use `localhost:8000`. The tunnel runs as a
Compose service behind the `tunnel` profile, so it's off unless you ask for it.

One-time setup (needs a Cloudflare account + a domain on it):
```sh
cloudflared tunnel login                                  # browser auth → writes cert.pem
cloudflared tunnel create freestuff                       # writes ~/.cloudflared/<UUID>.json
cloudflared tunnel route dns freestuff freestuff.yourdomain.com
cp ~/.cloudflared/<UUID>.json ./cloudflared/
cp cloudflared/config.example.yml cloudflared/config.yml  # fill in UUID + hostname
```
Then bring the stack up with the tunnel:
```sh
docker compose --profile tunnel up --build
```
Your domain and credentials live only in the gitignored `./cloudflared/` dir, so a
cloned copy of this repo never carries someone else's tunnel.

# How you and friends use it

1. Go to the public URL and choose **Create an account**. Enter the **invite code**
   (`INVITE_CODE` from `.env`), where alerts should go, and a first search:
   - **Send alerts to**: ntfy (pick an unguessable topic and subscribe to it in the ntfy app), SMS (+phone), or a Discord webhook URL.
   - **Search URLs**: one per line. On the **free** section, set your
     area/radius (the map filter; the default 60 mi is way too wide), make sure sort
     is *newest*, and copy the URL.
   - **What are you looking for?**: plain English, e.g. *"a vintage road bike around
     56cm, no kids bikes, no project bikes."* This is what the AI judges each item against.
   - **Never alert me about**: optional comma-separated words for a hard skip (cheap
     pre-filter that runs before the AI, so obvious junk costs no API call).
2. You're signed in. **My searches** lets you add, edit, pause and delete searches.
   **Account** changes where alerts go and sends a test alert.
3. To sign in again, or on another device, enter your alert destination on **Sign in**.
   A one-time link arrives in the same place your alerts do.

# Notes
- ntfy public topics are world-readable; use an unguessable topic name, or self-host
  ntfy and point `NTFY_SERVER` at it.
- `listings` is the retired Python scraper's history, kept as a read-only archive.
  `pnpm --filter @fsf/worker eval:classifier` uses it to compare classifiers.

# Todo
- [ ] Web feed of each person's hits with 👍/👎, then use them to tune the classifier
- [ ] Read search results from Craigslist's JSON feed (fresher than the static HTML; see `docs/decisions/0001-http-not-browser.md`)
