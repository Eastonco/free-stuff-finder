// Compare classifiers on posts the Python pipeline already labeled.
//
//   pnpm --filter @fsf/worker eval:classifier [sampleSize=150]
//
// Read-only against the DB_* database. For each sampled (search, post) it
// fetches the post page (description), then asks jev (OpenRouter) and Claude
// Haiku the same question on the same inputs. Python's historical label is a
// reference, not ground truth: it saw title + photo only.
import Anthropic from "@anthropic-ai/sdk";
import { and, createDb, desc, eq, inArray, listings, not, searches, sql } from "@fsf/db";
import {
  createClassifier,
  createHostThrottle,
  createOpenRouterClassifier,
  fetchHtml,
  parseDetailPage,
  type Verdict,
} from "@fsf/engine";
import { OpenRouter } from "@openrouter/sdk";

const N = Number(process.argv[2] ?? 150);
if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");

const { db, sql: conn } = createDb({ max: 2 });

// Recent posts (more likely still live), balanced want/skip, real verdicts only.
const sample = async (label: "want" | "skip") =>
  db
    .select({
      searchId: listings.searchId,
      title: listings.title,
      link: listings.link,
      image: listings.imageUrl,
      label: listings.aiLabel,
      preference: searches.preferencePrompt,
    })
    .from(listings)
    .innerJoin(searches, eq(searches.id, listings.searchId))
    .where(
      and(
        eq(listings.aiLabel, label),
        not(inArray(listings.aiReason, ["excluded by filter", "backfill"])),
        sql`${listings.aiReason} not like 'classification unavailable%'`,
      ),
    )
    .orderBy(desc(listings.id))
    .limit(Math.ceil(N / 2));
const rows = [...(await sample("want")), ...(await sample("skip"))];

// Wrap OpenRouter to capture probability, latency and cost per call.
const orClient = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY, timeoutMs: 30_000 });
const jevStats: { ms: number; cost: number }[] = [];
const create = orClient.alpha.decisions.create.bind(orClient.alpha.decisions);
const jev = createOpenRouterClassifier({
  client: {
    alpha: {
      decisions: {
        create: async (...args: Parameters<typeof create>) => {
          const t = performance.now();
          const res = await create(...args);
          jevStats.push({ ms: performance.now() - t, cost: res.usage.cost ?? 0 });
          return res;
        },
      },
    },
  } as unknown as Pick<OpenRouter, "alpha">,
  model: process.env.OPENROUTER_MODEL || undefined,
});
const haiku = process.env.ANTHROPIC_API_KEY
  ? createClassifier({ client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 }) })
  : null;

const throttle = createHostThrottle(1500);
const details = new Map<string, { description: string; imageUrl: string | null; live: boolean }>();
type Row = (typeof rows)[number] & { live: boolean; jev: Verdict; haiku: Verdict | null };
const results: Row[] = [];

console.error(`evaluating ${rows.length} posts (${haiku ? "jev + haiku" : "jev only"})…`);
for (const [i, r] of rows.entries()) {
  if (!details.has(r.link)) {
    await throttle(r.link);
    try {
      const d = parseDetailPage(await fetchHtml(r.link));
      details.set(r.link, {
        description: d.description,
        imageUrl: d.imageUrl ?? r.image,
        live: Boolean(d.description),
      });
    } catch {
      details.set(r.link, { description: "", imageUrl: r.image, live: false });
    }
  }
  const d = details.get(r.link) ?? { description: "", imageUrl: r.image, live: false };
  const input = { title: r.title, description: d.description, imageUrl: d.imageUrl, preference: r.preference };
  const [jv, hv] = await Promise.all([jev(input), haiku ? haiku(input) : Promise.resolve(null)]);
  results.push({ ...r, live: d.live, jev: jv, haiku: hv });
  if ((i + 1) % 25 === 0) console.error(`  ${i + 1}/${rows.length}`);
}
await conn.end();

// ---- report ----
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "—");
const ok = results.filter((r) => !r.jev.error && !r.haiku?.error);
const agree = (f: (r: Row) => string | undefined, g: (r: Row) => string | undefined, set = ok) =>
  `${pct(set.filter((r) => f(r) === g(r)).length, set.length)} (n=${set.length})`;
const jevLabelAt = (r: Row, t: number) => (r.jev.score / 100 >= t ? "want" : "skip");

console.log(
  `\nposts: ${results.length}, live pages: ${results.filter((r) => r.live).length}, errors: jev ${results.filter((r) => r.jev.error).length}, haiku ${results.filter((r) => r.haiku?.error).length}`,
);
console.log("\nagreement (threshold 0.5):");
console.log(
  `  jev   vs python(historical): ${agree(
    (r) => r.jev.label,
    (r) => r.label ?? undefined,
  )}`,
);
if (haiku) {
  console.log(
    `  haiku vs python(historical): ${agree(
      (r) => r.haiku?.label,
      (r) => r.label ?? undefined,
    )}`,
  );
  console.log(
    `  jev   vs haiku (same input): ${agree(
      (r) => r.jev.label,
      (r) => r.haiku?.label,
    )}`,
  );
}
const live = ok.filter((r) => r.live);
if (haiku)
  console.log(
    `  jev   vs haiku, live pages only: ${agree(
      (r) => r.jev.label,
      (r) => r.haiku?.label,
      live,
    )}`,
  );

console.log("\njev threshold sweep (agreement with haiku if available, else python):");
for (const t of [0.3, 0.4, 0.5, 0.6, 0.7]) {
  const ref = (r: Row) => (haiku ? r.haiku?.label : (r.label ?? undefined));
  const wants = ok.filter((r) => jevLabelAt(r, t) === "want").length;
  console.log(`  ${t.toFixed(1)}: agree ${agree((r) => jevLabelAt(r, t), ref)}, wants ${pct(wants, ok.length)}`);
}

const ms = jevStats.map((s) => s.ms).sort((a, b) => a - b);
const q = (p: number) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))]?.toFixed(0);
const cost = jevStats.reduce((s, x) => s + x.cost, 0);
console.log(
  `\njev latency p50 ${q(0.5)}ms p95 ${q(0.95)}ms; cost $${cost.toFixed(4)} total, $${(cost / Math.max(1, jevStats.length)).toFixed(5)}/call`,
);

console.log("\njev vs haiku disagreements:");
for (const r of ok.filter((r) => haiku && r.jev.label !== r.haiku?.label).slice(0, 15)) {
  console.log(
    `  [s${r.searchId}] jev ${r.jev.label} ${r.jev.score} | haiku ${r.haiku?.label} ${r.haiku?.score} "${r.haiku?.reason}" | ${r.title.slice(0, 50)}`,
  );
}
