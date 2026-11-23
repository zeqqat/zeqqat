import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { cloudHandoff } from "../db/schema";

// On a Zeqqat installed from zeqqat.com: the key zeqqat.com still holds for
// the instance. The first thing the owner sees after signing in here is
// whether to keep it or delete it from Dokploy (app/[org]/(account)/setup,
// components/CloudKeyCard.tsx). The choice goes to zeqqat.com with the
// claim token (app/api/selfhost/key there), which does the deleting with
// its own key. Asked here, never on zeqqat.com before the claim, because
// deleting it before you're in your own Zeqqat would cut you off.

export type PendingHandoff = {
  id: string;
  cloudHost: string;
  instanceAlias: string;
  hint: { start: string; end: string } | null;
};

export async function pendingHandoff(userId: string): Promise<PendingHandoff | null> {
  const [row] = await db
    .select({ id: cloudHandoff.id, cloudHost: cloudHandoff.cloudHost, instanceAlias: cloudHandoff.instanceAlias, hint: cloudHandoff.cloudKeyHint })
    .from(cloudHandoff)
    .where(and(eq(cloudHandoff.ownerUserId, userId), isNull(cloudHandoff.choice)))
    .limit(1);
  return row ?? null;
}
