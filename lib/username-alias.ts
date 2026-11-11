import { eq } from "drizzle-orm";
import { db } from "../db";
import { organization, usernameAlias } from "../db/schema";

type Tx = Pick<typeof db, "select">;

// The account's current username when `slug` is one it used to have, else null.
export async function renamedTo(slug: string, tx: Tx = db): Promise<{ id: string; slug: string } | null> {
  const [row] = await tx
    .select({ id: organization.id, slug: organization.slug })
    .from(usernameAlias)
    .innerJoin(organization, eq(organization.id, usernameAlias.organizationId))
    .where(eq(usernameAlias.slug, slug))
    .limit(1);
  return row ?? null;
}

// True when `slug` is held by an account's old username, so nobody else can
// take it. `exceptOrgId` lets an account take its own old name back.
export async function heldByOldUsername(slug: string, tx: Tx = db, exceptOrgId?: string): Promise<boolean> {
  const [row] = await tx
    .select({ org: usernameAlias.organizationId })
    .from(usernameAlias)
    .where(eq(usernameAlias.slug, slug))
    .limit(1);
  return !!row && row.org !== exceptOrgId;
}
