"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { searches, users } from "@/db/schema";
import { validate } from "@/lib/validate";

export type FormValues = {
  name: string;
  channel: string;
  target: string;
  urls: string;
  prompt: string;
  filters: string;
  pickupPhone: string;
  pickupNote: string;
};

export type FormState = { errors: string[]; values: FormValues } | null;

function readForm(formData: FormData): FormValues {
  const get = (k: string) => String(formData.get(k) ?? "");
  return {
    name: get("name"),
    channel: get("channel") || "ntfy",
    target: get("target"),
    urls: get("urls"),
    prompt: get("prompt"),
    filters: get("filters"),
    pickupPhone: get("pickupPhone"),
    pickupNote: get("pickupNote"),
  };
}

// empty string → null so the DB column stays clean
const orNull = (s: string) => (s.trim() ? s.trim() : null);

const parseExcludes = (filters: string) =>
  filters
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);

// matches User.edit_token (secrets.token_urlsafe(16)) — 16 bytes, url-safe.
const newToken = () => randomBytes(16).toString("base64url");

export async function createProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  // Invite gating is handled by the /gate page + middleware (see middleware.ts),
  // so this form is decoupled from the invite secret.
  const values = readForm(formData);
  const { urls, errors } = validate(values);
  if (errors.length) return { errors, values };

  const token = newToken();
  const now = new Date().toISOString();
  const [user] = await db
    .insert(users)
    .values({
      name: values.name.trim(),
      notifyChannel: values.channel,
      notifyTarget: values.target.trim(),
      editToken: token,
      createdAt: now,
      pickupPhone: orNull(values.pickupPhone),
      pickupNote: orNull(values.pickupNote),
    })
    .returning({ id: users.id, editToken: users.editToken });

  await db.insert(searches).values({
    userId: user.id,
    urls,
    preferencePrompt: values.prompt.trim(),
    excludeFilters: parseExcludes(values.filters),
    active: true,
    createdAt: now,
  });

  redirect(`/profile/${user.editToken}?created=1`);
}

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const values = readForm(formData);

  const user = await db.query.users.findFirst({ where: eq(users.editToken, token) });
  if (!user) return { errors: ["Profile not found."], values };

  const { urls, errors } = validate(values);
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
    .where(eq(users.id, user.id));

  await db
    .update(searches)
    .set({
      urls,
      preferencePrompt: values.prompt.trim(),
      excludeFilters: parseExcludes(values.filters),
    })
    .where(eq(searches.userId, user.id));

  redirect(`/profile/${token}`);
}
