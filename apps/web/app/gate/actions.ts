"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { INVITE_COOKIE } from "@/lib/gate";

export async function enterGate(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const nextRaw = String(formData.get("next") ?? "/");
  // only ever redirect to an in-app path (no //evil.com open redirects)
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";
  const expected = process.env.INVITE_CODE ?? "";

  if (!expected || code !== expected) {
    redirect(`/gate?error=1&next=${encodeURIComponent(next)}`);
  }

  const jar = await cookies();
  jar.set(INVITE_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  redirect(next);
}
