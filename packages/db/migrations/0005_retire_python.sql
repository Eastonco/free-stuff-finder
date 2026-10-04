-- Retire the Python scraper's leftovers (run only after it has been stopped).

-- Its heartbeat/kill-switch row (replaced by worker_status.enabled in 0003)
-- and the never-populated reactions table.
DROP TABLE "reactions" CASCADE;--> statement-breakpoint
DROP TABLE "scraper_status" CASCADE;--> statement-breakpoint

-- created_at was text in two shapes: Python's isoformat() (UTC, no offset)
-- and JS toISOString() (with Z). Parse both into timestamptz.
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING (
  CASE WHEN "created_at" ~ '(Z|[+-]\d\d(:?\d\d)?)$' THEN "created_at"::timestamptz
       ELSE "created_at"::timestamp AT TIME ZONE 'UTC' END
);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "searches" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING (
  CASE WHEN "created_at" ~ '(Z|[+-]\d\d(:?\d\d)?)$' THEN "created_at"::timestamptz
       ELSE "created_at"::timestamp AT TIME ZONE 'UTC' END
);--> statement-breakpoint
ALTER TABLE "searches" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint

-- Pre-accounts edit links are bearer tokens; store only their sha256 (same
-- scheme as sessions/login_tokens). /profile/<token> hashes before looking up.
UPDATE "users" SET "edit_token" = encode(sha256(convert_to("edit_token", 'UTF8')), 'hex');
