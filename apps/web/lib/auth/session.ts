// Next.js glue for lib/auth/core: the session cookie and page guards.
// Cookies can only be *set* from server actions and route handlers.
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";

import { createSession, deleteSession, type SessionUser, userForSession } from "./core";

const COOKIE = "fsf_session";

/** The signed-in user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? userForSession(db, token) : null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}

/** Admin pages 404 for everyone else, so they don't advertise themselves. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  return user;
}

export async function startSession(userId: number) {
  const { token, expiresAt } = await createSession(db, userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await deleteSession(db, token);
  jar.delete(COOKIE);
}
