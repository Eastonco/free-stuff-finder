// Deliver one 'want' match to its owner. Idempotent: a match is sent at most once.
import { eq, matches, notifications, posts, searches, sql, users } from "@fsf/db";

import type { Ctx } from "../context";
import { type Attempt, isFinalAttempt } from "../queues";
import { RetryableJobError } from "./match";

export async function runNotify(ctx: Ctx, data: { matchId: number }, attempt: Attempt): Promise<string> {
  const { db } = ctx;
  const [row] = await db
    .select({ match: matches, post: posts, user: users, sent: notifications.status })
    .from(matches)
    .innerJoin(posts, eq(posts.id, matches.postId))
    .innerJoin(searches, eq(searches.id, matches.searchId))
    .innerJoin(users, eq(users.id, searches.userId))
    .leftJoin(notifications, eq(notifications.matchId, matches.id))
    .where(eq(matches.id, data.matchId))
    .limit(1);
  if (row?.match.label !== "want") return "nothing to send";
  if (row.sent === "sent" || row.sent === "dry_run") return "already sent";

  const { match, post, user } = row;
  const channel = user.notifyChannel;

  if (ctx.settings.notifyDryRun) {
    await record(ctx, match.id, channel, { status: "dry_run", error: null, sentAt: ctx.now() });
    ctx.log.info("notify (dry run)", { matchId: match.id, channel, title: post.title });
    return "dry_run";
  }

  const result = await ctx.notify(
    { channel, target: user.notifyTarget },
    { title: post.title, reason: match.reason ?? "", link: post.link, imageUrl: post.imageUrl },
  );

  if (result.ok) {
    await record(ctx, match.id, channel, { status: "sent", error: null, sentAt: ctx.now() });
    ctx.log.info("notified", { matchId: match.id, channel, title: post.title });
    return "sent";
  }

  await record(ctx, match.id, channel, { status: "failed", error: result.error, sentAt: null });
  ctx.log.warn("notify failed", { matchId: match.id, channel, error: result.error, retryable: result.retryable });
  if (result.retryable && !isFinalAttempt(attempt)) throw new RetryableJobError(`notify ${channel}: ${result.error}`);
  return "failed";
}

async function record(
  ctx: Ctx,
  matchId: number,
  channel: string,
  fields: { status: string; error: string | null; sentAt: Date | null },
) {
  await ctx.db
    .insert(notifications)
    .values({ matchId, channel, attempts: 1, ...fields })
    .onConflictDoUpdate({
      target: notifications.matchId,
      set: { channel, ...fields, attempts: sql`${notifications.attempts} + 1` },
    });
}
