"use server";

import { scraperStatus, searches, users } from "@fsf/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { validateNotify, validatePickup, validateSearch } from "@/lib/validate";

// empty string → null so the DB column stays clean
const orNull = (s: string) => (s.trim() ? s.trim() : null);

// Admin-only: every /admin/* POST goes through middleware's Basic Auth gate (see middleware.ts).
// On success the action redirects back to the entity's view page; on error it returns the
// messages for the edit form to render.
export type SaveState = { errors?: string[] } | null;

export async function updateUser(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const id = Number(formData.get("userId"));
  const name = String(formData.get("name") ?? "");
  const channel = String(formData.get("channel") ?? "");
  const target = String(formData.get("target") ?? "");
  const pickupPhone = String(formData.get("pickupPhone") ?? "");
  const pickupNote = String(formData.get("pickupNote") ?? "");

  if (!Number.isInteger(id) || id <= 0) return { errors: ["Bad user id."] };
  const errors: string[] = [];
  if (!name.trim()) errors.push("Name is required.");
  errors.push(...validateNotify(channel, target));
  errors.push(...validatePickup(pickupPhone, pickupNote));
  if (errors.length) return { errors };

  await db
    .update(users)
    .set({
      name: name.trim(),
      notifyChannel: channel,
      notifyTarget: target.trim(),
      pickupPhone: orNull(pickupPhone),
      pickupNote: orNull(pickupNote),
    })
    .where(eq(users.id, id));

  revalidatePath(`/admin/users/${id}`);
  redirect(`/admin/users/${id}`);
}

export async function updateSearch(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const id = Number(formData.get("searchId"));
  const rawUrls = String(formData.get("urls") ?? "");
  const prompt = String(formData.get("prompt") ?? "");
  const filters = String(formData.get("filters") ?? "");
  const active = formData.get("active") === "on";

  if (!Number.isInteger(id) || id <= 0) return { errors: ["Bad search id."] };
  const { urls, errors } = validateSearch(rawUrls, prompt);
  if (errors.length) return { errors };

  await db
    .update(searches)
    .set({
      urls,
      preferencePrompt: prompt.trim(),
      excludeFilters: filters
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean),
      active,
    })
    .where(eq(searches.id, id));

  revalidatePath(`/admin/searches/${id}`);
  redirect(`/admin/searches/${id}`);
}

// Global scraper kill-switch. Reads/writes the single scraper_status row that the
// Python loop checks each cycle. Called directly by the Overview toggle.
export async function setScraperEnabled(enabled: boolean): Promise<void> {
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
