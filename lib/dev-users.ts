import { and, eq, like } from "drizzle-orm";
import { db } from "../db";
import { account, membership, organization, user } from "../db/schema";
import {
  devToolsEnabled,
  originalAccountId,
  originalEmail,
  retiredAccountId,
  retiredAt,
  retiredEmail,
  sameIdentity,
} from "./dev-tools";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PastUser = { id: string; name: string; username: string | null; retiredAt: number | null };

async function linksOf(userId: string) {
  return db.select({ providerId: account.providerId, accountId: account.accountId }).from(account).where(eq(account.userId, userId));
}

async function usernameOf(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: organization.slug })
    .from(membership)
    .innerJoin(organization, eq(organization.id, membership.organizationId))
    .where(and(eq(membership.userId, userId), eq(membership.role, "owner"), eq(organization.kind, "personal")))
    .limit(1);
  return row?.slug ?? null;
}

// Earlier users of the person signed in now (same email or same Google /
// GitHub account), newest retirement first. Empty unless dev tools are on.
export async function pastUsersOf(current: { id: string; email: string }): Promise<PastUser[]> {
  if (!devToolsEnabled()) return [];
  const mine = { email: current.email, links: await linksOf(current.id) };
  const retired = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(like(user.email, "retired.%@retired.invalid"));
  const out: PastUser[] = [];
  for (const r of retired) {
    if (r.id === current.id) continue;
    if (!sameIdentity(mine, { email: r.email, links: await linksOf(r.id) })) continue;
    out.push({ id: r.id, name: r.name, username: await usernameOf(r.id), retiredAt: retiredAt(r.email) });
  }
  return out.sort((a, b) => (b.retiredAt ?? 0) - (a.retiredAt ?? 0));
}

// Rewrite the user's email and sign-in links so no sign-in matches them.
export async function retireUser(tx: Tx, userId: string, at = Date.now()) {
  const [u] = await tx.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (!u || originalEmail(u.email) !== null) return; // gone, or already retired
  await tx.update(user).set({ email: retiredEmail(u.email, at), updatedAt: new Date() }).where(eq(user.id, userId));
  const links = await tx.select({ id: account.id, accountId: account.accountId }).from(account).where(eq(account.userId, userId));
  for (const l of links) {
    if (originalAccountId(l.accountId) !== null) continue;
    await tx.update(account).set({ accountId: retiredAccountId(l.accountId, at), updatedAt: new Date() }).where(eq(account.id, l.id));
  }
}

// Undo retireUser: the original email and links come back.
export async function restoreUser(tx: Tx, userId: string) {
  const [u] = await tx.select({ email: user.email }).from(user).where(eq(user.id, userId));
  const email = u ? originalEmail(u.email) : null;
  if (!email) return;
  await tx.update(user).set({ email, updatedAt: new Date() }).where(eq(user.id, userId));
  const links = await tx.select({ id: account.id, accountId: account.accountId }).from(account).where(eq(account.userId, userId));
  for (const l of links) {
    const orig = originalAccountId(l.accountId);
    if (orig === null) continue;
    await tx.update(account).set({ accountId: orig, updatedAt: new Date() }).where(eq(account.id, l.id));
  }
}
