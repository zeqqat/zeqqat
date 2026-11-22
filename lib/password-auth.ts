import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { account, user } from "../db/schema";
import { findOpenInvite } from "./invites";
import { claimAllowed, currentSeed } from "./seed-claim";

// Password accounts on a self-hosted install. Nobody can sign themselves up
// except the very first person (who deployed it and owns it); everyone
// after joins through an invite link from an owner.

export async function hasNoUsers(): Promise<boolean> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(user);
  return (row?.n ?? 0) === 0;
}

// A fresh install made from zeqqat.com carries a seed: then the first
// account is only the one claimed with its link (lib/seed-claim.ts).
export async function passwordSignUpAllowed(email: string, inviteToken: string | null, claimToken: string | null = null): Promise<boolean> {
  if (await hasNoUsers()) {
    const seed = currentSeed();
    return seed ? claimAllowed(seed, email, claimToken) : true;
  }
  if (!inviteToken) return false;
  const invite = await findOpenInvite(inviteToken);
  return !!invite && invite.email === email.trim().toLowerCase();
}

// The install's owner: its first account. Only they make password reset
// links for others, because a reset link is a way into that account.
export async function installOwnerId(): Promise<string | null> {
  const [row] = await db.select({ id: user.id }).from(user).orderBy(asc(user.createdAt)).limit(1);
  return row?.id ?? null;
}

export async function hasPassword(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  return !!row;
}
