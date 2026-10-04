"use server";

// Every action re-checks who's signed in: server actions are public endpoints,
// whatever page renders them. Owners edit their own; admins edit anyone's.
import { and, eq, ne, searches, users } from "@fsf/db";
import { parseExcludeFilters } from "@fsf/engine";
import { validateNotify, validatePickup, validateSearch } from "@fsf/engine/validate";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { AccountValues } from "@/components/account-form";
import type { SearchValues } from "@/components/search-form";
import { db } from "@/db";
import { endSession, requireUser } from "@/lib/auth/session";
import { type FormResult, field } from "@/lib/form";
import { notifyUser } from "@/lib/notifier";

const orNull = (s: string) => s.trim() || null;

/** The search, if `user` may edit it. */
async function editableSearch(searchId: number) {
  const user = await requireUser();
  const [search] = await db.select().from(searches).where(eq(searches.id, searchId)).limit(1);
  if (!search || (search.userId !== user.id && !user.isAdmin)) return { user, search: null };
  return { user, search };
}

const readSearch = (fd: FormData): SearchValues => ({
  prompt: field(fd, "prompt"),
  urls: field(fd, "urls"),
  filters: field(fd, "filters"),
  active: fd.get("active") === "on",
});

export async function saveSearch(_prev: FormResult<SearchValues>, fd: FormData): Promise<FormResult<SearchValues>> {
  const user = await requireUser();
  const values = readSearch(fd);
  const { urls, errors } = validateSearch(values.urls, values.prompt);
  if (errors.length) return { errors, values };

  const fields = {
    urls,
    preferencePrompt: values.prompt.trim(),
    excludeFilters: parseExcludeFilters(values.filters),
    active: values.active,
  };
  const searchId = Number(fd.get("searchId") ?? 0);

  if (searchId) {
    const { search } = await editableSearch(searchId);
    if (!search) return { errors: ["Search not found."], values };
    await db.update(searches).set(fields).where(eq(searches.id, search.id));
  } else {
    // admins may create on someone's behalf; everyone else creates their own
    const ownerId = user.isAdmin && fd.get("userId") ? Number(fd.get("userId")) : user.id;
    await db.insert(searches).values({ ...fields, userId: ownerId, createdAt: new Date().toISOString() });
  }

  revalidatePath("/searches");
  redirect(field(fd, "returnTo") || "/searches");
}

export async function setSearchActive(searchId: number, active: boolean) {
  const { search } = await editableSearch(searchId);
  if (!search) return;
  await db.update(searches).set({ active }).where(eq(searches.id, search.id));
  revalidatePath("/searches");
}

export async function deleteSearch(searchId: number, returnTo = "/searches") {
  const { search } = await editableSearch(searchId);
  if (search) await db.delete(searches).where(eq(searches.id, search.id));
  revalidatePath("/searches");
  redirect(returnTo);
}

export async function saveAccount(_prev: FormResult<AccountValues>, fd: FormData): Promise<FormResult<AccountValues>> {
  const user = await requireUser();
  const values: AccountValues = {
    name: field(fd, "name"),
    channel: field(fd, "channel"),
    target: field(fd, "target"),
    pickupPhone: field(fd, "pickupPhone"),
    pickupNote: field(fd, "pickupNote"),
  };
  const targetUserId = user.isAdmin && fd.get("userId") ? Number(fd.get("userId")) : user.id;

  const errors = [
    ...(values.name.trim() ? [] : ["Name is required."]),
    ...validateNotify(values.channel, values.target),
    ...validatePickup(values.pickupPhone, values.pickupNote),
  ];
  // The alert target doubles as the sign-in identity, so it must be unique.
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.notifyTarget, values.target.trim()), ne(users.id, targetUserId)))
    .limit(1);
  if (taken) errors.push("That alert destination is already used by another account.");
  if (errors.length) return { errors, values };

  await db
    .update(users)
    .set({
      name: values.name.trim(),
      notifyChannel: values.channel,
      notifyTarget: values.target.trim(),
      pickupPhone: orNull(values.pickupPhone),
      pickupNote: orNull(values.pickupNote),
    })
    .where(eq(users.id, targetUserId));
  revalidatePath("/account");
  return { saved: true, values };
}

/** Sends a test alert to the signed-in user's saved destination. */
export async function sendTestNotification(): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const res = await notifyUser(
    { channel: user.notifyChannel, target: user.notifyTarget },
    {
      title: "Free Stuff Finder test",
      reason: "If you can read this, alerts will reach you here.",
      link: "https://www.craigslist.org/",
    },
  );
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function signOut() {
  await endSession();
  redirect("/");
}
