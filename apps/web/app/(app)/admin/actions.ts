"use server";

// Admin-only actions. Server actions are public endpoints, so each one checks
// requireAdmin() itself; the admin layout guard only protects rendering.
// (Editing users and searches goes through the shared actions in ../actions.ts.)
import { searchUrls, workerStatus } from "@fsf/db";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { requireAdmin } from "@/lib/auth/session";

// Global scraper kill-switch: worker_status.enabled, which the worker's schedule
// job checks every tick.
export async function setScraperEnabled(enabled: boolean): Promise<void> {
  await requireAdmin();
  await db
    .insert(workerStatus)
    .values({ id: 1, enabled })
    .onConflictDoUpdate({ target: workerStatus.id, set: { enabled } });
  revalidatePath("/admin");
}

// "Scrape now": mark every URL due. The worker's next minute tick picks them up.
export async function scrapeNow(): Promise<void> {
  await requireAdmin();
  await db.update(searchUrls).set({ nextScrapeAt: new Date(0) });
  revalidatePath("/admin/worker");
}
