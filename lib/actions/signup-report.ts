"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { user as userTable } from "../../db/schema";
import { getServerSession } from "../session";

// Called by components/SignupBeacon.tsx once Umami has the "signup" event.
// Only ever sets the date once, so the event is never counted twice.
export async function markSignupReported(): Promise<void> {
  const session = await getServerSession();
  if (!session?.user) return;
  await db
    .update(userTable)
    .set({ signupReportedAt: new Date() })
    .where(and(eq(userTable.id, session.user.id), isNull(userTable.signupReportedAt)));
}
