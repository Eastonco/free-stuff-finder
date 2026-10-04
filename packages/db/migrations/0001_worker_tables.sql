CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"search_id" integer NOT NULL,
	"post_id" integer NOT NULL,
	"status" text NOT NULL,
	"label" text,
	"score" integer,
	"reason" text,
	"error_kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "matches_search_post_key" UNIQUE("search_id","post_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "notifications_match_id_unique" UNIQUE("match_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'craigslist' NOT NULL,
	"source_id" text NOT NULL,
	"link" text NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"image_url" text,
	"description" text,
	"posted_at" timestamp with time zone,
	"detail_fetched_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_source_id_key" UNIQUE("source","source_id")
);
--> statement-breakpoint
CREATE TABLE "search_urls" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"next_scrape_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_scraped_at" timestamp with time zone,
	"last_parsed_count" integer,
	"consecutive_empty" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_urls_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "search_watches" (
	"search_id" integer NOT NULL,
	"search_url_id" integer NOT NULL,
	"baselined_at" timestamp with time zone,
	CONSTRAINT "search_watches_search_id_search_url_id_pk" PRIMARY KEY("search_id","search_url_id")
);
--> statement-breakpoint
CREATE TABLE "worker_status" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_tick_at" timestamp with time zone,
	"tick_count" integer DEFAULT 0 NOT NULL,
	"classifier_failures" integer DEFAULT 0 NOT NULL,
	"fail_open_alerts_paused" boolean DEFAULT false NOT NULL,
	"notify_dry_run" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_watches" ADD CONSTRAINT "search_watches_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_watches" ADD CONSTRAINT "search_watches_search_url_id_search_urls_id_fk" FOREIGN KEY ("search_url_id") REFERENCES "public"."search_urls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matches_search_created_idx" ON "matches" USING btree ("search_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "matches_label_idx" ON "matches" USING btree ("label");--> statement-breakpoint
CREATE INDEX "search_watches_url_idx" ON "search_watches" USING btree ("search_url_id");