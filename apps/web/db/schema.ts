// Typed mirror of models.py. Python (init_db / SQLAlchemy create_all) owns the
// real schema; this only exists so TS queries are typed. Keep in sync — or
// regenerate with `npm run db:pull`. Note: all *_at / time_* columns store ISO
// strings (SQLAlchemy String), so they are text here, not timestamps.
import { boolean, integer, json, pgTable, serial, text, unique } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  notifyChannel: text("notify_channel").notNull(), // 'ntfy' | 'sms' | 'discord'
  notifyTarget: text("notify_target").notNull(),
  editToken: text("edit_token").notNull().unique(), // unguessable; gates edits
  createdAt: text("created_at").notNull(),
  pickupPhone: text("pickup_phone"), // E.164, optional — used by the "GET" draft button
  pickupNote: text("pickup_note"), // free-text, woven into the AI pickup message
});

export const searches = pgTable("searches", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  urls: json("urls").$type<string[]>().notNull(),
  preferencePrompt: text("preference_prompt").notNull(),
  excludeFilters: json("exclude_filters").$type<string[]>().notNull(),
  active: boolean("active").notNull(),
  createdAt: text("created_at").notNull(),
});

export const listings = pgTable(
  "listings",
  {
    id: serial("id").primaryKey(),
    searchId: integer("search_id").notNull(),
    clId: text("cl_id").notNull(),
    link: text("link").notNull(),
    title: text("title").notNull(),
    imageUrl: text("image_url"),
    aiLabel: text("ai_label"), // 'want' | 'skip' | null (baseline)
    aiScore: integer("ai_score"),
    aiReason: text("ai_reason"),
    timePosted: text("time_posted").notNull(),
    location: text("location").notNull(),
    timeScraped: text("time_scraped").notNull(),
  },
  (t) => ({ uqSearchClId: unique("uq_search_cl_id").on(t.searchId, t.clId) }),
);

export const scraperStatus = pgTable("scraper_status", {
  id: serial("id").primaryKey(),
  lastCycleAt: text("last_cycle_at").notNull(),
  cycleCount: integer("cycle_count").notNull(),
  scraperEnabled: boolean("scraper_enabled").notNull().default(true),
});
