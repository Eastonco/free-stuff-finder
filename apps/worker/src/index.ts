// The free-stuff-finder worker: pg-boss queues over the same Postgres, wiring
// @fsf/engine's pure pieces to the database.
//
//   schedule (cron, every minute) → scrape-url (per distinct URL)
//     → match (per new search×post pair) → notify (per 'want')
import Anthropic from "@anthropic-ai/sdk";
import { createDb, dbConfigFromEnv } from "@fsf/db";
import { runMigrations } from "@fsf/db/migrate";
import {
  type Classifier,
  createClassifier,
  createFailureWindow,
  createHostThrottle,
  createNotifier,
  createOpenRouterClassifier,
  DEFAULT_USER_AGENT,
  fetchHtml,
} from "@fsf/engine";
import { OpenRouter } from "@openrouter/sdk";
import { type Job, PgBoss } from "pg-boss";

import { loadConfig } from "./config";
import { type Ctx, consoleLogger as log } from "./context";
import { runMatch } from "./jobs/match";
import { runNotify } from "./jobs/notify";
import { runSchedule } from "./jobs/schedule";
import { runScrape } from "./jobs/scrape";
import { type Attempt, QUEUES } from "./queues";

const config = loadConfig();
const { db, sql } = createDb({ max: config.SCRAPE_CONCURRENCY + config.MATCH_CONCURRENCY + 2 });
await runMigrations(db);

const classify: Classifier =
  config.CLASSIFIER === "openrouter"
    ? createOpenRouterClassifier({
        client: new OpenRouter({ apiKey: config.OPENROUTER_API_KEY, timeoutMs: 30_000 }),
        model: config.OPENROUTER_MODEL || undefined,
        wantThreshold: config.OPENROUTER_WANT_THRESHOLD,
      })
    : createClassifier({ client: new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 30_000 }) });

const throttle = createHostThrottle(config.HOST_MIN_INTERVAL_MS);
const userAgent = config.SCRAPER_USER_AGENT || DEFAULT_USER_AGENT;

const ctx: Ctx = {
  db,
  log,
  now: () => new Date(),
  fetchHtml: async (url) => {
    await throttle(url);
    return fetchHtml(url, { userAgent });
  },
  classify,
  notify: createNotifier({ ntfyServer: config.NTFY_SERVER, twilio: config.twilio }),
  failures: createFailureWindow({
    windowMs: config.FAIL_OPEN_WINDOW_MINUTES * 60_000,
    threshold: config.FAIL_OPEN_THRESHOLD,
  }),
  enqueue: async (queue, jobs) => {
    await boss.insert(
      queue,
      jobs.map((j) => ({ data: j.data, singletonKey: j.singletonKey })),
    );
  },
  settings: {
    scrapeIntervalSeconds: config.SCRAPE_INTERVAL_SECONDS,
    notifyDryRun: config.NOTIFY_DRY_RUN,
    emptyParseWarnAfter: 3,
  },
};

const boss = new PgBoss({ ...dbConfigFromEnv(), max: 4, application_name: "fsf-worker" });
boss.on("error", (err) => log.error("pg-boss error", { error: String(err) }));
await boss.start();

for (const q of Object.values(QUEUES)) {
  if (!(await boss.getQueue(q.name))) await boss.createQueue(q.name, q.options);
  else await boss.updateQueue(q.name, q.options);
}

const attempt = (job: Job<unknown>, retryLimit: number): Attempt => ({ retryCount: job.retryCount, retryLimit });

await boss.work(QUEUES.schedule.name, async () => {
  await runSchedule(ctx);
});
await boss.work<{ searchUrlId: number }>(
  QUEUES.scrape.name,
  { localConcurrency: config.SCRAPE_CONCURRENCY },
  async ([job]) => job && runScrape(ctx, job.data),
);
await boss.work<{ matchId: number }>(
  QUEUES.match.name,
  { localConcurrency: config.MATCH_CONCURRENCY },
  async ([job]) => job && runMatch(ctx, job.data, attempt(job, QUEUES.match.options.retryLimit)),
);
await boss.work<{ matchId: number }>(QUEUES.notify.name, async ([job]) =>
  job ? runNotify(ctx, job.data, attempt(job, QUEUES.notify.options.retryLimit)) : undefined,
);

await boss.schedule(QUEUES.schedule.name, "* * * * *");
await boss.send(QUEUES.schedule.name, {}); // don't wait up to a minute for the first tick

log.info("worker started", {
  dryRun: config.NOTIFY_DRY_RUN,
  classifier: config.CLASSIFIER,
  scrapeIntervalSeconds: config.SCRAPE_INTERVAL_SECONDS,
  sms: Boolean(config.twilio),
});

async function shutdown(signal: string) {
  log.info("shutting down", { signal });
  await boss.stop({ graceful: true, timeout: 20_000 });
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
