"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../../db";
import { apiEndpoint, integration, organization } from "../../db/schema";
import { reviewableOrgIds, submitSuggestion, summaryProblem } from "../feedback";
import { here, hereAccount, requireWorkspace } from "../guard";
import { KINDS, type Kind } from "../integrations";

type Result = { ok: true; note?: string } | { ok: false; error: string };

async function endpointWithOrg(id: string) {
  const [row] = await db
    .select({
      id: apiEndpoint.id,
      summary: apiEndpoint.summary,
      kind: apiEndpoint.kind,
      organizationId: integration.organizationId,
      orgSlug: organization.slug,
    })
    .from(apiEndpoint)
    .innerJoin(integration, eq(integration.id, apiEndpoint.integrationId))
    .innerJoin(organization, eq(organization.id, integration.organizationId))
    .where(eq(apiEndpoint.id, id))
    .limit(1);
  return row ?? null;
}

const isKind = (k: string): k is Kind => (KINDS as readonly string[]).includes(k);

// The publisher (an owner of the org that publishes the integration) sets a
// tool's summary and kind. Both are marked accepted so a later import of the
// spec never puts the old ones back.
export async function updateToolAction(id: string, summary: string, kind: string): Promise<Result> {
  const base = await here();
  const acct = await hereAccount();
  const { user } = await requireWorkspace();
  const e = await endpointWithOrg(id);
  if (!e) return { ok: false, error: "That tool is gone." };
  if (!(await reviewableOrgIds(user.id)).includes(e.organizationId)) return { ok: false, error: "Only its publisher can change this tool." };
  if (!isKind(kind)) return { ok: false, error: "Pick a kind." };
  const s = summary.trim();
  const changedSummary = s !== (e.summary ?? "");
  if (changedSummary) {
    const problem = summaryProblem(s, null);
    if (problem) return { ok: false, error: problem[0].toUpperCase() + problem.slice(1) };
  }
  await db
    .update(apiEndpoint)
    .set({
      ...(changedSummary ? { summary: s, summarySource: "accepted" } : {}),
      ...(kind !== e.kind ? { kind, kindSource: "accepted" } : {}),
    })
    .where(eq(apiEndpoint.id, id));
  revalidatePath(`${base}/dokploy-integrations`, "layout");
  revalidatePath(`${acct}/dokploy-integrations`, "layout");
  return { ok: true };
}

// Anyone else suggests a fix; it lands in the publisher's review queue
// (<workspace>/feedback). A different kind goes along as the note.
export async function suggestToolAction(id: string, summary: string, kind: string): Promise<Result> {
  const { user, ws } = await requireWorkspace();
  const e = await endpointWithOrg(id);
  if (!e) return { ok: false, error: "That tool is gone." };
  if (!isKind(kind)) return { ok: false, error: "Pick a kind." };
  const s = summary.trim();
  const kindNote = kind !== e.kind ? `Kind should be ${kind}, not ${e.kind}.` : null;
  if (s === (e.summary ?? "") && !kindNote) return { ok: false, error: "Change the description or the kind first." };
  // The queue holds summaries: a kind-only suggestion keeps the current one
  // and says what's wrong in the note.
  const proposed = s === (e.summary ?? "") ? `${s} (kind: ${kind})` : s;
  const r = await submitSuggestion({ organizationId: ws.organizationId, userId: user.id, requestId: null }, e, proposed, kindNote);
  if (!r.ok) return { ok: false, error: r.error[0].toUpperCase() + r.error.slice(1) };
  return { ok: true, note: `Sent to ${r.value.publisher}` };
}
