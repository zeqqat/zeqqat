"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../../db";
import { membership, organization, user as userTable, usernameAlias } from "../../db/schema";
import { requireUser } from "../guard";
import { isReserved, isValidOrgSlug, normalizeSlug } from "../username";
import { heldByOldUsername } from "../username-alias";

export type AccountState = { error?: string; saved?: boolean; username?: string; renamedFrom?: string } | null;

// Avatars are stored inline: the browser crops and shrinks the picture to
// 256px before sending it, so a self-hosted install needs no file storage.
const AVATAR = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const AVATAR_MAX = 200_000;

async function personalOrgOf(userId: string) {
  const [row] = await db
    .select({ id: organization.id, slug: organization.slug })
    .from(organization)
    .innerJoin(membership, eq(membership.organizationId, organization.id))
    .where(and(eq(membership.userId, userId), eq(organization.kind, "personal"), eq(organization.ownerUserId, userId)))
    .limit(1);
  return row ?? null;
}

export async function updateAccountAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const me = await requireUser();
  const name = (formData.get("name")?.toString() ?? "").trim().slice(0, 60);
  const rawUsername = (formData.get("username")?.toString() ?? "").trim().replace(/^@/, "");
  const username = normalizeSlug(rawUsername);
  const avatar = formData.get("avatar")?.toString() ?? "";

  if (!name) return { error: "Add your name." };
  if (rawUsername !== username || !isValidOrgSlug(username)) {
    return { error: "Usernames use lowercase letters, numbers and single underscores, 2 to 39 characters." };
  }
  if (avatar && avatar !== "keep" && avatar !== "remove" && (avatar.length > AVATAR_MAX || !AVATAR.test(avatar))) {
    return { error: "That picture didn't work. Try a PNG or JPEG." };
  }

  const personal = await personalOrgOf(me.id);
  if (!personal) return { error: "Your account has no username to change." };
  const renaming = username !== personal.slug;
  if (renaming) {
    if (isReserved(username)) return { error: `@${username} is reserved. Pick another one.` };
    const taken = await db.query.organization.findFirst({ where: eq(organization.slug, username) });
    if (taken || (await heldByOldUsername(username, db, personal.id))) return { error: `@${username} is taken.` };
  }

  try {
    await db.transaction(async (tx) => {
      const userSet: { name: string; image?: string | null; updatedAt: Date } = { name, updatedAt: new Date() };
      if (avatar === "remove") userSet.image = null;
      else if (avatar && avatar !== "keep") userSet.image = avatar;
      await tx.update(userTable).set(userSet).where(eq(userTable.id, me.id));
      if (renaming) {
        // Taking your own old name back: it's no longer an alias.
        await tx.delete(usernameAlias).where(eq(usernameAlias.slug, username));
        await tx.update(organization).set({ slug: username }).where(eq(organization.id, personal.id));
        await tx.insert(usernameAlias).values({ slug: personal.slug, organizationId: personal.id }).onConflictDoNothing();
      }
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") return { error: `@${username} is taken.` };
    throw err;
  }

  revalidatePath("/", "layout");
  return { saved: true, username, renamedFrom: renaming ? personal.slug : undefined };
}
