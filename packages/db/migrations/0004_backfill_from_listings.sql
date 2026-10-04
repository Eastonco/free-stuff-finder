-- Cutover: copy the Python scraper's history (listings) into the worker's
-- tables so the worker knows every post each search has already judged and
-- never re-alerts on a repost. Idempotent: rows the worker already has win
-- (ON CONFLICT DO NOTHING), and re-running it adds nothing.
--
-- listings.time_scraped is 'YYYY-MM-DD HH:MM:SS' written by a UTC container.

-- One post per distinct Craigslist id, first seen at its earliest scrape.
INSERT INTO "posts" ("source", "source_id", "link", "title", "location", "image_url", "first_seen_at")
SELECT DISTINCT ON (l."cl_id")
  'craigslist',
  l."cl_id",
  l."link",
  l."title",
  NULLIF(l."location", ''),
  l."image_url",
  (SELECT MIN(x."time_scraped") FROM "listings" x WHERE x."cl_id" = l."cl_id")::timestamp AT TIME ZONE 'UTC'
FROM "listings" l
ORDER BY l."cl_id", l."id"
ON CONFLICT ("source", "source_id") DO NOTHING;
--> statement-breakpoint
-- One match per (search, post), mirroring Python's verdict.
INSERT INTO "matches" ("search_id", "post_id", "status", "label", "score", "reason", "error_kind", "created_at", "decided_at")
SELECT
  l."search_id",
  p."id",
  CASE
    WHEN l."ai_reason" = 'backfill' THEN 'baseline'
    WHEN l."ai_reason" = 'excluded by filter' THEN 'excluded'
    ELSE 'classified'
  END,
  CASE WHEN l."ai_reason" = 'backfill' THEN NULL ELSE l."ai_label" END,
  l."ai_score",
  l."ai_reason",
  substring(l."ai_reason" FROM '^classification unavailable \(([^)]*)\)$'),
  l."time_scraped"::timestamp AT TIME ZONE 'UTC',
  l."time_scraped"::timestamp AT TIME ZONE 'UTC'
FROM "listings" l
JOIN "posts" p ON p."source" = 'craigslist' AND p."source_id" = l."cl_id"
ON CONFLICT ("search_id", "post_id") DO NOTHING;
