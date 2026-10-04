// Data for the signed-in user's own pages.
import { and, desc, eq, matches, posts, searches } from "@fsf/db";

import { statsBySearch } from "@/app/(app)/admin/queries";
import { db } from "@/db";
import { fmtTime } from "@/lib/time";

export async function searchesForUser(userId: number) {
  const rows = await db.select().from(searches).where(eq(searches.userId, userId)).orderBy(desc(searches.id));
  const stats = await statsBySearch(rows.map((r) => r.id));
  return rows.map((search) => ({
    search,
    wants: stats.get(search.id)?.wants ?? 0,
    last: stats.get(search.id)?.last ?? null,
  }));
}

export async function recentFinds(searchId: number, limit = 10) {
  const rows = await db
    .select({ id: matches.id, title: posts.title, link: posts.link, reason: matches.reason, at: matches.createdAt })
    .from(matches)
    .innerJoin(posts, eq(posts.id, matches.postId))
    .where(and(eq(matches.searchId, searchId), eq(matches.label, "want")))
    .orderBy(desc(matches.createdAt), desc(matches.id))
    .limit(limit);
  return rows.map(({ at, ...r }) => ({ ...r, at: fmtTime(at) }));
}
