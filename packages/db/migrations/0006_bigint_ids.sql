-- 64-bit ids for the two fast-growing tables (and the columns that point at
-- them). A serial's sequence is typed integer too, so widen it as well, or it
-- would still stop at 2^31-1. The tables are small; the rewrite is brief.
ALTER TABLE "posts" ALTER COLUMN "id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER SEQUENCE "posts_id_seq" AS bigint;--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "post_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER SEQUENCE "matches_id_seq" AS bigint;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "match_id" SET DATA TYPE bigint;
