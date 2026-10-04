// Decide one pending (search, post) pair: exclude filter → fetch the post page
// (image + description, once per post) → classify → record → maybe notify.
import { and, eq, matches, posts, searches } from "@fsf/db";
import { decideMatch, parseDetailPage } from "@fsf/engine";

import type { Ctx } from "../context";
import { type Attempt, isFinalAttempt } from "../queues";

/** Thrown to make pg-boss retry the job (its retry policy handles backoff). */
export class RetryableJobError extends Error {
  override name = "RetryableJobError";
}

export async function runMatch(ctx: Ctx, data: { matchId: number }, attempt: Attempt): Promise<string> {
  const { db } = ctx;
  const [row] = await db
    .select({ match: matches, post: posts, search: searches })
    .from(matches)
    .innerJoin(posts, eq(posts.id, matches.postId))
    .innerJoin(searches, eq(searches.id, matches.searchId))
    .where(eq(matches.id, data.matchId))
    .limit(1);
  if (row?.match.status !== "pending") return "already decided";
  const { match, post, search } = row;

  if (!search.active) {
    await settle(ctx, match.id, { status: "baseline", reason: "search inactive" });
    return "search inactive";
  }

  const decision = await decideMatch({
    title: post.title,
    search: { isBaseline: false, excludeFilters: search.excludeFilters ?? [] },
    allowFailOpenAlerts: !ctx.failures.tripped(),
    classify: async () => {
      const detail = await ensureDetail(ctx, post);
      return ctx.classify({
        title: post.title,
        imageUrl: detail.imageUrl,
        description: detail.description,
        preference: search.preferencePrompt,
      });
    },
  });

  if (decision.kind === "baseline") return "baseline";

  const { verdict } = decision;
  let alert = decision.kind === "classified" && decision.alert;

  if (verdict.error) {
    if (verdict.error.retryable && !isFinalAttempt(attempt)) {
      throw new RetryableJobError(`classifier ${verdict.error.kind}; retrying`);
    }
    ctx.failures.record();
    // re-check after recording: this failure may be the one that trips the window
    if (ctx.failures.tripped()) alert = false;
    ctx.log.warn("classification failed open", {
      matchId: match.id,
      kind: verdict.error.kind,
      recentFailures: ctx.failures.count(),
      alertsPaused: ctx.failures.tripped(),
    });
  }

  const settled = await settle(ctx, match.id, {
    status: decision.kind,
    label: verdict.label,
    score: verdict.score,
    reason: verdict.reason,
    errorKind: verdict.error?.kind ?? null,
  });
  if (!settled) return "raced";

  ctx.log.info("matched", {
    matchId: match.id,
    searchId: search.id,
    label: verdict.label,
    score: verdict.score,
    title: post.title,
    alert,
  });
  if (alert) await ctx.enqueue("notify", [{ data: { matchId: match.id }, singletonKey: `notify:${match.id}` }]);
  return `${decision.kind}:${verdict.label}`;
}

/** Writes the verdict only if the row is still pending; false if another job got there first. */
async function settle(
  ctx: Ctx,
  matchId: number,
  fields: { status: string; label?: string; score?: number; reason?: string; errorKind?: string | null },
): Promise<boolean> {
  const rows = await ctx.db
    .update(matches)
    .set({ ...fields, decidedAt: ctx.now() })
    .where(and(eq(matches.id, matchId), eq(matches.status, "pending")))
    .returning({ id: matches.id });
  return rows.length > 0;
}

/** Fetch a post's own page once (image, description, posted time). A gone/blocked page isn't fatal. */
async function ensureDetail(ctx: Ctx, post: typeof posts.$inferSelect) {
  if (post.detailFetchedAt) return { imageUrl: post.imageUrl, description: post.description };
  let detail = { imageUrl: null as string | null, description: "", postedAt: null as Date | null };
  try {
    detail = parseDetailPage(await ctx.fetchHtml(post.link));
  } catch (err) {
    ctx.log.warn("post page fetch failed; classifying on title alone", { postId: post.id, error: String(err) });
  }
  await ctx.db
    .update(posts)
    .set({
      imageUrl: detail.imageUrl,
      description: detail.description || null,
      postedAt: detail.postedAt,
      detailFetchedAt: ctx.now(),
    })
    .where(eq(posts.id, post.id));
  return { imageUrl: detail.imageUrl, description: detail.description };
}
