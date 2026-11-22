import { eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { instance } from "../db/schema";
import { decryptCredential } from "./crypto";
import { keyHint } from "./key-hint";

// Keys saved before key hints existed get theirs once, on start. A key that
// can't be decrypted (a changed ZEQQAT_ENCRYPTION_KEY) is left without one.
export async function backfillKeyHints() {
  const rows = await db.select({ id: instance.id, credential: instance.credential }).from(instance).where(isNull(instance.keyHint));
  for (const r of rows) {
    try {
      await db.update(instance).set({ keyHint: keyHint(decryptCredential(r.credential)) }).where(eq(instance.id, r.id));
    } catch {
      // leave it; the page then shows no summary for that key
    }
  }
}
