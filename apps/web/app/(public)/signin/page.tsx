import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";

import { SignInForm } from "./signin-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  if (await getCurrentUser()) redirect("/searches");
  const { expired } = await searchParams;
  return <SignInForm expired={Boolean(expired)} />;
}
