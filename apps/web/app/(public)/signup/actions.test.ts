import { type createDb, searches, sessions, users } from "@fsf/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { form, freshTestDb, resetTables, seedUser, testDbName } from "@/test/helpers";

const h = vi.hoisted(() => ({ db: undefined as unknown, started: [] as number[] }));

vi.mock("@/db", () => ({
  get db() {
    return h.db;
  },
}));
vi.mock("@/lib/auth/session", () => ({
  startSession: async (id: number) => {
    h.started.push(id);
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

import { signUp } from "./actions";

describe.skipIf(!testDbName)("signUp (Postgres)", () => {
  let conn: ReturnType<typeof createDb>;
  beforeAll(async () => {
    conn = await freshTestDb();
    h.db = conn.db;
  });
  afterAll(async () => {
    await conn?.sql.end();
    delete process.env.INVITE_CODE;
  });
  beforeEach(async () => {
    await resetTables(conn.db);
    h.started = [];
    process.env.INVITE_CODE = "let-me-in";
  });

  const signUpForm = (extra: Record<string, string> = {}) =>
    form({
      invite: "let-me-in",
      name: "Jo",
      channel: "ntfy",
      target: "jo-topic",
      prompt: "a couch",
      urls: "https://seattle.craigslist.org/search/zip",
      filters: "broken",
      ...extra,
    });

  it("creates the user and first search, starts a session, and redirects", async () => {
    await expect(signUp(null, signUpForm())).rejects.toThrow("REDIRECT:/searches?welcome=1");

    const [user] = await conn.db.select().from(users);
    expect(user).toMatchObject({ name: "Jo", notifyChannel: "ntfy", notifyTarget: "jo-topic", isAdmin: false });
    expect(user?.editToken).toHaveLength(64); // hashed placeholder, never a usable token
    const [search] = await conn.db.select().from(searches);
    expect(search).toMatchObject({ userId: user?.id, active: true, excludeFilters: ["broken"] });
    expect(h.started).toEqual([user?.id]);
  });

  it("rejects a wrong invite code and clears the field", async () => {
    const res = await signUp(null, signUpForm({ invite: "nope" }));
    expect(res?.errors).toEqual(["That invite code isn't right."]);
    expect(res?.values?.invite).toBe("");
    expect(await conn.db.select().from(users)).toHaveLength(0);
  });

  it("rejects everyone when INVITE_CODE isn't configured, even an empty code", async () => {
    delete process.env.INVITE_CODE;
    expect((await signUp(null, signUpForm({ invite: "" })))?.errors).toEqual(["That invite code isn't right."]);
    expect(await conn.db.select().from(users)).toHaveLength(0);
  });

  it("collects every validation error and creates nothing", async () => {
    const res = await signUp(null, signUpForm({ name: " ", target: "x", urls: "", prompt: "" }));
    expect(res?.errors?.length).toBeGreaterThanOrEqual(4);
    expect(await conn.db.select().from(users)).toHaveLength(0);
    expect(h.started).toEqual([]);
  });

  it("refuses a destination that already has an account", async () => {
    await seedUser(conn.db, { target: "jo-topic" });
    const res = await signUp(null, signUpForm());
    expect(res?.errors).toEqual(["That alert destination already has an account — sign in instead."]);
    expect(await conn.db.select().from(users)).toHaveLength(1);
    expect(await conn.db.select().from(sessions)).toHaveLength(0);
  });
});
