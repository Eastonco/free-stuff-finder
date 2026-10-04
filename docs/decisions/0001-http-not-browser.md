# 0001: Fetch Craigslist over plain HTTP, not a headless browser

**Status:** accepted (2026-10-03) · **Context:** TypeScript rewrite, phase 3 spike

## Problem

The Python scraper drove headless Firefox through Selenium for every search URL,
every cycle, launching a fresh browser each time. It parsed the client-rendered
gallery cards (`.cl-search-result`). That costs a Selenium container
(`shm_size: 2gb`), seconds of CPU per URL, and an implicit dependency on the
gallery's JavaScript.

## What the spike found

Fetching saved search URLs with a plain `GET` (desktop Firefox User-Agent,
following the `301` to `www.craigslist.org/search/...`):

- **Search page (~190 KB):** server-rendered `<ol class="cl-static-search-results">`
  with one `<li class="cl-static-search-result">` per post (359 on both live
  searches): title, link, location. **No image, no post time.**
- **Post ids are unchanged:** the last path segment of each link
  (`/view/d/<slug>/<id>`) is the same `cl_id` the Selenium scraper stored. 356 of
  359 ids on one live search were already in `listings`; the other 3 were new posts.
- **Post page (~18 KB):** static `og:image` (600×450), `#postingbody` description,
  and `<time datetime>` with the exact posted time.
- The embedded `ld_searchpage_results` JSON-LD was empty, so it isn't usable.

## Decision

- List posts from the search page's static HTML (`fetch` + `cheerio`):
  **one request per distinct URL per cycle**.
- Fetch a post's page **only when it will be classified**: it's new, it's not a
  baseline, and it passed the exclude filter. That page supplies the image the
  classifier needs, plus the description (the upgrade path `classify.py`
  anticipated) and a real timestamp.
- No browser and no Selenium service. Requests to one host are spaced by an
  in-process throttle.

## Consequences

- Much lower CPU, RAM and latency per cycle, and one fewer container.
- Classification gets the description too: slightly more tokens per call, and
  likely better accuracy.
- If Craigslist drops the static list, `parseSearchPage` returns `[]`. The worker
  treats several consecutive empty parses of a URL as an alert (per-URL health),
  so this fails loudly. The fallback is a Playwright adapter behind the same
  `ListedPost` shape.
- **Cutover:** the static list can include older posts than the gallery
  exposed, so the worker's first scrape of each URL is a baseline (no alerts),
  the same as the existing first-sight backfill.
