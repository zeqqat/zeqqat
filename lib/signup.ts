import { eq } from "drizzle-orm";
import { db } from "../db";
import { newId } from "./id";
import * as schema from "../db/schema";
import { deriveUsername, isReserved } from "./username";
import { heldByOldUsername } from "./username-alias";

const MAX_SUFFIX_ATTEMPTS = 50;

// Runs after Better Auth inserts the user row (see lib/auth.ts's
// databaseHooks.user.create.after). Better Auth's own insert already
// committed by the time this runs, so "one transaction or nothing" is
// enforced at the logical level: this function's own work is one DB
// transaction, and the caller deletes the orphaned user row if it throws.
export async function runSignupTransaction(userId: string, name: string, email: string) {
  const base = deriveUsername(name, email);

  await db.transaction(async (tx) => {
    let slug = base;
    let attempt = 0;
    // Reserved names are treated as an immediate collision. Uniqueness is
    // checked inside the transaction, not before it, so two concurrent
    // signups with the same derived name can't both pick the same slug.
    while (attempt < MAX_SUFFIX_ATTEMPTS) {
      const candidate = attempt === 0 ? slug : `${base}_${attempt + 1}`;
      if (!isReserved(candidate)) {
        const existing = await tx.query.organization.findFirst({
          where: eq(schema.organization.slug, candidate),
        });
        if (!existing && !(await heldByOldUsername(candidate, tx))) {
          slug = candidate;
          break;
        }
      }
      attempt++;
      if (attempt === MAX_SUFFIX_ATTEMPTS) {
        throw new Error(`Could not find a free namespace derived from "${base}"`);
      }
    }

    const organizationId = newId();
    await tx.insert(schema.organization).values({
      id: organizationId,
      slug,
      displayName: slug,
      kind: "personal",
      ownerUserId: userId,
    });

    const workspaceId = newId();
    await tx.insert(schema.workspace).values({
      id: workspaceId,
      organizationId,
      slug: "default",
      name: "Default",
    });

    await tx.insert(schema.membership).values({
      id: newId(),
      userId,
      organizationId,
      role: "owner",
    });
  });
}
