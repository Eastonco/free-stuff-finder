// The single source of truth for the Postgres schema. Change it here, then run
// `pnpm --filter @fsf/db db:generate` to write a migration into ./migrations.
//
// This first version mirrors the schema SQLAlchemy's create_all produced (see
// backend/models.py) exactly — down to constraint names, so later migrations
// can alter them — and migration 0000 is a no-op baseline for the live DB. Note: all *_at / time_* columns are ISO-ish strings, not timestamps.
import { boolean, foreignKey, integer, json, pgTable, serial, text, unique, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  notifyChannel: varchar("notify_channel").notNull(), // 'ntfy' | 'sms' | 'discord'
  notifyTarget: varchar("notify_target").notNull(),
  editToken: varchar("edit_token").notNull().unique("users_edit_token_key"), // unguessable; gates edits
  createdAt: varchar("created_at").notNull(),
  pickupPhone: text("pickup_phone"), // E.164, optional — used by the "GET" draft button
  pickupNote: text("pickup_note"), // free-text, woven into the AI pickup message
});

export const searches = pgTable(
  "searches",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    urls: json("urls").$type<string[]>().notNull(),
    preferencePrompt: varchar("preference_prompt").notNull(),
    excludeFilters: json("exclude_filters").$type<string[]>().notNull(),
    active: boolean("active").notNull(),
    createdAt: varchar("created_at").notNull(),
  },
  (t) => [foreignKey({ name: "searches_user_id_fkey", columns: [t.userId], foreignColumns: [users.id] })],
);

export const listings = pgTable(
  "listings",
  {
    id: serial("id").primaryKey(),
    searchId: integer("search_id").notNull(),
    clId: varchar("cl_id").notNull(),
    link: varchar("link").notNull(),
    title: varchar("title").notNull(),
    imageUrl: varchar("image_url"),
    aiLabel: varchar("ai_label"), // 'want' | 'skip' | null (baseline)
    aiScore: integer("ai_score"),
    aiReason: varchar("ai_reason"),
    timePosted: varchar("time_posted").notNull(),
    location: varchar("location").notNull(),
    timeScraped: varchar("time_scraped").notNull(),
  },
  (t) => [
    unique("uq_search_cl_id").on(t.searchId, t.clId),
    foreignKey({ name: "listings_search_id_fkey", columns: [t.searchId], foreignColumns: [searches.id] }),
  ],
);

// Schema only — never populated. Dropped in the normalized-schema migration.
export const reactions = pgTable(
  "reactions",
  {
    id: serial("id").primaryKey(),
    listingId: integer("listing_id").notNull(),
    reaction: varchar("reaction").notNull(), // 'up' | 'down'
    reactedAt: varchar("reacted_at").notNull(),
  },
  (t) => [foreignKey({ name: "reactions_listing_id_fkey", columns: [t.listingId], foreignColumns: [listings.id] })],
);

export const scraperStatus = pgTable("scraper_status", {
  id: serial("id").primaryKey(),
  lastCycleAt: varchar("last_cycle_at").notNull(),
  cycleCount: integer("cycle_count").notNull(),
  scraperEnabled: boolean("scraper_enabled").notNull().default(true), // admin remote kill-switch
});
