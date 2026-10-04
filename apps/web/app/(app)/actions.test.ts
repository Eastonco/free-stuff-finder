import { type createDb, eq, searches, users } from "@fsf/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { form, freshTestDb, resetTables, seedSearch, seedUser, testDbName } from "@/test/helpers";

// The actions are public POST endpoints, so what they enforce is the security
// boundary. Auth, the db handle and Next's redirect are swapped for test doubles;
// everything else (validation, queries) is real, against Postgres.
const h = vi.hoisted(() => ({
  db: undefined as unknown,
  user: null as unknown,
  notified: [] as { target: unknown; alert: unknown }[],
}));

vi.mock("@/db", () => ({
  get db() {
    return h.db;
  },
}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => {
    if (!h.user) throw new Error("REDIRECT:/signin");
    return h.user;
  },
  endSession: vi.fn(),
}));
vi.mock("@/lib/notifier", () => ({
  notifyUser: async (target: unknown, alert: unknown) => {
    h.notified.push({ target, alert });
    return { ok: true };
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

import { deleteSearch, saveAccount, saveSearch, sendTestNotification, setSearchActive } from "./actions";

type U = typeof users.$inferSelect;

describe.skipIf(!testDbName)("app actions (Postgres)", () => {
  let conn: ReturnType<typeof createDb>;
  let alice: U;
  let bob: U;
  let admin: U;

  beforeAll(async () => {
    conn = await freshTestDb();
    h.db = conn.db;
  });
  afterAll(async () => {
    await conn?.sql.end();
  });
  beforeEach(async () => {
    await resetTables(conn.db);
    h.notified = [];
    alice = await seedUser(conn.db, { name: "Alice", target: "alice-topic" });
    bob = await seedUser(conn.db, { name: "Bob", target: "bob-topic" });
    admin = await seedUser(conn.db, { name: "Admin", target: "admin-topic", isAdmin: true });
    h.user = alice;
  });

  const searchForm = (extra: Record<string, string> = {}) =>
    form({
      prompt: "a couch",
      urls: "https://seattle.craigslist.org/search/zip",
      filters: "broken, stained",
      active: "on",
      ...extra,
    });
  const allSearches = () => conn.db.select().from(searches).orderBy(searches.id);

  describe("saveSearch", () => {
    it("rejects signed-out callers", async () => {
      h.user = null;
      await expect(saveSearch(null, searchForm())).rejects.toThrow("REDIRECT:/signin");
      expect(await allSearches()).toHaveLength(0);
    });

    it("returns validation errors with the submitted values and saves nothing", async () => {
      const res = await saveSearch(null, form({ prompt: " ", urls: "https://example.com/x" }));
      expect(res?.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Not a craigslist.org URL"),
          expect.stringContaining("looking for"),
        ]),
      );
      expect(res?.values?.urls).toBe("https://example.com/x");
      expect(await allSearches()).toHaveLength(0);
    });

    it("creates a search for the caller, parsing filters, then redirects", async () => {
      await expect(saveSearch(null, searchForm())).rejects.toThrow("REDIRECT:/searches");
      const [s] = await allSearches();
      expect(s).toMatchObject({
        userId: alice.id,
        preferencePrompt: "a couch",
        excludeFilters: ["broken", "stained"],
        active: true,
      });
    });

    it("treats an unchecked box as paused and honors returnTo", async () => {
      const fd = searchForm({ returnTo: "/admin/searches" });
      fd.delete("active");
      await expect(saveSearch(null, fd)).rejects.toThrow("REDIRECT:/admin/searches");
      expect((await allSearches())[0]?.active).toBe(false);
    });

    it("ignores a userId from non-admins but honors it for admins", async () => {
      await expect(saveSearch(null, searchForm({ userId: String(bob.id) }))).rejects.toThrow("REDIRECT");
      expect((await allSearches())[0]?.userId).toBe(alice.id);

      h.user = admin;
      await expect(saveSearch(null, searchForm({ userId: String(bob.id) }))).rejects.toThrow("REDIRECT");
      expect((await allSearches())[1]?.userId).toBe(bob.id);
    });

    it("edits your own search", async () => {
      const mine = await seedSearch(conn.db, alice.id);
      await expect(saveSearch(null, searchForm({ searchId: String(mine.id), prompt: "a desk" }))).rejects.toThrow(
        "REDIRECT",
      );
      expect((await allSearches())[0]?.preferencePrompt).toBe("a desk");
    });

    it("can't edit someone else's search, and says it wasn't found", async () => {
      const theirs = await seedSearch(conn.db, bob.id, { prompt: "bob's" });
      const res = await saveSearch(null, searchForm({ searchId: String(theirs.id), prompt: "hijacked" }));
      expect(res?.errors).toEqual(["Search not found."]);
      expect((await allSearches())[0]?.preferencePrompt).toBe("bob's");
    });

    it("lets an admin edit anyone's search without changing its owner", async () => {
      const theirs = await seedSearch(conn.db, bob.id);
      h.user = admin;
      await expect(saveSearch(null, searchForm({ searchId: String(theirs.id), prompt: "fixed" }))).rejects.toThrow(
        "REDIRECT",
      );
      expect((await allSearches())[0]).toMatchObject({ preferencePrompt: "fixed", userId: bob.id });
    });
  });

  describe("setSearchActive / deleteSearch", () => {
    it("toggles and deletes your own search", async () => {
      const mine = await seedSearch(conn.db, alice.id);
      await setSearchActive(mine.id, false);
      expect((await allSearches())[0]?.active).toBe(false);

      await expect(deleteSearch(mine.id)).rejects.toThrow("REDIRECT:/searches");
      expect(await allSearches()).toHaveLength(0);
    });

    it("does nothing to someone else's search", async () => {
      const theirs = await seedSearch(conn.db, bob.id);
      await setSearchActive(theirs.id, false);
      await expect(deleteSearch(theirs.id)).rejects.toThrow("REDIRECT:/searches");
      expect((await allSearches())[0]).toMatchObject({ id: theirs.id, active: true });
    });

    it("lets an admin act on anyone's search, and redirects to returnTo", async () => {
      const theirs = await seedSearch(conn.db, bob.id);
      h.user = admin;
      await setSearchActive(theirs.id, false);
      expect((await allSearches())[0]?.active).toBe(false);
      await expect(deleteSearch(theirs.id, "/admin/searches")).rejects.toThrow("REDIRECT:/admin/searches");
      expect(await allSearches()).toHaveLength(0);
    });

    it("silently ignores a search that doesn't exist", async () => {
      await setSearchActive(9999, false);
      await expect(deleteSearch(9999)).rejects.toThrow("REDIRECT:/searches");
    });
  });

  describe("saveAccount", () => {
    const accountForm = (extra: Record<string, string> = {}) =>
      form({ name: " Alice B ", channel: "ntfy", target: " new-topic ", pickupPhone: "", pickupNote: "", ...extra });
    const row = async (id: number) => (await conn.db.select().from(users).where(eq(users.id, id)))[0];

    it("validates name, destination and pickup fields together", async () => {
      const res = await saveAccount(null, accountForm({ name: " ", target: "x", pickupPhone: "555" }));
      expect(res?.errors).toHaveLength(3);
      expect((await row(alice.id))?.notifyTarget).toBe("alice-topic");
    });

    it("saves trimmed values and nulls blank pickup fields", async () => {
      expect(await saveAccount(null, accountForm({ pickupPhone: "+14155551234" }))).toMatchObject({ saved: true });
      expect(await row(alice.id)).toMatchObject({
        name: "Alice B",
        notifyTarget: "new-topic",
        pickupPhone: "+14155551234",
        pickupNote: null,
      });
    });

    it("refuses a destination another account already uses (it's the sign-in identity)", async () => {
      const res = await saveAccount(null, accountForm({ target: "bob-topic" }));
      expect(res?.errors).toEqual(["That alert destination is already used by another account."]);
      expect((await row(alice.id))?.notifyTarget).toBe("alice-topic");
    });

    it("allows re-saving your own destination unchanged", async () => {
      expect(await saveAccount(null, accountForm({ target: "alice-topic" }))).toMatchObject({ saved: true });
    });

    it("ignores a userId from non-admins; admins can edit other accounts", async () => {
      await saveAccount(null, accountForm({ userId: String(bob.id) }));
      expect((await row(bob.id))?.name).toBe("Bob");
      expect((await row(alice.id))?.name).toBe("Alice B");

      h.user = admin;
      await saveAccount(null, accountForm({ userId: String(bob.id), target: "bob-topic" }));
      expect((await row(bob.id))?.name).toBe("Alice B");
    });
  });

  it("sendTestNotification goes to the signed-in user's own destination", async () => {
    expect(await sendTestNotification()).toEqual({ ok: true });
    expect(h.notified).toHaveLength(1);
    expect(h.notified[0]?.target).toEqual({ channel: "ntfy", target: "alice-topic" });
  });
});
