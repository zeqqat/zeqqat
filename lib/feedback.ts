import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { apiEndpoint, integration, membership, organization, summarySuggestion } from "../db/schema";
import { integrationRef, type FoundEndpoint } from "./catalog";
import { newId } from "./id";
import type { McpContext } from "./mcp-auth";

// Summary suggestions (schema: summary_suggestion). An agent that found
// the right tool the hard way proposes a better one-line summary through
// zeqqat_feedback; owners of the org that publishes the integration accept
// or reject it at /app/feedback. Accepted summaries reach everyone using
// that integration, and catalog imports keep them (lib/catalog-import.ts).
//
// Models read summaries, so a suggestion never goes live without a person,
// and only plain one-line text is taken: no links, no handles, no markup.

export const SUMMARY_MIN = 10;
export const SUMMARY_MAX = 120;
const NOTE_MAX = 300;
const DAILY_LIMIT_PER_ORG = 30;

// Pure: why a proposed summary is refused, or null when it is fine.
export function summaryProblem(summary: string, current: string | null): string | null {
  if (/[\r\n]/.test(summary)) return "summary must be one line.";
  if (summary.length < SUMMARY_MIN || summary.length > SUMMARY_MAX) {
    return `summary must be ${SUMMARY_MIN} to ${SUMMARY_MAX} characters (it is ${summary.length}).`;
  }
  if (/https?:\/\/|www\.|\{\{|\}\}|`|<[a-z/!]/i.test(summary)) return "summary must be plain text: no links, handles, code or markup.";
  if (current && summary.trim().toLowerCase() === current.trim().toLowerCase()) return "That is already the summary.";
  return null;
}

export type Submitted = { id: string; publisher: string; duplicate: boolean };

export async function submitSuggestion(
  ctx: McpContext,
  e: FoundEndpoint,
  summary: string,
  note: string | null,
): Promise<{ ok: true; value: Submitted } | { ok: false; error: string }> {
  const problem = summaryProblem(summary, e.summary);
  if (problem) return { ok: false, error: problem };
  const publisher = `@${e.orgSlug}`;

  const [same] = await db
    .select({ id: summarySuggestion.id })
    .from(summarySuggestion)
    .where(
      and(
        eq(summarySuggestion.apiEndpointId, e.id),
        eq(summarySuggestion.status, "pending"),
        sql`lower(${summarySuggestion.suggestedSummary}) = lower(${summary})`,
      ),
    )
    .limit(1);
  if (same) return { ok: true, value: { id: same.id, publisher, duplicate: true } };

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(summarySuggestion)
    .where(
      and(
        eq(summarySuggestion.fromOrganizationId, ctx.organizationId),
        gte(summarySuggestion.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      ),
    );
  if (n >= DAILY_LIMIT_PER_ORG) return { ok: false, error: "This account has sent the most suggestions allowed today. Try again tomorrow." };

  const id = newId();
  await db.insert(summarySuggestion).values({
    id,
    apiEndpointId: e.id,
    publisherOrganizationId: e.organizationId,
    fromOrganizationId: ctx.organizationId,
    userId: ctx.userId ?? null,
    requestId: ctx.requestId ?? null,
    currentSummary: e.summary,
    suggestedSummary: summary,
    note: note ? note.slice(0, NOTE_MAX) : null,
  });
  return { ok: true, value: { id, publisher, duplicate: false } };
}

// Orgs where this user may review: the ones they own.
export async function reviewableOrgIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: membership.organizationId })
    .from(membership)
    .where(and(eq(membership.userId, userId), eq(membership.role, "owner")));
  return rows.map((r) => r.id);
}

export async function suggestionsFor(orgIds: string[], status: "pending" | "accepted" | "rejected", limit = 100) {
  if (orgIds.length === 0) return [];
  const from = sql`(select slug from organization o where o.id = ${summarySuggestion.fromOrganizationId})`;
  const rows = await db
    .select({
      id: summarySuggestion.id,
      operationId: apiEndpoint.name,
      liveSummary: apiEndpoint.summary,
      currentSummary: summarySuggestion.currentSummary,
      suggestedSummary: summarySuggestion.suggestedSummary,
      note: summarySuggestion.note,
      from: sql<string>`${from}`,
      createdAt: summarySuggestion.createdAt,
      reviewedAt: summarySuggestion.reviewedAt,
      integrationSlug: integration.slug,
      orgSlug: organization.slug,
    })
    .from(summarySuggestion)
    .innerJoin(apiEndpoint, eq(apiEndpoint.id, summarySuggestion.apiEndpointId))
    .innerJoin(integration, eq(integration.id, apiEndpoint.integrationId))
    .innerJoin(organization, eq(organization.id, integration.organizationId))
    .where(and(inArray(summarySuggestion.publisherOrganizationId, orgIds), eq(summarySuggestion.status, status)))
    .orderBy(desc(summarySuggestion.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, integration: integrationRef(r.orgSlug, r.integrationSlug) }));
}

// Accept or reject one pending suggestion. Re-checks on the server that
// the user owns the publishing org. Accepting sets the tool's summary for
// everyone and marks it accepted, so imports keep it.
export async function reviewSuggestion(userId: string, id: string, decision: "accepted" | "rejected"): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [s] = await tx
      .select()
      .from(summarySuggestion)
      .where(and(eq(summarySuggestion.id, id), eq(summarySuggestion.status, "pending")))
      .for("update");
    if (!s) return false;
    const [owner] = await tx
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.userId, userId), eq(membership.organizationId, s.publisherOrganizationId), eq(membership.role, "owner")));
    if (!owner) return false;
    if (decision === "accepted") {
      await tx
        .update(apiEndpoint)
        .set({ summary: s.suggestedSummary, summarySource: "accepted" })
        .where(eq(apiEndpoint.id, s.apiEndpointId));
    }
    await tx
      .update(summarySuggestion)
      .set({ status: decision, reviewedBy: userId, reviewedAt: new Date() })
      .where(eq(summarySuggestion.id, id));
    return true;
  });
}
