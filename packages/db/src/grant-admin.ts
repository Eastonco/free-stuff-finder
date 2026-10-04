// Mark a user as admin (or revoke with --revoke). Identify them by id or by
// their notification target (ntfy topic / phone / Discord webhook).
//   pnpm --filter @fsf/db grant-admin <id | notify-target> [--revoke]
import { eq, or } from "drizzle-orm";

import { createDb } from "./client";
import { users } from "./schema";

const [who, flag] = process.argv.slice(2);
if (!who) {
  console.error("usage: grant-admin <user id | notify target> [--revoke]");
  process.exit(1);
}
const { db, sql } = createDb({ max: 1 });
const match = /^\d+$/.test(who)
  ? or(eq(users.id, Number(who)), eq(users.notifyTarget, who))
  : eq(users.notifyTarget, who);
const rows = await db
  .update(users)
  .set({ isAdmin: flag !== "--revoke" })
  .where(match)
  .returning({ id: users.id, name: users.name, isAdmin: users.isAdmin });
await sql.end();
if (!rows.length) {
  console.error(`no user matches ${who}`);
  process.exit(1);
}
for (const r of rows) console.log(`user ${r.id} (${r.name}): admin=${r.isAdmin}`);
