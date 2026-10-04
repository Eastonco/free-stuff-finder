CREATE TABLE "listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"search_id" integer NOT NULL,
	"cl_id" varchar NOT NULL,
	"link" varchar NOT NULL,
	"title" varchar NOT NULL,
	"image_url" varchar,
	"ai_label" varchar,
	"ai_score" integer,
	"ai_reason" varchar,
	"time_posted" varchar NOT NULL,
	"location" varchar NOT NULL,
	"time_scraped" varchar NOT NULL,
	CONSTRAINT "uq_search_cl_id" UNIQUE("search_id","cl_id")
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"reaction" varchar NOT NULL,
	"reacted_at" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scraper_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"last_cycle_at" varchar NOT NULL,
	"cycle_count" integer NOT NULL,
	"scraper_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"urls" json NOT NULL,
	"preference_prompt" varchar NOT NULL,
	"exclude_filters" json NOT NULL,
	"active" boolean NOT NULL,
	"created_at" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"notify_channel" varchar NOT NULL,
	"notify_target" varchar NOT NULL,
	"edit_token" varchar NOT NULL,
	"created_at" varchar NOT NULL,
	"pickup_phone" text,
	"pickup_note" text,
	CONSTRAINT "users_edit_token_key" UNIQUE("edit_token")
);
--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;