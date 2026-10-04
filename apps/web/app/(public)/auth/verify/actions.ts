"use server";

import { redirect } from "next/navigation";

import { db } from "@/db";
import { consumeLoginToken } from "@/lib/auth/core";
import { startSession } from "@/lib/auth/session";
import { field } from "@/lib/form";

export async function verifySignIn(fd: FormData) {
  const userId = await consumeLoginToken(db, field(fd, "token"));
  if (!userId) redirect("/signin?expired=1");
  await startSession(userId);
  redirect("/searches");
}
