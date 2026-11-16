import { eq } from "drizzle-orm";
import { db } from "../db";
import { user as userTable } from "../db/schema";
import { getServerSession } from "./session";

// Accounts older than this are never reported: it keeps people who signed
// up before the event existed out of the count.
export const SIGNUP_REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Pure rule, tested on its own.
export function shouldReportSignup(u: { createdAt: Date; signupReportedAt: Date | null }, now = Date.now()): boolean {
  return u.signupReportedAt === null && now - u.createdAt.getTime() < SIGNUP_REPORT_WINDOW_MS;
}

// Whether the signed-in person's sign-up still has to reach Umami.
// Analytics must never break a page, so any failure means "no".
export async function signupToReport(): Promise<boolean> {
  try {
    const session = await getServerSession();
    if (!session?.user) return false;
    const u = await db.query.user.findFirst({
      columns: { createdAt: true, signupReportedAt: true },
      where: eq(userTable.id, session.user.id),
    });
    return !!u && shouldReportSignup(u);
  } catch {
    return false;
  }
}
