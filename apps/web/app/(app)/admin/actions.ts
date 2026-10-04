"use server";

// Admin-only actions. Server actions are public endpoints, so each one checks
// requireAdmin() itself; the admin layout guard only protects rendering.
// (Editing users and searches goes through the shared actions in ../actions.ts.)
import { eq, scraperStatus, searchUrls } from "@fsf/db";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { requireAdmin } from "@/lib/auth/session";

// Global scraper kill-switch: the single scraper_status row both the Python loop
// and the TS worker check each cycle.
export async function setScraperEnabled(enabled: boolean): Promise<void> {
  await requireAdmin();
  const [row] = await db.select().from(scraperStatus).limit(1);
  if (!row) {
    await db.insert(scraperStatus).values({
      lastCycleAt: new Date().toISOString(),
      cycleCount: 0,
      scraperEnabled: enabled,
    });
  } else {
    await db.update(scraperStatus).set({ scraperEnabled: enabled }).where(eq(scraperStatus.id, row.id));
  }
  revalidatePath("/admin");
}

// "Scrape now": mark every URL due. The worker's next minute tick picks them up.
export async function scrapeNow(): Promise<void> {
  await requireAdmin();
  await db.update(searchUrls).set({ nextScrapeAt: new Date(0) });
  revalidatePath("/admin/worker");
}
