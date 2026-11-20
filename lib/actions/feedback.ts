"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { reviewSuggestion } from "../feedback";
import { here, requireUser } from "../guard";

// Accept or reject a summary suggestion. lib/feedback.ts re-checks that
// the user owns the org that publishes the tool.
export async function reviewSuggestionAction(formData: FormData) {
  const base = await here();
  const user = await requireUser();
  const id = formData.get("id")?.toString() ?? "";
  const decision = formData.get("decision")?.toString();
  if (!id || (decision !== "accepted" && decision !== "rejected")) redirect(`${base}/feedback`);
  const done = await reviewSuggestion(user.id, id, decision);
  revalidatePath(`${base}/feedback`);
  redirect(done ? `${base}/feedback?done=${decision}` : `${base}/feedback?error=gone`);
}
