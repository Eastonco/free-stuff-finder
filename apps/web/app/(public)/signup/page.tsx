import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";

import { SignUpForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/searches");
  return <SignUpForm />;
}
