"use server";

import { auth } from "../auth";
import { passwordEnabled } from "../auth-providers";
import { publicUrl } from "../env";
import { requireUser } from "../guard";
import { randomToken } from "../oauth-crypto";
import { hasPassword, installOwnerId } from "../password-auth";

export type ResetLinkState = { link?: string; error?: string };

// A password reset link the install's owner hands to someone who forgot
// theirs, for installs with no mailer. Same token Better Auth's own
// "forgot password" email uses, so /reset-password takes either. Works once,
// for 24 hours; using it signs the person out everywhere.
export async function resetLinkAction(_prev: ResetLinkState, formData: FormData): Promise<ResetLinkState> {
  const me = await requireUser();
  if (!passwordEnabled) return { error: "Passwords are off on this Zeqqat." };
  if ((await installOwnerId()) !== me.id) return { error: "Only this Zeqqat's owner can make reset links." };
  const userId = formData.get("user_id")?.toString() ?? "";
  if (!userId || userId === me.id) return { error: "Pick someone else." };
  if (!(await hasPassword(userId))) return { error: "They don't sign in with a password." };

  const token = randomToken(24);
  const ctx = await auth.$context;
  await ctx.internalAdapter.createVerificationValue({
    value: userId,
    identifier: `reset-password:${token}`,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  return { link: `${publicUrl()}/reset-password?token=${encodeURIComponent(token)}` };
}
