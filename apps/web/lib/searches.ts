// Data for the signed-in user's own pages.
import { and, desc, eq, listings, searches } from "@fsf/db";

import { statsBySearch } from "@/app/(app)/admin/queries";
import { db } from "@/db";

export async function searchesForUser(userId: number) {
  const rows = await db.select().from(searches).where(eq(searches.userId, userId)).orderBy(desc(searches.id));
  const stats = await statsBySearch(rows.map((r) => r.id));
  return rows.map((search) => ({
    search,
    wants: stats.get(search.id)?.wants ?? 0,
    last: stats.get(search.id)?.last ?? null,
  }));
}

// ponytail: reads the Python scraper's `listings`; switch to the worker's
// `matches` + `posts` at cutover (phase 6).
export async function recentFinds(searchId: number, limit = 10) {
  return db
    .select({
      id: listings.id,
      title: listings.title,
      link: listings.link,
      reason: listings.aiReason,
      at: listings.timeScraped,
    })
    .from(listings)
    .where(and(eq(listings.searchId, searchId), eq(listings.aiLabel, "want")))
    .orderBy(desc(listings.id))
    .limit(limit);
}
