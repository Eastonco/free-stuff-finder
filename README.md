# free-stuff finder

Scrapes **free** listings, runs each new post through **Claude (Haiku)**
to decide whether you'd actually want it, and pushes the keepers to you via
**ntfy** (or SMS). You and a few friends each set up your own profile — what to
watch and what you're after — through a small self-serve web page, exposed
publicly via a **Cloudflare Tunnel**. Runs on a Raspberry Pi.

Config lives in **Postgres**, not JSON files: the web form writes it, the scraper
loop reads everyone's active searches each cycle.

```
cloudflared (freestuff.yourdomain.com) ──► Next.js web app (apps/web) ─────┐
                                                                 ├─► Postgres
        scraper loop (main.py) ──────────────────────────────────┘   users / searches
              │                                                       listings / reactions
              └─► Claude Haiku (classify.py) ──► ntfy / SMS (notify.py)
```

The web app and the scraper are independent services that share nothing but the
Postgres schema. The Next.js app reads/writes `users`/`searches` directly; the
Python scraper owns the schema (creates the tables on first run).

# Setup

## Requirements
* A 64-bit Raspberry Pi (or any Linux box), Python 3.9+
* `firefox` + geckodriver (`apt install firefox` includes it on the Pi)
* `postgresql`
* An [Anthropic API key](https://console.anthropic.com/) (classification is pennies/cycle at this volume)
* The free [ntfy app](https://ntfy.sh/) on your phone (or a Twilio number for SMS)

```sh
pip install -r requirements.txt
```

## Postgres
```sh
apt install postgresql
sudo -u postgres psql
\password postgres        # set a password
CREATE DATABASE craigslist;
```
Tables are created automatically on first run.

## Environment
Copy `.env.example` to `.env` and fill it in (`.env` is gitignored):
```sh
cp .env.example .env
```
At minimum set `ANTHROPIC_API_KEY`, `INVITE_CODE`, `ADMIN_PASSWORD`, and the `DB_*` values.

## Admin dashboard
`GET /admin` (e.g. http://localhost:8000/admin) shows every profile, their notify
settings, per-search scrape stats, scraper liveness (a heartbeat the loop writes
each cycle), and recent classifications. It's read-only and gated by **HTTP Basic
Auth** — username `admin`, password = `ADMIN_PASSWORD` from `.env`. Leave
`ADMIN_PASSWORD` unset and `/admin` is locked to everyone.

# Run with Docker (recommended — works on Mac, Pi, anywhere)

Brings up Postgres, a headless Firefox (Selenium), the web app, and the scraper
loop together. Only prerequisite is Docker + a filled-in `.env`.

```sh
cp .env.example .env        # set ANTHROPIC_API_KEY + INVITE_CODE
docker compose up --build
```

- Web app → http://localhost:8000
- The scraper reaches the browser via the `selenium` service (`SELENIUM_REMOTE_URL`),
  so there's no geckodriver to install.
- Postgres data persists in the `pgdata` volume.

Compose overrides `DB_HOST`/`SELENIUM_REMOTE_URL` for the container network, so the
`DB_*` values in `.env` only matter for bare-metal runs (below).

# Running bare-metal (e.g. directly on the Pi)

Two processes run side by side:

**1. The scraper loop**
```sh
python -m backend.main
```
Every ~minute it reads all active searches from Postgres, scrapes them, classifies
new free items, and notifies the owner. The first time it sees a new search it
records the current listings as a baseline (no alerts, no API spend) so you aren't
flooded — alerts start on the next cycle.

**2. The web app** (so you + friends can self-serve)
```sh
# from the repo root; needs Node 22 (see .nvmrc) and pnpm
pnpm install
pnpm --filter @fsf/db db:migrate # apply schema migrations (packages/db/migrations)
pnpm dev          # or: pnpm build && pnpm --filter @fsf/web start  (both serve on :8000)
```
The web app is a Next.js project in `apps/web`. It talks to Postgres directly using
the same `DB_*` env vars as the scraper.

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

1. Go to the public URL, enter the **invite code** (`INVITE_CODE` from `.env`).
2. Fill in the profile:
   - **Notify via** — ntfy (pick an unguessable topic, subscribe to it in the ntfy app), SMS (+phone), or a Discord webhook URL.
   - **Search URLs** — one per line. On the **free** section, set your
     area/radius (the map filter — the default 60 mi is way too wide), make sure sort
     is *newest*, and copy the URL.
   - **What are you looking for?** — plain English, e.g. *"a vintage road bike around
     56cm, no kids bikes, no project bikes."* This is what the AI judges each item against.
   - **Never alert me about** — optional comma-separated words for a hard skip (cheap
     pre-filter that runs before the AI, so obvious junk costs no API call).
3. You get a private edit link — bookmark it to tweak your profile later.

Only URLs are accepted (the scraper opens them in a real browser, so this
is enforced server-side).

# Notes
- Old SMS-command control and the per-person JSON config files are gone — the web
  app replaces them.
- ntfy public topics are world-readable; use an unguessable topic name, or self-host
  ntfy and point `NTFY_SERVER` at it.
- Deployment hints (geckodriver, etc.) are in `notes.md`.

# Todo
- [ ] Web feed of each person's hits with 👍/👎 (schema is already there: `reactions` table)
- [ ] Train a learned classifier once enough reactions are collected
- [ ] Dockerize for easy deploy
- [ ] Parse "4 mins ago" into a real timestamp; tighten DB datatypes
