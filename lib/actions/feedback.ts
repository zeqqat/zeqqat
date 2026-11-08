"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { reviewSuggestion } from "../feedback";
import { requireUser } from "../guard";

// Accept or reject a summary suggestion. lib/feedback.ts re-checks that
// the user owns the org that publishes the tool.
export async function reviewSuggestionAction(formData: FormData) {
  const user = await requireUser();
  const id = formData.get("id")?.toString() ?? "";
  const decision = formData.get("decision")?.toString();
  if (!id || (decision !== "accepted" && decision !== "rejected")) redirect("/app/feedback");
  const done = await reviewSuggestion(user.id, id, decision);
  revalidatePath("/app/feedback");
  redirect(done ? `/app/feedback?done=${decision}` : "/app/feedback?error=gone");
}
