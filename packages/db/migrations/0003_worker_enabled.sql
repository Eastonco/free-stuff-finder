ALTER TABLE "worker_status" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Carry the admin kill-switch over from the legacy Python heartbeat row.
INSERT INTO "worker_status" ("id", "enabled")
SELECT 1, COALESCE((SELECT "scraper_enabled" FROM "scraper_status" ORDER BY "id" LIMIT 1), true)
ON CONFLICT ("id") DO UPDATE SET "enabled" = EXCLUDED."enabled";
