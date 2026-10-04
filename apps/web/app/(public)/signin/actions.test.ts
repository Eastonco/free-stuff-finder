import { type createDb, loginTokens } from "@fsf/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { form, freshTestDb, resetTables, seedUser, testDbName } from "@/test/helpers";

const h = vi.hoisted(() => ({
  db: undefined as unknown,
  sent: [] as { target: { channel: string; target: string }; alert: { link: string; title: string } }[],
  result: { ok: true } as { ok: boolean; error?: string },
}));

vi.mock("@/db", () => ({
  get db() {
    return h.db;
  },
}));
vi.mock("@/lib/app-url", () => ({ appUrl: async () => "https://cl.example.com" }));
vi.mock("@/lib/notifier", () => ({
  notifyUser: async (target: never, alert: never) => {
    h.sent.push({ target, alert });
    return h.result;
  },
}));

import { requestSignInLink } from "./actions";

describe.skipIf(!testDbName)("requestSignInLink (Postgres)", () => {
  let conn: ReturnType<typeof createDb>;
  beforeAll(async () => {
    conn = await freshTestDb();
    h.db = conn.db;
  });
  afterAll(async () => {
    await conn?.sql.end();
  });
  beforeEach(async () => {
    await resetTables(conn.db);
    h.sent = [];
    h.result = { ok: true };
  });

  it("asks for a destination when blank", async () => {
    expect(await requestSignInLink(null, form({ target: "  " }))).toEqual({
      error: expect.stringContaining("Enter your"),
    });
    expect(h.sent).toHaveLength(0);
  });

  it("sends a one-time link to the account's own destination, not to whatever was typed", async () => {
    await seedUser(conn.db, { target: "jo-topic" });
    const res = await requestSignInLink(null, form({ target: " jo-topic " }));
    expect(res).toEqual({ sent: true, target: "jo-topic" });

    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]?.target).toEqual({ channel: "ntfy", target: "jo-topic" });
    const token = new URL(h.sent[0]!.alert.link).searchParams.get("token");
    expect(h.sent[0]?.alert.link).toMatch(/^https:\/\/cl\.example\.com\/auth\/verify\?token=/);
    // only the hash is stored
    const [row] = await conn.db.select().from(loginTokens);
    expect(row?.tokenHash).not.toBe(token);
  });

  it("gives the same reply for an unknown destination and sends nothing (no account probing)", async () => {
    await seedUser(conn.db, { target: "jo-topic" });
    const known = await requestSignInLink(null, form({ target: "jo-topic" }));
    const unknown = await requestSignInLink(null, form({ target: "nobody-here" }));
    expect(Object.keys(unknown ?? {}).sort()).toEqual(Object.keys(known ?? {}).sort());
    expect(unknown).toMatchObject({ sent: true });
    expect(h.sent).toHaveLength(1);
    expect(await conn.db.select().from(loginTokens)).toHaveLength(1);
  });

  it("doesn't send a second link inside the cooldown, but still replies the same", async () => {
    await seedUser(conn.db, { target: "jo-topic" });
    await requestSignInLink(null, form({ target: "jo-topic" }));
    const again = await requestSignInLink(null, form({ target: "jo-topic" }));
    expect(again).toMatchObject({ sent: true });
    expect(h.sent).toHaveLength(1);
  });

  it("still replies sent when delivery fails (and doesn't leak the failure)", async () => {
    await seedUser(conn.db, { target: "jo-topic" });
    h.result = { ok: false, error: "ntfy down" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await requestSignInLink(null, form({ target: "jo-topic" }))).toEqual({ sent: true, target: "jo-topic" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ntfy down"));
    warn.mockRestore();
  });
});
