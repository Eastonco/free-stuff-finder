// Pre-accounts edit links (/profile/<edit_token>) keep working: they sign
// their owner in and land on their searches.
import { redirect } from "next/navigation";

import { db } from "@/db";
import { userByEditToken } from "@/lib/auth/core";
import { startSession } from "@/lib/auth/session";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const user = await userByEditToken(db, (await params).token);
  if (!user) redirect("/signin");
  await startSession(user.id);
  redirect("/searches");
}
