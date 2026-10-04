// The single source of truth for the Postgres schema. Change it here, then run
// `pnpm --filter @fsf/db db:generate` to write a migration into ./migrations.
//
// Migration 0000 is a baseline matching the schema the retired Python scraper's
// SQLAlchemy create_all produced (constraint names included), so the live DB
// adopted migrations without a rebuild. `listings` is that scraper's history,
// kept as a frozen archive (copied into posts/matches by migration 0004).
import {
  bigint,
  bigserial,
  boolean,
  foreignKey,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  notifyChannel: varchar("notify_channel").notNull(), // 'ntfy' | 'sms' | 'discord'
  notifyTarget: varchar("notify_target").notNull(),
  // sha256 of the pre-accounts edit link token; /profile/<token> still signs its owner in
  editToken: varchar("edit_token").notNull().unique("users_edit_token_key"),
  createdAt: tstz("created_at").notNull().defaultNow(),
  pickupPhone: text("pickup_phone"), // E.164, optional — used by the "GET" draft button
  pickupNote: text("pickup_note"), // free-text, woven into the AI pickup message
  isAdmin: boolean("is_admin").notNull().default(false), // sees /admin; grant with `pnpm --filter @fsf/db grant-admin`
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
    createdAt: tstz("created_at").notNull().defaultNow(),
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

// ---------------------------------------------------------------------------
// Worker tables. Real timestamptz throughout.
// ---------------------------------------------------------------------------

/** One distinct search URL, scraped once per cycle no matter how many searches watch it. */
export const searchUrls = pgTable("search_urls", {
  id: serial("id").primaryKey(),
  url: text("url").notNull().unique(), // normalized: no #fragment
  nextScrapeAt: tstz("next_scrape_at").notNull().defaultNow(),
  lastScrapedAt: tstz("last_scraped_at"),
  lastParsedCount: integer("last_parsed_count"),
  consecutiveEmpty: integer("consecutive_empty").notNull().default(0), // parse health: >0 for a while = layout change / block
  lastError: text("last_error"),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

/** Which searches watch which URLs, and whether that pairing has had its no-alert baseline scrape yet. */
export const searchWatches = pgTable(
  "search_watches",
  {
    searchId: integer("search_id")
      .notNull()
      .references(() => searches.id, { onDelete: "cascade" }),
    searchUrlId: integer("search_url_id")
      .notNull()
      .references(() => searchUrls.id, { onDelete: "cascade" }),
    baselinedAt: tstz("baselined_at"),
  },
  (t) => [primaryKey({ columns: [t.searchId, t.searchUrlId] }), index("search_watches_url_idx").on(t.searchUrlId)],
);

/** A post as seen on the source — global, shared by every search that sees it. */
export const posts = pgTable(
  "posts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull().default("craigslist"),
    sourceId: text("source_id").notNull(),
    link: text("link").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    imageUrl: text("image_url"),
    description: text("description"),
    postedAt: tstz("posted_at"),
    detailFetchedAt: tstz("detail_fetched_at"),
    firstSeenAt: tstz("first_seen_at").notNull().defaultNow(),
  },
  (t) => [unique("posts_source_id_key").on(t.source, t.sourceId)],
);

/**
 * One search's verdict on one post. Inserted as 'pending' the moment a scrape
 * sees the pair (ON CONFLICT DO NOTHING makes that the dedup), then filled in.
 * status: 'pending' | 'baseline' | 'excluded' | 'classified'
 */
export const matches = pgTable(
  "matches",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    searchId: integer("search_id")
      .notNull()
      .references(() => searches.id, { onDelete: "cascade" }),
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    label: text("label"), // 'want' | 'skip'
    score: integer("score"),
    reason: text("reason"),
    errorKind: text("error_kind"), // set when the verdict is a fail-open default
    createdAt: tstz("created_at").notNull().defaultNow(),
    decidedAt: tstz("decided_at"),
  },
  (t) => [
    unique("matches_search_post_key").on(t.searchId, t.postId),
    index("matches_search_created_idx").on(t.searchId, t.createdAt.desc()),
    index("matches_label_idx").on(t.label),
  ],
);

/** Delivery attempts for a 'want' match. status: 'sent' | 'failed' | 'dry_run' */
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  matchId: bigint("match_id", { mode: "number" })
    .notNull()
    .unique()
    .references(() => matches.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: tstz("created_at").notNull().defaultNow(),
  sentAt: tstz("sent_at"),
});

/** Single-row heartbeat, health and kill-switch for the worker. */
export const workerStatus = pgTable("worker_status", {
  id: integer("id").primaryKey().default(1),
  lastTickAt: tstz("last_tick_at"),
  tickCount: integer("tick_count").notNull().default(0),
  classifierFailures: integer("classifier_failures").notNull().default(0), // in the current window
  failOpenAlertsPaused: boolean("fail_open_alerts_paused").notNull().default(false),
  notifyDryRun: boolean("notify_dry_run").notNull().default(false),
  /** Admin kill-switch: when false the worker skips scraping (the Overview toggle flips it). */
  enabled: boolean("enabled").notNull().default(true),
});

// ---------------------------------------------------------------------------
// Web sign-in. Tokens are stored as sha256 hashes only; the raw value lives in
// the user's cookie (sessions) or in the one-time link we send them (login_tokens).
// ---------------------------------------------------------------------------

/** A signed-in browser. */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: tstz("created_at").notNull().defaultNow(),
    expiresAt: tstz("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** A one-time sign-in link sent to the user's notification channel. */
export const loginTokens = pgTable(
  "login_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: tstz("created_at").notNull().defaultNow(),
    expiresAt: tstz("expires_at").notNull(),
    usedAt: tstz("used_at"),
  },
  (t) => [index("login_tokens_user_idx").on(t.userId, t.createdAt)],
);
