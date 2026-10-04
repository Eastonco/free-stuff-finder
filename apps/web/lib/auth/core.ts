// Sign-in, framework-free: every function takes the db, so it runs the same in
// server actions and in tests. Raw tokens are never stored — only sha256 hashes.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { and, type Db, eq, gt, isNull, loginTokens, sessions, users } from "@fsf/db";

export const SESSION_DAYS = 30;
export const LOGIN_LINK_MINUTES = 15;
/** Don't send another sign-in link to the same account more often than this. */
export const LOGIN_LINK_COOLDOWN_SECONDS = 60;

export type SessionUser = typeof users.$inferSelect;

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Constant-time string compare (for the invite code). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function createSession(db: Db, userId: number, now = new Date()) {
  const token = newToken();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function userForSession(db: Db, token: string, now = new Date()): Promise<SessionUser | null> {
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  return row?.user ?? null;
}

export async function deleteSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** The account whose notifications go to `target`, if any. */
export async function userByNotifyTarget(db: Db, target: string): Promise<SessionUser | null> {
  const t = target.trim();
  if (!t) return null;
  const [user] = await db.select().from(users).where(eq(users.notifyTarget, t)).limit(1);
  return user ?? null;
}

/**
 * Mint a one-time sign-in token for `userId`, unless one was minted within the
 * cooldown (returns null — the caller still shows the same "check your
 * notifications" message, so this can't be used to probe or spam accounts).
 */
export async function issueLoginToken(db: Db, userId: number, now = new Date()): Promise<string | null> {
  const since = new Date(now.getTime() - LOGIN_LINK_COOLDOWN_SECONDS * 1000);
  const [recent] = await db
    .select({ tokenHash: loginTokens.tokenHash })
    .from(loginTokens)
    .where(and(eq(loginTokens.userId, userId), gt(loginTokens.createdAt, since)))
    .limit(1);
  if (recent) return null;

  const token = newToken();
  await db.insert(loginTokens).values({
    tokenHash: hashToken(token),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + LOGIN_LINK_MINUTES * 60_000),
  });
  return token;
}

/** Use up a sign-in token. Returns the user id, or null if it's unknown, expired, or already used. */
export async function consumeLoginToken(db: Db, token: string, now = new Date()): Promise<number | null> {
  const [row] = await db
    .update(loginTokens)
    .set({ usedAt: now })
    .where(and(eq(loginTokens.tokenHash, hashToken(token)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, now)))
    .returning({ userId: loginTokens.userId });
  return row?.userId ?? null;
}

/** Pre-accounts edit links (/profile/<edit_token>) still sign their owner in. Stored hashed. */
export async function userByEditToken(db: Db, editToken: string): Promise<SessionUser | null> {
  if (!editToken) return null;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.editToken, hashToken(editToken)))
    .limit(1);
  return user ?? null;
}
