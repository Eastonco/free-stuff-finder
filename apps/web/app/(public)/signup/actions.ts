"use server";

import { randomBytes } from "node:crypto";

import { eq, searches, users } from "@fsf/db";
import { parseExcludeFilters } from "@fsf/engine";
import { validateNotify, validateSearch } from "@fsf/engine/validate";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { safeEqual } from "@/lib/auth/core";
import { startSession } from "@/lib/auth/session";
import { type FormResult, field } from "@/lib/form";

export type SignUpValues = {
  invite: string;
  name: string;
  channel: string;
  target: string;
  prompt: string;
  urls: string;
  filters: string;
};

/** One step: invite code, where alerts go, and a first search. Signs the new user in. */
export async function signUp(_prev: FormResult<SignUpValues>, fd: FormData): Promise<FormResult<SignUpValues>> {
  const values: SignUpValues = {
    invite: field(fd, "invite"),
    name: field(fd, "name"),
    channel: field(fd, "channel") || "ntfy",
    target: field(fd, "target"),
    prompt: field(fd, "prompt"),
    urls: field(fd, "urls"),
    filters: field(fd, "filters"),
  };

  const expected = process.env.INVITE_CODE ?? "";
  if (!expected || !safeEqual(values.invite.trim(), expected)) {
    return { errors: ["That invite code isn't right."], values: { ...values, invite: "" } };
  }

  const { urls, errors: searchErrors } = validateSearch(values.urls, values.prompt);
  const errors = [
    ...(values.name.trim() ? [] : ["Name is required."]),
    ...validateNotify(values.channel, values.target),
    ...searchErrors,
  ];
  const target = values.target.trim();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.notifyTarget, target)).limit(1);
  if (existing) errors.push("That alert destination already has an account — sign in instead.");
  if (errors.length) return { errors, values };

  const now = new Date().toISOString();
  const userId = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        name: values.name.trim(),
        notifyChannel: values.channel,
        notifyTarget: target,
        editToken: randomBytes(16).toString("base64url"), // legacy column; links still sign in
        createdAt: now,
      })
      .returning({ id: users.id });
    if (!user) throw new Error("user insert returned nothing");
    await tx.insert(searches).values({
      userId: user.id,
      urls,
      preferencePrompt: values.prompt.trim(),
      excludeFilters: parseExcludeFilters(values.filters),
      active: true,
      createdAt: now,
    });
    return user.id;
  });

  await startSession(userId);
  redirect("/searches?welcome=1");
}
