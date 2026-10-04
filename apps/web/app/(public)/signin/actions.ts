"use server";

import { db } from "@/db";
import { appUrl } from "@/lib/app-url";
import { issueLoginToken, LOGIN_LINK_MINUTES, userByNotifyTarget } from "@/lib/auth/core";
import { field } from "@/lib/form";
import { notifyUser } from "@/lib/notifier";

export type SignInState = { sent?: boolean; target?: string; error?: string } | null;

/**
 * Sends a one-time sign-in link to the account's own alert destination. The
 * reply is the same whether or not the destination is registered, so this
 * can't be used to find out who has an account.
 */
export async function requestSignInLink(_prev: SignInState, fd: FormData): Promise<SignInState> {
  const target = field(fd, "target").trim();
  if (!target) return { error: "Enter your ntfy topic, phone number, or Discord webhook URL." };

  const user = await userByNotifyTarget(db, target);
  if (user) {
    const token = await issueLoginToken(db, user.id);
    if (token) {
      const link = `${await appUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
      const res = await notifyUser(
        { channel: user.notifyChannel, target: user.notifyTarget },
        {
          title: "Sign in to Free Stuff Finder",
          reason: `Tap to sign in. Expires in ${LOGIN_LINK_MINUTES} minutes.`,
          link,
        },
      );
      if (!res.ok) console.warn(`sign-in link delivery failed for user ${user.id}: ${res.error}`);
    }
  }
  return { sent: true, target };
}
